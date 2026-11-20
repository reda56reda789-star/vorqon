// Customer account — profile (GET /api/auth/me) + my orders
// (GET /api/orders, detail via GET /api/orders/:id with sub-orders + items).
// Note: the API has no address-book or wishlist endpoints yet, so those
// sections are intentionally absent here (see docs/API.md).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, getSessionUser, pickName } from '../lib/api.js';

function ItemsList({ items, lang }) {
  if (!items?.length) return null;
  return (
    <ul className="plain-list">
      {items.map((it) => (
        <li key={it.id}>
          {pickName(it, lang)} × {it.quantity} — {it.unitPrice} × {it.quantity} = {it.lineTotal}
        </li>
      ))}
    </ul>
  );
}

export default function Account() {
  const { t, i18n } = useTranslation();
  const [sessionUser] = useState(getSessionUser());
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionUser) return;
    apiFetch('/api/auth/me').then((d) => setProfile(d.user)).catch((e) => setError(e.message));
    apiFetch('/api/orders').then((d) => setOrders(d.orders || [])).catch((e) => setError(e.message));
  }, [sessionUser]);

  async function openOrder(id) {
    try {
      const d = await apiFetch(`/api/orders/${id}`);
      setDetail(d.order);
    } catch (e) {
      setError(e.message);
    }
  }

  if (!sessionUser) {
    return (
      <main className="container page">
        <h1>{t('account')}</h1>
        <p>{t('signInRequired')} <Link to="/login">{t('signIn')}</Link></p>
      </main>
    );
  }

  return (
    <main className="container page">
      <h1>{t('account')}</h1>
      {error && <p className="error-text">{error}</p>}

      <section className="panel">
        <h2>{t('profile')}</h2>
        {profile ? (
          <ul className="stat-list">
            <li><b>{t('fullName')}:</b> {profile.fullName}</li>
            <li><b>{t('email')}:</b> {profile.email}</li>
            <li><b>{t('role')}:</b> {t(`role_${profile.role}`)}</li>
            <li><b>{t('language')}:</b> {profile.language}</li>
            <li><b>{t('currency')}:</b> {profile.currency}</li>
          </ul>
        ) : <p>{t('loading')}</p>}
      </section>

      <section className="panel">
        <h2>{t('myOrders')}</h2>
        {orders.length === 0 ? <p>{t('noOrders')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('orderNumber')}</th>
                  <th>{t('status')}</th>
                  <th>{t('total')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderNumber}</td>
                    <td>{o.status}</td>
                    <td>{o.grandTotal} {o.currency}</td>
                    <td><button className="btn-small" onClick={() => openOrder(o.id)}>{t('viewDetails')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detail && (
          <div style={{ marginTop: 20 }}>
            <h3>{t('orderDetails')}: {detail.orderNumber}</h3>
            <p>{t('status')}: {detail.status} — {t('total')}: {detail.grandTotal} {detail.currency}</p>
            <ItemsList items={detail.items} lang={i18n.language} />
            {(detail.children || []).map((child) => (
              <div key={child.id} style={{ marginTop: 12 }}>
                <h4>{t('subOrder')}: {child.orderNumber} — {child.grandTotal} {child.currency}</h4>
                <ItemsList items={child.items} lang={i18n.language} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
