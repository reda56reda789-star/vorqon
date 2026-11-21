// Checkout page (/checkout) — the dedicated final step, separate from
// the cart page. Signed-in users: the SERVER cart (GET /api/cart) with
// the address book (GET /api/addresses — the default address is
// pre-selected and its id goes to checkout, which validates ownership
// server-side) and POST /api/orders/checkout (server prices the cart
// and splits the order per seller). Guests get the guest checkout
// (components/GuestCart.jsx). This page must never render blank:
// loading, fetch-error (with retry), and empty-cart states are all
// explicit.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, getSessionUser, pickName, SESSION_EVENT } from '../lib/api.js';
import { formatPrice } from '../components/ProductCard.jsx';
import GuestCart from '../components/GuestCart.jsx';
import ListError from '../components/ListError.jsx';

const CURRENCIES = ['EGP', 'USD', 'SAR', 'AED'];

export default function Checkout() {
  const { t, i18n } = useTranslation();
  const [sessionUser] = useState(getSessionUser());
  const [items, setItems] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [currency, setCurrency] = useState('EGP');
  const [coupon, setCoupon] = useState('');
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState('');
  const [placed, setPlaced] = useState(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!sessionUser) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const d = await apiFetch('/api/cart');
        if (cancelled) return;
        setItems(d.items || []);
        setSubtotal(d.subtotal || 0);
      } catch (e) {
        if (!cancelled) setLoadError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
      try {
        const d = await apiFetch('/api/addresses');
        if (cancelled) return;
        const list = d.addresses || [];
        setAddresses(list);
        const def = list.find((a) => a.isDefault) || list[0];
        if (def) setAddressId(def.id);
      } catch { /* the address book is optional at checkout */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser, reloadKey]);

  async function placeOrder(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await apiFetch('/api/orders/checkout', {
        method: 'POST',
        body: {
          currency,
          ...(addressId ? { address_id: addressId } : {}),
          ...(coupon.trim() ? { coupon_code: coupon.trim() } : {}),
        },
      });
      setPlaced(d);
      setItems([]);
      setSubtotal(0);
      // The order consumed the cart server-side; re-sync the header
      // badge (App.jsx refetches the cart count on SESSION_EVENT) so
      // it does not keep showing the pre-order count.
      window.dispatchEvent(new Event(SESSION_EVENT));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!sessionUser) {
    return (
      <main className="container page">
        <h1>{t('checkout')}</h1>
        <GuestCart />
      </main>
    );
  }

  return (
    <main className="container page">
      <h1>{t('checkout')}</h1>
      {error && <p className="error-text">{error}</p>}
      {placed ? (
        <section className="panel">
          <p className="notice-text" style={{ fontWeight: 700 }}>{t('orderPlaced')}</p>
          <p>{t('orderNumber')}: {placed.parentOrder?.orderNumber} — {placed.parentOrder?.grandTotal}</p>
          <ul className="plain-list">
            {(placed.subOrders || []).map((s) => (
              <li key={s.id}>{t('subOrder')}: {s.orderNumber} — {s.grandTotal}</li>
            ))}
          </ul>
          <p><Link to="/account">{t('myOrders')}</Link></p>
        </section>
      ) : loading ? (
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
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>{pickName(it, i18n.language)}</td>
                      <td>{formatPrice(it.price)} {it.currency}</td>
                      <td>{it.quantity}</td>
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
            <form onSubmit={placeOrder} className="form">
              {addresses.length > 0 ? (
                <label>
                  {t('deliveryAddress')}
                  <select value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} — {a.city}، {a.street} ({a.fullName})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p style={{ margin: 0 }}>
                  <Link to="/account">{t('addAddress')}</Link>
                </p>
              )}
              <label>
                {t('currency')}
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>
                {t('couponCode')}
                <input value={coupon} onChange={(e) => setCoupon(e.target.value)} />
              </label>
              <button type="submit" className="btn-gold btn-block" disabled={busy}>{t('placeOrder')}</button>
            </form>
          </aside>
        </div>
      )}
    </main>
  );
}
