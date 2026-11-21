// Cart page — signed-in users: the SERVER cart (GET /api/cart,
// PATCH/DELETE /api/cart/items/:id for quantities and removal). This
// page never places an order: its checkout button navigates to the
// dedicated /checkout page, where the delivery address is chosen, a
// coupon can be applied, and the order is confirmed
// (POST /api/orders/checkout). Guests get the localStorage cart +
// guest checkout form (components/GuestCart.jsx, POST
// /api/orders/guest) instead of a sign-in wall.
//
// The signed-in cart renders four distinct states — loading, fetch
// error (with retry), loaded-empty, loaded-with-items — so a slow
// first fetch can never flash "your cart is empty" at a user whose
// cart actually has items. The guest path reads localStorage
// synchronously, so its empty state is only ever the true one.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, getSessionUser, pickName, SESSION_EVENT } from '../lib/api.js';
import { formatPrice } from '../components/ProductCard.jsx';
import GuestCart from '../components/GuestCart.jsx';
import ListError from '../components/ListError.jsx';

export default function Cart() {
  const { t, i18n } = useTranslation();
  const [sessionUser] = useState(getSessionUser());
  const [items, setItems] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [error, setError] = useState('');
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
    if (!sessionUser) { setLoading(false); return; }
    setLoading(true);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser, reloadKey]);

  async function remove(id) {
    try {
      await apiFetch(`/api/cart/items/${id}`, { method: 'DELETE' });
      await load();
      window.dispatchEvent(new Event(SESSION_EVENT));
    } catch (e) {
      setError(e.message);
    }
  }

  async function setQuantity(item, quantity) {
    const qty = Math.max(1, Math.floor(Number(quantity)) || 1);
    if (qty === item.quantity) return;
    try {
      await apiFetch(`/api/cart/items/${item.id}`, { method: 'PATCH', body: { quantity: qty } });
      await load();
      window.dispatchEvent(new Event(SESSION_EVENT));
    } catch (e) {
      setError(e.message);
    }
  }

  if (!sessionUser) {
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
      {error && <p className="error-text">{error}</p>}
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
          <section className="panel">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('products')}</th>
                    <th>{t('price')}</th>
                    <th>{t('quantity')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>{pickName(it, i18n.language)}</td>
                      <td>{formatPrice(it.price)} {it.currency}</td>
                      <td>
                        <span className="qty-stepper">
                          <button type="button" aria-label="-" onClick={() => setQuantity(it, it.quantity - 1)}>−</button>
                          <span className="qty-value">{it.quantity}</span>
                          <button type="button" aria-label="+" onClick={() => setQuantity(it, it.quantity + 1)}>+</button>
                        </span>
                      </td>
                      <td><button className="btn-small" onClick={() => remove(it.id)}>{t('remove')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <aside className="panel cart-summary">
            <div className="summary-row">
              <span>{t('subtotal')}:</span>
              <span className="summary-total">{formatPrice(subtotal)}</span>
            </div>
            <Link to="/checkout" className="btn-gold btn-block" style={{ marginTop: 16, textAlign: 'center' }}>
              {t('checkout')}
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}
