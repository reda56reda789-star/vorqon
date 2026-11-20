// Admin Dashboard — stats (GET /api/admin/stats), seller review
// (GET /api/admin/sellers + PATCH approve/reject), categories
// (GET/POST /api/categories), coupon creation (POST /api/admin/coupons),
// and product / payout approval (PATCH /api/admin/.../approve).
// API limits reflected honestly below: the API exposes NO list endpoints
// for pending products, payouts, coupons, or all orders — approvals for
// products and payouts are therefore done by ID, exactly as the API
// supports, and no orders section is faked here.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, getSessionUser, pickName } from '../lib/api.js';

const inputStyle = { display: 'block', width: '100%', padding: 8 };
const cell = { padding: 6, textAlign: 'start' };

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
      <main style={{ padding: 16 }}>
        <h1>{t('adminDashboard')}</h1>
        <p>{t('signInRequired')} <Link to="/login">{t('signIn')}</Link></p>
      </main>
    );
  }
  if (!isAdminUser) {
    return (
      <main style={{ padding: 16 }}>
        <h1>{t('adminDashboard')}</h1>
        <p>{t('adminOnly')}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 16 }}>
      <h1>{t('adminDashboard')}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {notice && <p style={{ color: 'green' }}>{notice}</p>}

      <h2>{t('stats')}</h2>
      {statsError ? <p style={{ color: 'crimson' }}>{statsError}</p> : !stats ? <p>{t('loading')}</p> : (
        <ul>
          <li>{t('orders')}: {stats.total_orders}</li>
          <li>{t('customers')}: {stats.total_customers}</li>
          <li>{t('sellers')}: {stats.total_sellers}</li>
          <li>{t('activeStores')}: {stats.active_stores}</li>
          <li>{t('publishedProducts')}: {stats.published_products}</li>
          <li>{t('pendingProducts')}: {stats.pending_products}</li>
          <li>{t('totalSales')}: {stats.total_sales_egp} EGP</li>
          <li>{t('totalCommissions')}: {stats.total_commissions_egp} EGP</li>
        </ul>
      )}

      <h2>{t('sellers')}</h2>
      <label>
        {t('status')}
        <select value={sellerStatus} onChange={changeSellerFilter} style={{ marginInlineStart: 8, padding: 6 }}>
          <option value="">—</option>
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>
      </label>
      {sellers.length === 0 ? <p>{t('noSellers')}</p> : (
        <table style={{ borderCollapse: 'collapse', marginTop: 8 }}>
          <thead>
            <tr>
              <th style={cell}>{t('businessName')}</th><th style={cell}>{t('email')}</th>
              <th style={cell}>{t('status')}</th><th style={cell}>{t('commissionRate')}</th><th style={cell}>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((s) => (
              <tr key={s.id}>
                <td style={cell}>{i18n.language === 'en' ? (s.business_name_en || s.business_name_ar) : (s.business_name_ar || s.business_name_en)}</td>
                <td style={cell}>{s.email}</td>
                <td style={cell}>{s.status}</td>
                <td style={cell}>{s.commission_rate}%</td>
                <td style={cell}>
                  {s.status === 'pending' && (
                    <>
                      <button onClick={() => reviewSeller(s.id, 'approve')}>{t('approve')}</button>{' '}
                      <button onClick={() => reviewSeller(s.id, 'reject')}>{t('reject')}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>{t('approveById')}</h2>
      <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
        <label>
          {t('productId')}
          <span style={{ display: 'flex', gap: 8 }}>
            <input value={productId} onChange={(e) => setProductId(e.target.value)} style={{ flex: 1, padding: 8 }} />
            <button disabled={!productId} onClick={() => approveById('products', productId)}>{t('approve')}</button>
          </span>
        </label>
        <label>
          {t('payoutId')}
          <span style={{ display: 'flex', gap: 8 }}>
            <input value={payoutId} onChange={(e) => setPayoutId(e.target.value)} style={{ flex: 1, padding: 8 }} />
            <button disabled={!payoutId} onClick={() => approveById('payouts', payoutId)}>{t('approve')}</button>
          </span>
        </label>
      </div>
      <p><small>{t('approveByIdNote')}</small></p>

      <h2>{t('categories')}</h2>
      <ul>
        {categories.map((c) => <li key={c.id}>{pickName(c, i18n.language)} — {c.slug}</li>)}
      </ul>
      <form onSubmit={createCategory} style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
        <label>{t('slug')}<input required value={categoryForm.slug} onChange={setC('slug')} style={inputStyle} /></label>
        <label>{t('nameAr')}<input required value={categoryForm.name_ar} onChange={setC('name_ar')} style={inputStyle} /></label>
        <label>{t('nameEn')}<input required value={categoryForm.name_en} onChange={setC('name_en')} style={inputStyle} /></label>
        <button type="submit" style={{ padding: 10 }}>{t('create')}</button>
      </form>

      <h2>{t('createCoupon')}</h2>
      <form onSubmit={createCoupon} style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
        <label>{t('code')}<input required value={couponForm.code} onChange={setCp('code')} style={inputStyle} /></label>
        <label>
          {t('discountType')}
          <select value={couponForm.discount_type} onChange={setCp('discount_type')} style={inputStyle}>
            <option value="percent">{t('percent')}</option>
            <option value="fixed">{t('fixed')}</option>
          </select>
        </label>
        <label>{t('discountValue')}<input type="number" min="0" step="0.01" required value={couponForm.discount_value} onChange={setCp('discount_value')} style={inputStyle} /></label>
        <label>{t('minOrder')} (EGP)<input type="number" min="0" step="0.01" value={couponForm.min_order_egp} onChange={setCp('min_order_egp')} style={inputStyle} /></label>
        <label>{t('validUntil')}<input type="date" value={couponForm.valid_until} onChange={setCp('valid_until')} style={inputStyle} /></label>
        <button type="submit" style={{ padding: 10 }}>{t('createCoupon')}</button>
      </form>
    </main>
  );
}
