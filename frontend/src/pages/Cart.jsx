// Cart + checkout — GET /api/cart, DELETE /api/cart/items/:id, and
// POST /api/orders/checkout (server prices the cart and splits the order
// per seller; address_id is optional in the API and omitted here because
// there is no address-book endpoint yet).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, getSessionUser, pickName } from '../lib/api.js';

const CURRENCIES = ['EGP', 'USD', 'SAR', 'AED'];

export default function Cart() {
  const { t, i18n } = useTranslation();
  const [sessionUser] = useState(getSessionUser());
  const [items, setItems] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [currency, setCurrency] = useState('EGP');
  const [coupon, setCoupon] = useState('');
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

  useEffect(() => {
    if (sessionUser) load();
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
        body: { currency, ...(coupon.trim() ? { coupon_code: coupon.trim() } : {}) },
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
      <main style={{ padding: 16 }}>
        <h1>{t('cart')}</h1>
        <p>{t('signInRequired')} <Link to="/login">{t('signIn')}</Link></p>
      </main>
    );
  }

  return (
    <main style={{ padding: 16 }}>
      <h1>{t('cart')}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {placed ? (
        <section>
          <p>{t('orderPlaced')}</p>
          <p>{t('orderNumber')}: {placed.parentOrder?.orderNumber} — {placed.parentOrder?.grandTotal}</p>
          <ul>
            {(placed.subOrders || []).map((s) => (
              <li key={s.id}>{t('subOrder')}: {s.orderNumber} — {s.grandTotal}</li>
            ))}
          </ul>
          <p><Link to="/account">{t('myOrders')}</Link></p>
        </section>
      ) : items.length === 0 ? (
        <p>{t('emptyCart')}</p>
      ) : (
        <>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: 6, textAlign: 'start' }}>{t('products')}</th>
                <th style={{ padding: 6, textAlign: 'start' }}>{t('price')}</th>
                <th style={{ padding: 6, textAlign: 'start' }}>{t('quantity')}</th>
                <th style={{ padding: 6, textAlign: 'start' }}>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td style={{ padding: 6 }}>{pickName(it, i18n.language)}</td>
                  <td style={{ padding: 6 }}>{it.price} {it.currency}</td>
                  <td style={{ padding: 6 }}>{it.quantity}</td>
                  <td style={{ padding: 6 }}><button onClick={() => remove(it.id)}>{t('remove')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{t('subtotal')}: {subtotal}</p>
          <form onSubmit={checkout} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
            <label>
              {t('currency')}
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ display: 'block', padding: 8 }}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              {t('couponCode')}
              <input value={coupon} onChange={(e) => setCoupon(e.target.value)} style={{ display: 'block', padding: 8 }} />
            </label>
            <button type="submit" disabled={busy} style={{ padding: 10 }}>{t('checkout')}</button>
          </form>
        </>
      )}
    </main>
  );
}
