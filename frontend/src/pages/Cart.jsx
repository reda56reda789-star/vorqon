// Cart + checkout — signed-in users: GET /api/cart,
// DELETE /api/cart/items/:id, the address book (GET /api/addresses —
// the default address is pre-selected and its id goes to checkout,
// which validates ownership server-side), and POST /api/orders/checkout
// (server prices the cart and splits the order per seller). Guests get
// the localStorage cart + guest checkout form (components/GuestCart.jsx,
// POST /api/orders/guest) instead of a sign-in wall.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, getSessionUser, pickName } from '../lib/api.js';
import { formatPrice } from '../components/ProductCard.jsx';
import GuestCart from '../components/GuestCart.jsx';

const CURRENCIES = ['EGP', 'USD', 'SAR', 'AED'];

export default function Cart() {
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
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const d = await apiFetch('/api/cart');
      setItems(d.items || []);
      setSubtotal(d.subtotal || 0);
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadAddresses() {
    try {
      const d = await apiFetch('/api/addresses');
      const list = d.addresses || [];
      setAddresses(list);
      const def = list.find((a) => a.isDefault) || list[0];
      if (def) setAddressId(def.id);
    } catch { /* the address book is optional at checkout */ }
  }

  useEffect(() => {
    if (sessionUser) { load(); loadAddresses(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser]);

  async function remove(id) {
    try {
      await apiFetch(`/api/cart/items/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function checkout(e) {
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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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
      ) : items.length === 0 ? (
        <section className="panel"><p>{t('emptyCart')}</p></section>
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
                      <td>{it.quantity}</td>
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
            <form onSubmit={checkout} className="form">
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
              <button type="submit" className="btn-gold btn-block" disabled={busy}>{t('checkout')}</button>
            </form>
          </aside>
        </div>
      )}
    </main>
  );
}
