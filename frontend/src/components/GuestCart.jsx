// Guest cart page — renders the localStorage guest cart (quantities,
// remove, totals) and the guest checkout form (name, mobile, city,
// address, optional notes, cash on delivery). Submitting posts to
// POST /api/orders/guest, which prices everything server-side and
// splits the order per seller; on success the local cart is cleared.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, pickName } from '../lib/api.js';
import {
  getGuestCart, setGuestQuantity, removeFromGuestCart, clearGuestCart,
} from '../lib/guestCart.js';
import { formatPrice } from './ProductCard.jsx';

// Same rule as the API: an Egyptian mobile, 11 digits starting 01
// (+20 / 0020 prefixes accepted and normalised by the server).
function validPhone(raw) {
  let s = String(raw || '').replace(/[\s-]/g, '');
  if (s.startsWith('+20')) s = '0' + s.slice(3);
  else if (s.startsWith('0020')) s = '0' + s.slice(4);
  return /^01\d{9}$/.test(s);
}

export default function GuestCart() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState(getGuestCart());
  const [form, setForm] = useState({ name: '', phone: '', city: '', address: '', notes: '' });
  const [placed, setPlaced] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const subtotal = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
  const currency = items[0]?.currency || 'EGP';

  function refresh() { setItems(getGuestCart()); }
  function setQty(id, qty) { setGuestQuantity(id, qty); refresh(); }
  function remove(id) { removeFromGuestCart(id); refresh(); }
  function field(k) {
    return {
      value: form[k],
      onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })),
    };
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.city.trim() || !form.address.trim()) {
      setError(t('requiredField'));
      return;
    }
    if (!validPhone(form.phone)) {
      setError(t('phoneInvalid'));
      return;
    }
    setBusy(true);
    try {
      const d = await apiFetch('/api/orders/guest', {
        method: 'POST',
        body: {
          customer: {
            name: form.name.trim(), phone: form.phone.trim(),
            city: form.city.trim(), address: form.address.trim(),
            ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
          },
          items: items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
        },
      });
      setPlaced(d);
      clearGuestCart();
      setItems([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (placed) {
    return (
      <section className="panel">
        <p className="notice-text" style={{ fontWeight: 700 }}>{t('orderPlaced')}</p>
        <p>{t('orderNumber')}: {placed.parentOrder?.orderNumber} — {formatPrice(placed.parentOrder?.grandTotal)} {currency}</p>
        <ul className="plain-list">
          {(placed.subOrders || []).map((s) => (
            <li key={s.id}>{t('subOrder')}: {s.orderNumber} — {formatPrice(s.grandTotal)} {currency}</li>
          ))}
        </ul>
        <p>{t('cashOnDelivery')}</p>
        <p><Link to="/">{t('browseCategories')}</Link></p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="panel">
        <p>{t('emptyCart')}</p>
        <p>{t('haveAccount')} <Link to="/login">{t('signIn')}</Link></p>
      </section>
    );
  }

  return (
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
                <tr key={it.productId}>
                  <td>
                    <Link to={`/product/${it.slug}`}>{pickName(it, i18n.language)}</Link>
                  </td>
                  <td>{formatPrice(it.price)} {it.currency}</td>
                  <td>
                    <span className="qty-stepper">
                      <button type="button" aria-label="-" onClick={() => setQty(it.productId, it.quantity - 1)}>−</button>
                      <span className="qty-value">{it.quantity}</span>
                      <button type="button" aria-label="+" onClick={() => setQty(it.productId, it.quantity + 1)}>+</button>
                    </span>
                  </td>
                  <td><button className="btn-small" onClick={() => remove(it.productId)}>{t('remove')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <aside className="panel cart-summary">
        <div className="summary-row">
          <span>{t('subtotal')}:</span>
          <span className="summary-total">{formatPrice(subtotal)} {currency}</span>
        </div>
        <h2 style={{ marginTop: 16 }}>{t('guestCheckout')}</h2>
        <p>{t('guestCheckoutNote')}</p>
        {error && <p className="error-text">{error}</p>}
        <form onSubmit={submit} className="form">
          <label>
            {t('fullName')}
            <input required {...field('name')} />
          </label>
          <label>
            {t('phone')}
            <input required inputMode="tel" placeholder="01xxxxxxxxx" {...field('phone')} />
          </label>
          <label>
            {t('city')}
            <input required {...field('city')} />
          </label>
          <label>
            {t('address')}
            <input required {...field('address')} />
          </label>
          <label>
            {t('notes')}
            <textarea rows={2} {...field('notes')} />
          </label>
          <div>
            <span className="dl-key">{t('paymentMethod')}</span>
            <label className="pay-option">
              <input type="radio" name="pay" checked readOnly />
              {t('cashOnDelivery')}
            </label>
          </div>
          <button type="submit" className="btn-gold btn-block" disabled={busy}>{t('placeOrder')}</button>
        </form>
        <p>{t('haveAccount')} <Link to="/login">{t('signIn')}</Link></p>
      </aside>
    </div>
  );
}
