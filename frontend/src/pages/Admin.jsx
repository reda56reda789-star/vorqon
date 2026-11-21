// Admin Dashboard — stats (GET /api/admin/stats), seller review
// (GET /api/admin/sellers + PATCH approve/reject + per-seller
// commission via PATCH /api/admin/sellers/:id/commission), product
// review queue (GET /api/admin/products?status= + PATCH approve/reject),
// categories (GET/POST /api/categories), coupons (GET + POST
// /api/admin/coupons), payouts (GET /api/admin/payouts + PATCH
// /api/admin/payouts/:id/approve).
// Orders live on their own page (/admin/orders, GET /api/admin/orders).
// Only calls endpoints that exist on the backend — no fake buttons.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, getSessionUser, pickName } from '../lib/api.js';

export default function Admin() {
  const { t, i18n } = useTranslation();
  const [sessionUser] = useState(getSessionUser());
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [sellers, setSellers] = useState([]);
  const [sellerStatus, setSellerStatus] = useState('pending');
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [categoryForm, setCategoryForm] = useState({ slug: '', name_ar: '', name_en: '' });
  const setC = (k) => (e) => setCategoryForm((f) => ({ ...f, [k]: e.target.value }));

  const [couponForm, setCouponForm] = useState({ code: '', discount_type: 'percent', discount_value: '', min_order_egp: '', valid_until: '' });
  const setCp = (k) => (e) => setCouponForm((f) => ({ ...f, [k]: e.target.value }));

  const [commissionDraft, setCommissionDraft] = useState({});
  const [queue, setQueue] = useState([]);
  const [queueStatus, setQueueStatus] = useState('pending_review');
  const [coupons, setCoupons] = useState([]);
  const [payoutList, setPayoutList] = useState([]);
  const [payoutStatus, setPayoutStatus] = useState('pending');

  const isAdminUser = sessionUser && (sessionUser.role === 'admin' || sessionUser.role === 'staff');

  async function loadSellers(status) {
    const q = status ? `?status=${status}` : '';
    const d = await apiFetch(`/api/admin/sellers${q}`);
    setSellers(d.sellers || []);
  }

  async function loadCategories() {
    const d = await apiFetch(`/api/categories?lang=${i18n.language}`);
    setCategories(d.categories || []);
  }

  async function loadQueue(status = queueStatus) {
    const d = await apiFetch(`/api/admin/products?status=${status}&limit=100`);
    setQueue(d.products || []);
  }

  async function loadCoupons() {
    const d = await apiFetch('/api/admin/coupons');
    setCoupons(d.coupons || []);
  }

  async function loadPayouts(status = payoutStatus) {
    const q = status ? `?status=${status}` : '';
    const d = await apiFetch(`/api/admin/payouts${q}`);
    setPayoutList(d.payouts || []);
  }

  useEffect(() => {
    if (!isAdminUser) return;
    apiFetch('/api/admin/stats').then((d) => setStats(d.stats)).catch((e) => setStatsError(e.message));
    loadSellers(sellerStatus).catch((e) => setError(e.message));
    loadCategories().catch(() => {});
    loadQueue('pending_review').catch(() => {});
    loadCoupons().catch(() => {});
    loadPayouts('pending').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminUser]);

  async function changeSellerFilter(e) {
    const status = e.target.value;
    setSellerStatus(status);
    try {
      await loadSellers(status);
    } catch (err) {
      setError(err.message);
    }
  }

  async function reviewSeller(id, action) {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/admin/sellers/${id}/${action}`, { method: 'PATCH' });
      setNotice(t('done'));
      await loadSellers(sellerStatus);
    } catch (err) {
      setError(err.message);
    }
  }

  async function createCategory(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/categories', { method: 'POST', body: { ...categoryForm, parent_id: null } });
      setNotice(t('done'));
      setCategoryForm({ slug: '', name_ar: '', name_en: '' });
      await loadCategories();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createCoupon(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const body = {
        code: couponForm.code,
        discount_type: couponForm.discount_type,
        discount_value: Number(couponForm.discount_value),
        ...(couponForm.min_order_egp ? { min_order_egp: Number(couponForm.min_order_egp) } : {}),
        ...(couponForm.valid_until ? { valid_until: new Date(couponForm.valid_until).toISOString() } : {}),
      };
      await apiFetch('/api/admin/coupons', { method: 'POST', body });
      setNotice(t('done'));
      setCouponForm({ code: '', discount_type: 'percent', discount_value: '', min_order_egp: '', valid_until: '' });
      await loadCoupons();
    } catch (err) {
      setError(err.message);
    }
  }

  async function reviewProduct(id, action) {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/admin/products/${id}/${action}`, { method: 'PATCH' });
      setNotice(t('done'));
      await loadQueue();
      apiFetch('/api/admin/stats').then((d) => setStats(d.stats)).catch(() => {});
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeQueueStatus(e) {
    const v = e.target.value;
    setQueueStatus(v);
    try {
      await loadQueue(v);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveCommission(s) {
    const raw = commissionDraft[s.id];
    if (raw === undefined || raw === '') return;
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/admin/sellers/${s.id}/commission`, { method: 'PATCH', body: { commissionRate: Number(raw) } });
      setNotice(t('done'));
      await loadSellers(sellerStatus);
    } catch (err) {
      setError(err.message);
    }
  }

  async function approvePayout(id) {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/admin/payouts/${id}/approve`, { method: 'PATCH' });
      setNotice(t('done'));
      await loadPayouts();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changePayoutStatus(e) {
    const v = e.target.value;
    setPayoutStatus(v);
    try {
      await loadPayouts(v);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!sessionUser) {
    return (
      <main className="container page">
        <h1>{t('adminDashboard')}</h1>
        <p>{t('signInRequired')} <Link to="/login">{t('signIn')}</Link></p>
      </main>
    );
  }
  if (!isAdminUser) {
    return (
      <main className="container page">
        <h1>{t('adminDashboard')}</h1>
        <p>{t('adminOnly')}</p>
      </main>
    );
  }

  return (
    <main className="container page">
      <h1>{t('adminDashboard')}</h1>
      {error && <p className="error-text">{error}</p>}
      {notice && <p className="notice-text">{notice}</p>}

      <section className="panel">
        <h2>{t('stats')}</h2>
        {statsError ? <p className="error-text">{statsError}</p> : !stats ? <p>{t('loading')}</p> : (
          <ul className="stat-list">
            <li><b>{t('orders')}:</b> {stats.total_orders}</li>
            <li><b>{t('customers')}:</b> {stats.total_customers}</li>
            <li><b>{t('sellers')}:</b> {stats.total_sellers}</li>
            <li><b>{t('activeStores')}:</b> {stats.active_stores}</li>
            <li><b>{t('publishedProducts')}:</b> {stats.published_products}</li>
            <li><b>{t('pendingProducts')}:</b> {stats.pending_products}</li>
            <li><b>{t('totalSales')}:</b> {stats.total_sales_egp} EGP</li>
            <li><b>{t('totalCommissions')}:</b> {stats.total_commissions_egp} EGP</li>
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>{t('orders')}</h2>
        <Link className="btn-navy" style={{ display: 'inline-block', padding: '8px 18px', textDecoration: 'none' }} to="/admin/orders">{t('viewOrders')}</Link>
      </section>

      <section className="panel">
        <h2>{t('sellers')}</h2>
        <label style={{ maxWidth: 260 }}>
          {t('status')}
          <select value={sellerStatus} onChange={changeSellerFilter}>
            <option value="">—</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
        {sellers.length === 0 ? <p>{t('noSellers')}</p> : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('businessName')}</th><th>{t('email')}</th>
                  <th>{t('status')}</th><th>{t('commissionRate')}</th><th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.id}>
                    <td>{i18n.language === 'en' ? (s.business_name_en || s.business_name_ar) : (s.business_name_ar || s.business_name_en)}</td>
                    <td>{s.email}</td>
                    <td>{t(`sellerStatus_${s.status}`)}</td>
                    <td>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="number" min="0" max="100" step="0.01" style={{ width: 90 }}
                          value={commissionDraft[s.id] ?? s.commission_rate}
                          onChange={(e) => setCommissionDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                        />%
                        <button className="btn-small" onClick={() => saveCommission(s)}>{t('saveChanges')}</button>
                      </span>
                    </td>
                    <td>
                      {s.status === 'pending' && (
                        <>
                          <button className="btn-small" onClick={() => reviewSeller(s.id, 'approve')}>{t('approve')}</button>{' '}
                          <button className="btn-small btn-danger" onClick={() => reviewSeller(s.id, 'reject')}>{t('reject')}</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t('reviewQueue')}</h2>
        <label style={{ maxWidth: 260 }}>
          {t('status')}
          <select value={queueStatus} onChange={changeQueueStatus}>
            {['pending_review', 'published', 'rejected', 'draft', 'archived'].map((s) => (
              <option key={s} value={s}>{t(`productStatus_${s}`)}</option>
            ))}
          </select>
        </label>
        {queue.length === 0 ? <p>{t('noProductsQueue')}</p> : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('products')}</th><th>{t('seller')}</th><th>{t('category')}</th>
                  <th>{t('price')}</th><th>{t('stock')}</th><th>{t('status')}</th><th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((p) => (
                  <tr key={p.id}>
                    <td>{pickName(p, i18n.language)}</td>
                    <td>{i18n.language === 'en' ? (p.sellerNameEn || p.sellerNameAr || '—') : (p.sellerNameAr || p.sellerNameEn || '—')}</td>
                    <td>{i18n.language === 'en' ? (p.categoryNameEn || p.categoryNameAr || '—') : (p.categoryNameAr || p.categoryNameEn || '—')}</td>
                    <td>{p.price} {p.currency}</td>
                    <td>{p.stockQuantity}</td>
                    <td>{t(`productStatus_${p.status}`)}</td>
                    <td>
                      {p.status === 'pending_review' && (
                        <>
                          <button className="btn-small" onClick={() => reviewProduct(p.id, 'approve')}>{t('approve')}</button>{' '}
                          <button className="btn-small btn-danger" onClick={() => reviewProduct(p.id, 'reject')}>{t('reject')}</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t('payouts')}</h2>
        <label style={{ maxWidth: 260 }}>
          {t('status')}
          <select value={payoutStatus} onChange={changePayoutStatus}>
            <option value="">—</option>
            {['pending', 'approved', 'paid', 'rejected'].map((s) => (
              <option key={s} value={s}>{t(`payoutStatus_${s}`)}</option>
            ))}
          </select>
        </label>
        {payoutList.length === 0 ? <p>{t('noPayouts')}</p> : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('requestedAt')}</th><th>{t('seller')}</th><th>{t('amount')}</th>
                  <th>{t('payoutMethod')}</th><th>{t('status')}</th><th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {payoutList.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.requested_at).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'ar-EG')}</td>
                    <td>{i18n.language === 'en' ? (p.business_name_en || p.business_name_ar) : (p.business_name_ar || p.business_name_en)} ({p.email})</td>
                    <td>{p.amount_egp} EGP</td>
                    <td>{p.method}</td>
                    <td>{t(`payoutStatus_${p.status}`)}</td>
                    <td>
                      {p.status === 'pending' && (
                        <button className="btn-small" onClick={() => approvePayout(p.id)}>{t('approve')}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t('categories')}</h2>
        <ul className="plain-list">
          {categories.map((c) => <li key={c.id}>{pickName(c, i18n.language)} — {c.slug}</li>)}
        </ul>
        <form onSubmit={createCategory} className="form" style={{ maxWidth: 480, marginTop: 14 }}>
          <label>{t('slug')}<input required value={categoryForm.slug} onChange={setC('slug')} /></label>
          <label>{t('nameAr')}<input required value={categoryForm.name_ar} onChange={setC('name_ar')} /></label>
          <label>{t('nameEn')}<input required value={categoryForm.name_en} onChange={setC('name_en')} /></label>
          <button type="submit" className="btn-navy">{t('create')}</button>
        </form>
      </section>

      <section className="panel">
        <h2>{t('createCoupon')}</h2>
        <form onSubmit={createCoupon} className="form" style={{ maxWidth: 480 }}>
          <label>{t('code')}<input required value={couponForm.code} onChange={setCp('code')} /></label>
          <label>
            {t('discountType')}
            <select value={couponForm.discount_type} onChange={setCp('discount_type')}>
              <option value="percent">{t('percent')}</option>
              <option value="fixed">{t('fixed')}</option>
            </select>
          </label>
          <label>{t('discountValue')}<input type="number" min="0" step="0.01" required value={couponForm.discount_value} onChange={setCp('discount_value')} /></label>
          <label>{t('minOrder')} (EGP)<input type="number" min="0" step="0.01" value={couponForm.min_order_egp} onChange={setCp('min_order_egp')} /></label>
          <label>{t('validUntil')}<input type="date" value={couponForm.valid_until} onChange={setCp('valid_until')} /></label>
          <button type="submit" className="btn-navy">{t('createCoupon')}</button>
        </form>
        <h3 style={{ marginTop: 20 }}>{t('coupons')}</h3>
        {coupons.length === 0 ? <p>{t('noCoupons')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('code')}</th><th>{t('discountType')}</th><th>{t('discountValue')}</th>
                  <th>{t('usedCount')}</th><th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td>{c.code}</td>
                    <td>{c.discount_type === 'percent' ? t('percent') : t('fixed')}</td>
                    <td>{c.discount_value}{c.discount_type === 'percent' ? '%' : ''}</td>
                    <td>{c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                    <td>{c.is_active ? t('active') : t('inactive')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
