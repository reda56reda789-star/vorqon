import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getGuestCart, setGuestQuantity, removeFromGuestCart } from '../lib/guestCart.js';
import CartItems, { ShoppingSummary } from './CartItems.jsx';

export default function GuestCart() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState(getGuestCart());
  const [error, setError] = useState('');
  const subtotal = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
  const ar = i18n.language === 'ar';
  function change(action) {
    setError('');
    try { action(); setItems(getGuestCart()); }
    catch { setError(ar ? 'تعذّر تحديث السلة. حاول مرة أخرى.' : 'Could not update the cart. Please try again.'); }
  }
  if (!items.length) return <section className="panel shopping-empty"><h2>{t('emptyCart')}</h2><Link className="btn-gold" to="/search">{ar ? 'تصفّح المنتجات' : 'Browse products'}</Link></section>;
  return <>
    {error && <p role="alert" className="error-text">{error}</p>}
    <div className="cart-layout">
      <CartItems items={items} itemKey={it=>it.productId} onQuantity={(it,q)=>change(()=>setGuestQuantity(it.productId,q))} onRemove={id=>change(()=>removeFromGuestCart(id))}/>
      <ShoppingSummary subtotal={subtotal} currency={items[0]?.currency || 'EGP'}><Link className="btn-gold btn-block" to="/checkout">{ar ? 'مراجعة السلة' : 'Review cart'}</Link></ShoppingSummary>
    </div>
  </>;
}
