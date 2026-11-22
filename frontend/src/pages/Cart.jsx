// Cart review only. Server cart with an access token, local cart otherwise.
// The signed-in cart renders four distinct states — loading, fetch
// error (with retry), loaded-empty, loaded-with-items — so a slow
// first fetch can never flash "your cart is empty" at a user whose
// cart actually has items. The guest path reads localStorage
// synchronously, so its empty state is only ever the true one.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, hasAuthToken, SESSION_EVENT } from '../lib/api.js';
import GuestCart from '../components/GuestCart.jsx';
import ListError from '../components/ListError.jsx';
import CartItems, { ShoppingSummary } from '../components/CartItems.jsx';

export default function Cart() {
  const { t, i18n } = useTranslation();
  const [signedIn, setSignedIn] = useState(hasAuthToken);
  useEffect(() => { const sync=()=>setSignedIn(hasAuthToken()); window.addEventListener(SESSION_EVENT,sync); return ()=>window.removeEventListener(SESSION_EVENT,sync); },[]);
  const [items, setItems] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  async function load(initial = false) {
    try {
      const d = await apiFetch('/api/cart');
      setItems(d.items || []);
      setSubtotal(d.subtotal || 0);
      setLoadError('');
    } catch (e) {
      // A failed first load gets the full error state (with retry); a
      // failed refresh after a mutation keeps the items on screen and
      // reports inline instead.
      if (initial) setLoadError(e.message);
      else setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!signedIn) { setLoading(false); return; }
    setLoading(true);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, reloadKey]);

  async function remove(id) {
    if (updating) return;
    setUpdating(true); setError('');
    try {
      await apiFetch(`/api/cart/items/${id}`, { method: 'DELETE' });
      await load();
      window.dispatchEvent(new Event(SESSION_EVENT));
    } catch (e) {
      setError(e.message);
    } finally { setUpdating(false); }
  }

  async function setQuantity(item, quantity) {
    const qty = Math.max(1, Math.floor(Number(quantity)) || 1);
    if (qty === item.quantity || updating) return;
    setUpdating(true); setError('');
    try {
      await apiFetch(`/api/cart/items/${item.id}`, { method: 'PATCH', body: { quantity: qty } });
      await load();
      window.dispatchEvent(new Event(SESSION_EVENT));
    } catch (e) {
      setError(e.message);
    } finally { setUpdating(false); }
  }

  if (!signedIn) {
    return (
      <main className="container page">
        <h1>{t('cart')}</h1>
        <GuestCart />
      </main>
    );
  }

  return (
    <main className="container page">
      <h1>{t('cart')}</h1>
      {error && <p className="error-text" role="alert">{error}</p>}
      {loading ? (
        <p>{t('loading')}</p>
      ) : loadError ? (
        <ListError message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : items.length === 0 ? (
        <section className="panel">
          <p>{t('emptyCart')}</p>
          <p><Link to="/">{t('browseCategories')}</Link></p>
        </section>
      ) : (
        <div className="cart-layout">
          <CartItems items={items} itemKey={it=>it.id} onQuantity={setQuantity} onRemove={remove} busy={updating}/>
          <ShoppingSummary subtotal={subtotal} currency={items[0]?.currency || 'EGP'}>
            <Link to="/checkout" className="btn-gold btn-block">{i18n.language === 'ar' ? 'مراجعة السلة' : 'Review cart'}</Link>
          </ShoppingSummary>
        </div>
      )}
    </main>
  );
          }
