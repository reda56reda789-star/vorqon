// Admin Orders — every parent order (GET /api/admin/orders) with a
// status filter and per-order status change
// (PATCH /api/admin/orders/:id/status). Guest orders are badged and
// show the guest's name + mobile; registered orders show the account
// name. An empty result and a failed fetch both render a message —
// this page never renders blank.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, getSessionUser, pickName } from '../lib/api.js';

const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded', 'returned'];
const PAGE_SIZE = 50;

export default function AdminOrders() {
  const { t, i18n } = useTranslation();
  const [sessionUser] = useState(getSessionUser());
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updatingId, setUpdatingId] = useState('');

  const isAdminUser = sessionUser && (sessionUser.role === 'admin' || sessionUser.role === 'staff');

  async function load(filter, pageNum) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_SIZE) });
      if (filter) params.set('status', filter);
      const d = await apiFetch(`/api/admin/orders?${params.toString()}`);
      setOrders(d.orders || []);
      setTotal(d.total || 0);
      setError('');
    } catch (e) {
      setOrders([]);
      setTotal(0);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdminUser) return;
    load(status, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminUser]);

  async function changeFilter(e) {
    const next = e.target.value;
    setStatus(next);
    setPage(1);
    setNotice('');
    await load(next, 1);
  }

  async function changePage(nextPage) {
    setPage(nextPage);
    await load(status, nextPage);
  }

  async function changeStatus(order, nextStatus) {
    if (nextStatus === order.status) return;
    setError('');
    setNotice('');
    setUpdatingId(order.id);
    try {
      await apiFetch(`/api/admin/orders/${order.id}/status`, { method: 'PATCH', body: { status: nextStatus } });
      setNotice(t('done'));
      await load(status, page);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingId('');
    }
  }

  if (!sessionUser) {
    return (
      <main className="container page">
        <h1>{t('orders')}</h1>
        <p>{t('signInRequired')} <Link to="/login">{t('signIn')}</Link></p>
      </main>
    );
  }
  if (!isAdminUser) {
    return (
      <main className="container page">
        <h1>{t('orders')}</h1>
        <p>{t('adminOnly')}</p>
      </main>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="container page">
      <h1>{t('orders')}</h1>
      <p><Link to="/admin">← {t('adminDashboard')}</Link></p>
      {error && <p className="error-text">{error}</p>}
      {notice && <p className="notice-text">{notice}</p>}

      <section className="panel">
        <label style={{ maxWidth: 260 }}>
          {t('status')}
          <select value={status} onChange={changeFilter}>
            <option value="">—</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        {loading ? <p style={{ marginTop: 12 }}>{t('loading')}</p> : orders.length === 0 && !error ? <p style={{ marginTop: 12 }}>{t('noOrders')}</p> : orders.length > 0 ? (
          <>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('orderNumber')}</th><th>{t('date')}</th><th>{t('customer')}</th>
                    <th>{t('phone')}</th><th>{t('sellers')}</th><th>{t('items')}</th>
                    <th>{t('total')}</th><th>{t('paymentStatus')}</th><th>{t('paymentMethod')}</th>
                    <th>{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>{o.orderNumber}</td>
                      <td>{new Date(o.createdAt).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB')}</td>
                      <td>
                        {o.customerName}
                        {o.isGuest && <span className="badge-guest">{t('guestBadge')}</span>}
                      </td>
                      <td>{o.customerPhone}</td>
                      <td>{(o.sellers || []).map((s) => pickName(s, i18n.language)).filter(Boolean).join('، ')}</td>
                      <td>{o.itemCount}</td>
                      <td>{o.grandTotal} {o.currency}</td>
                      <td>{o.paymentStatus}</td>
                      <td>{o.paymentMethodCode === 'cod' ? t('cashOnDelivery') : (o.paymentMethodCode || '')}</td>
                      <td>
                        <select
                          value={o.status}
                          disabled={updatingId === o.id}
                          onChange={(e) => changeStatus(o, e.target.value)}
                          aria-label={t('status')}
                        >
                          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 10 }}>
              <b>{t('orders')}:</b> {total}
              {pageCount > 1 && (
                <>
                  {' '}— {page} / {pageCount}{' '}
                  <button className="btn-small" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)}>{t('previousPage')}</button>{' '}
                  <button className="btn-small" disabled={page >= pageCount || loading} onClick={() => changePage(page + 1)}>{t('nextPage')}</button>
                </>
              )}
            </p>
          </>
        ) : null}
      </section>
    </main>
  );
}
