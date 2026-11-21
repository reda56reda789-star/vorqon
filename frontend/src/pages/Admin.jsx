// Admin Dashboard — stats (GET /api/admin/stats), seller review
// (GET /api/admin/sellers + PATCH approve/reject), categories
// (GET/POST /api/categories), coupon creation (POST /api/admin/coupons),
// and product / payout approval (PATCH /api/admin/.../approve).
// Orders live on their own page (/admin/orders, GET /api/admin/orders).
// API limits reflected honestly below: the API exposes NO list endpoints
// for pending products, payouts, or coupons — approvals for products
// and payouts are therefore done by ID, exactly as the API supports.
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

  const [productId, setProductId] = useState('');
  const [payoutId, setPayoutId] = useState('');

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

  useEffect(() => {
    if (!isAdminUser) return;
    apiFetch('/api/admin/stats').then((d) => setStats(d.stats)).catch((e) => setStatsError(e.message));
    loadSellers(sellerStatus).catch((e) => setError(e.message));
    loadCategories().catch(() => {});
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
    } catch (err) {
      setError(err.message);
    }
  }

  async function approveById(kind, id) {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/admin/${kind}/${id}/approve`, { method: 'PATCH' });
      setNotice(t('done'));
      if (kind === 'products') setProductId('');
      if (kind === 'payouts') setPayoutId('');
      apiFetch('/api/admin/stats').then((d) => setStats(d.stats)).catch(() => {});
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
                    <td>{s.status}</td>
                    <td>{s.commission_rate}%</td>
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
        <h2>{t('approveById')}</h2>
        <div className="form" style={{ maxWidth: 480 }}>
          <label>
            {t('productId')}
            <span style={{ display: 'flex', gap: 8 }}>
              <input value={productId} onChange={(e) => setProductId(e.target.value)} style={{ flex: 1 }} />
              <button disabled={!productId} onClick={() => approveById('products', productId)}>{t('approve')}</button>
            </span>
          </label>
          <label>
            {t('payoutId')}
            <span style={{ display: 'flex', gap: 8 }}>
              <input value={payoutId} onChange={(e) => setPayoutId(e.target.value)} style={{ flex: 1 }} />
              <button disabled={!payoutId} onClick={() => approveById('payouts', payoutId)}>{t('approve')}</button>
            </span>
          </label>
        </div>
        <p><small>{t('approveByIdNote')}</small></p>
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
      </section>
    </main>
  );
}
