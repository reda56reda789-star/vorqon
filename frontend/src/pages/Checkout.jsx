import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, hasAuthToken, SESSION_EVENT } from '../lib/api.js';
import { getGuestCart } from '../lib/guestCart.js';
import CartItems, { ShoppingSummary } from '../components/CartItems.jsx';
import ListError from '../components/ListError.jsx';

// Browsing-only review: there is deliberately no order POST or personal-data
// form in this release. The backend separately rejects both order entry routes.
export default function Checkout() {
  const { t, i18n } = useTranslation(); const ar = i18n.language === 'ar';
  const [signedIn,setSignedIn] = useState(hasAuthToken);
  useEffect(()=>{const sync=()=>setSignedIn(hasAuthToken());window.addEventListener(SESSION_EVENT,sync);return ()=>window.removeEventListener(SESSION_EVENT,sync);},[]);
  const [items,setItems] = useState([]); const [loading,setLoading] = useState(true);
  const [error,setError] = useState(false); const [retry,setRetry] = useState(0);
  useEffect(()=>{
    let live=true; setLoading(true); setError(false);
    const load = signedIn ? apiFetch('/api/cart').then(d=>d.items||[]) : Promise.resolve(getGuestCart());
    load.then(rows=>{if(live)setItems(rows)}).catch(()=>{if(live)setError(true)}).finally(()=>{if(live)setLoading(false)});
    return ()=>{live=false};
  },[retry,signedIn]);
  const subtotal=items.reduce((s,it)=>s+Number(it.price)*Number(it.quantity),0);
  return <main className="container page">
    <h1>{ar ? 'مراجعة السلة' : 'Review cart'}</h1>
    <section className="panel ordering-paused" role="status"><h2>{ar ? 'استقبال الطلبات متوقف مؤقتًا' : 'Ordering is temporarily paused'}</h2><p>{ar ? 'نجهّز الشحن قبل فتح البيع. يمكنك التصفّح وتعديل السلة، لكن لا يمكن إرسال طلب أو دفع أي مبلغ حاليًا.' : 'Shipping is being prepared before sales open. You can browse and edit your cart, but no order or payment can be submitted for now.'}</p></section>
    {loading ? <p>{t('loading')}</p> : error ? <ListError onRetry={()=>setRetry(v=>v+1)}/> : !items.length ? <section className="panel shopping-empty"><p>{t('emptyCart')}</p><Link className="btn-gold" to="/search">{ar ? 'تصفّح المنتجات' : 'Browse products'}</Link></section> : <div className="cart-layout">
      <CartItems items={items} itemKey={it=>it.id||it.productId} readOnly/>
      <ShoppingSummary subtotal={subtotal} currency={items[0]?.currency||'EGP'}><Link className="btn-gold btn-block" to="/cart">{ar ? 'تعديل السلة' : 'Edit cart'}</Link><button type="button" className="btn-block order-paused-button" disabled>{ar ? 'تأكيد الطلب غير متاح حاليًا' : 'Order confirmation is unavailable'}</button></ShoppingSummary>
    </div>}
  </main>;
}
