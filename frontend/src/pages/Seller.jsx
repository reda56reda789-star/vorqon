// Seller Center — dashboard (GET /api/sellers/me/dashboard), ALL my
// products in every status (GET /api/sellers/me/products?status=),
// add product (POST /api/products, lands in pending_review), edit my
// product (PATCH /api/sellers/products/:id), CSV bulk import
// (POST /api/sellers/me/products/import, lands in pending_review),
// my store orders (GET /api/sellers/me/orders), and payouts — request
// (POST /api/sellers/me/payouts) + history (GET /api/sellers/me/payouts).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, getSessionUser, pickName } from '../lib/api.js';

const CURRENCIES = ['EGP', 'USD', 'SAR', 'AED'];
const PRODUCT_STATUSES = ['draft', 'pending_review', 'published', 'rejected', 'archived'];

export default function Seller() {
  const { t, i18n } = useTranslation();
  const [sessionUser] = useState(getSessionUser());
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [importResult, setImportResult] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const setE = (k) => (e) => setEditForm((f) => ({ ...f, [k]: e.target.value }));

  const [productForm, setProductForm] = useState({
    name_ar: '', name_en: '', slug: '', sku: '', price: '', currency: 'EGP', category_id: '', stock_quantity: '',
  });
  const setP = (k) => (e) => setProductForm((f) => ({ ...f, [k]: e.target.value }));

  const [payoutForm, setPayoutForm] = useState({ amount_egp: '', method: 'bank_transfer', account_ref: '' });
  const setPay = (k) => (e) => setPayoutForm((f) => ({ ...f, [k]: e.target.value }));

  async function loadProducts(filter = statusFilter) {
    const q = filter ? `?status=${filter}` : '';
    const d = await apiFetch(`/api/sellers/me/products${q}`);
    setProducts(d.products || []);
  }

  async function loadPayouts() {
    const d = await apiFetch('/api/sellers/me/payouts');
    setPayouts(d.payouts || []);
  }

  useEffect(() => {
    if (!sessionUser || sessionUser.role !== 'seller') return;
    (async () => {
      try {
        const dash = await apiFetch('/api/sellers/me/dashboard');
        setDashboard(dash);
        await loadProducts('');
        const ord = await apiFetch('/api/sellers/me/orders');
        setOrders(ord.orders || []);
        await loadPayouts();
        const cats = await apiFetch(`/api/categories?lang=${i18n.language}`);
        setCategories(cats.categories || []);
      } catch (e) {
        setError(e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser, i18n.language]);

  async function changeStatusFilter(e) {
    const v = e.target.value;
    setStatusFilter(v);
    try {
      await loadProducts(v);
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(p) {
    setEditing(p.id);
    setEditForm({
      name_ar: p.nameAr || '', name_en: p.nameEn || '',
      description_ar: p.descriptionAr || '', description_en: p.descriptionEn || '',
      price: p.price ?? '', compare_at_price: p.compareAtPrice ?? '',
      currency: p.currency || 'EGP', stock_quantity: p.stockQuantity ?? 0,
      category_id: p.categoryId || '',
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/sellers/products/${editing}`, {
        method: 'PATCH',
        body: {
          ...editForm,
          price: Number(editForm.price),
          compare_at_price: editForm.compare_at_price === '' ? null : Number(editForm.compare_at_price),
          stock_quantity: Number(editForm.stock_quantity) || 0,
        },
      });
      setNotice(t('done'));
      setEditing(null);
      await loadProducts();
    } catch (err) {
      setError(err.message);
    }
  }

  async function importCsv(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    setImportResult(null);
    try {
      const text = await file.text();
      const d = await apiFetch('/api/sellers/me/products/import', { method: 'POST', body: { csv: text } });
      setImportResult(d);
      await loadProducts();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addProduct(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/products', {
        method: 'POST',
        body: { ...productForm, price: Number(productForm.price), stock_quantity: Number(productForm.stock_quantity) || 0 },
      });
      setNotice(t('productSubmitted'));
      setProductForm({ name_ar: '', name_en: '', slug: '', sku: '', price: '', currency: 'EGP', category_id: '', stock_quantity: '' });
      await loadProducts();
    } catch (err) {
      setError(err.message);
    }
  }

  async function requestPayout(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/sellers/me/payouts', {
        method: 'POST',
        body: { amount_egp: Number(payoutForm.amount_egp), method: payoutForm.method, account_ref: payoutForm.account_ref || undefined },
      });
      setNotice(t('payoutSubmitted'));
      setPayoutForm({ amount_egp: '', method: 'bank_transfer', account_ref: '' });
      await loadPayouts();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!sessionUser) {
    return (
      <main className="container page">
        <h1>{t('sellerCenter')}</h1>
        <p>{t('signInRequired')} <Link to="/login">{t('signIn')}</Link></p>
      </main>
    );
  }
  if (sessionUser.role !== 'seller') {
    return (
      <main className="container page">
        <h1>{t('sellerCenter')}</h1>
        <p>{t('sellerOnly')}</p>
      </main>
    );
  }

  return (
    <main className="container page">
      <h1>{t('sellerCenter')}</h1>
      {error && <p className="error-text">{error}</p>}
      {notice && <p className="notice-text">{notice}</p>}

      <section className="panel">
        <h2>{t('dashboard')}</h2>
        {!dashboard ? <p>{t('loading')}</p> : (
          <ul className="stat-list">
            <li><b>{t('sellerStatus')}:</b> {t(`sellerStatus_${dashboard.seller.status}`)}</li>
            <li><b>{t('commissionRate')}:</b> {dashboard.seller.commissionRate}%</li>
            <li><b>{t('orders')}:</b> {dashboard.orders.c} — <b>{t('totalSales')}:</b> {dashboard.orders.total} EGP</li>
            <li><b>{t('balance')}:</b> {dashboard.balance.balance_egp} EGP</li>
            <li><b>{t('pendingBalance')}:</b> {dashboard.balance.pending_egp} EGP</li>
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>{t('myProducts')}</h2>
        <label style={{ maxWidth: 260 }}>
          {t('status')}
          <select value={statusFilter} onChange={changeStatusFilter}>
            <option value="">{t('allStatuses')}</option>
            {PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{t(`productStatus_${s}`)}</option>)}
          </select>
        </label>
        {products.length === 0 ? <p>{t('noProducts')}</p> : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('products')}</th><th>{t('sku')}</th>
                  <th>{t('price')}</th><th>{t('stock')}</th><th>{t('status')}</th><th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>{pickName(p, i18n.language)}</td>
                    <td>{p.sku}</td>
                    <td>{p.price} {p.currency}</td>
                    <td>{p.stockQuantity}</td>
                    <td>{t(`productStatus_${p.status}`)}</td>
                    <td><button className="btn-small" onClick={() => startEdit(p)}>{t('edit')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editing && (
          <form onSubmit={saveEdit} className="form" style={{ maxWidth: 480, marginTop: 16 }}>
            <h3 style={{ margin: 0 }}>{t('editProduct')}</h3>
            <label>{t('nameAr')}<input required value={editForm.name_ar} onChange={setE('name_ar')} /></label>
            <label>{t('nameEn')}<input required value={editForm.name_en} onChange={setE('name_en')} /></label>
            <label>{t('descriptionAr')}<textarea value={editForm.description_ar} onChange={setE('description_ar')} /></label>
            <label>{t('descriptionEn')}<textarea value={editForm.description_en} onChange={setE('description_en')} /></label>
            <label>{t('price')}<input type="number" min="0" step="0.01" required value={editForm.price} onChange={setE('price')} /></label>
            <label>{t('compareAtPrice')}<input type="number" min="0" step="0.01" value={editForm.compare_at_price} onChange={setE('compare_at_price')} /></label>
            <label>
              {t('currency')}
              <select value={editForm.currency} onChange={setE('currency')}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              {t('categories')}
              <select required value={editForm.category_id} onChange={setE('category_id')}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{pickName(c, i18n.language)}</option>)}
              </select>
            </label>
            <label>{t('stock')}<input type="number" min="0" value={editForm.stock_quantity} onChange={setE('stock_quantity')} /></label>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn-navy">{t('saveChanges')}</button>
              <button type="button" className="btn-small" onClick={() => setEditing(null)}>{t('cancelAction')}</button>
            </span>
          </form>
        )}
      </section>

      <section className="panel">
        <h2>{t('addProduct')}</h2>
        <form onSubmit={addProduct} className="form" style={{ maxWidth: 480 }}>
          <label>{t('nameAr')}<input required value={productForm.name_ar} onChange={setP('name_ar')} /></label>
          <label>{t('nameEn')}<input required value={productForm.name_en} onChange={setP('name_en')} /></label>
          <label>{t('slug')}<input required value={productForm.slug} onChange={setP('slug')} /></label>
          <label>{t('sku')}<input required value={productForm.sku} onChange={setP('sku')} /></label>
          <label>{t('price')}<input type="number" min="0" step="0.01" required value={productForm.price} onChange={setP('price')} /></label>
          <label>
            {t('currency')}
            <select value={productForm.currency} onChange={setP('currency')}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            {t('categories')}
            <select required value={productForm.category_id} onChange={setP('category_id')}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{pickName(c, i18n.language)}</option>)}
            </select>
          </label>
          <label>{t('stock')}<input type="number" min="0" value={productForm.stock_quantity} onChange={setP('stock_quantity')} /></label>
          <button type="submit" className="btn-navy">{t('addProduct')}</button>
        </form>
      </section>

      <section className="panel">
        <h2>{t('importProducts')}</h2>
        <p><small>{t('csvColumnsHint')}</small></p>
        <label>
          {t('chooseFile')}
          <input type="file" accept=".csv,text/csv" onChange={importCsv} />
        </label>
        {importResult && (
          <div style={{ marginTop: 12 }}>
            <p className="notice-text">
              {t('importDone')}: {importResult.imported} {t('imported')} · {importResult.skipped} {t('skipped')}
            </p>
            {(importResult.errors || []).length > 0 && (
              <ul className="plain-list">
                {importResult.errors.map((er, i) => (
                  <li key={i} className="error-text">#{er.row}: {er.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t('sellerOrders')}</h2>
        {orders.length === 0 ? <p>{t('noOrders')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('orderNumber')}</th><th>{t('status')}</th>
                  <th>{t('total')}</th><th>{t('products')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderNumber}</td>
                    <td>{t(`status_${o.status}`)}</td>
                    <td>{o.grandTotal} {o.currency}</td>
                    <td>{(o.items || []).map((it) => `${pickName(it, i18n.language)} × ${it.quantity}`).join('، ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t('requestPayout')}</h2>
        <form onSubmit={requestPayout} className="form" style={{ maxWidth: 480 }}>
          <label>{t('amount')} (EGP)<input type="number" min="1" step="0.01" required value={payoutForm.amount_egp} onChange={setPay('amount_egp')} /></label>
          <label>
            {t('payoutMethod')}
            <select value={payoutForm.method} onChange={setPay('method')}>
              <option value="bank_transfer">bank_transfer</option>
              <option value="wallet">wallet</option>
              <option value="cash">cash</option>
            </select>
          </label>
          <label>{t('accountRef')}<input value={payoutForm.account_ref} onChange={setPay('account_ref')} /></label>
          <button type="submit" className="btn-navy">{t('requestPayout')}</button>
        </form>
        <h3 style={{ marginTop: 20 }}>{t('payoutHistory')}</h3>
        {payouts.length === 0 ? <p>{t('noPayouts')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('requestedAt')}</th><th>{t('amount')}</th>
                  <th>{t('payoutMethod')}</th><th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.requested_at).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'ar-EG')}</td>
                    <td>{p.amount_egp} EGP</td>
                    <td>{p.method}</td>
                    <td>{t(`payoutStatus_${p.status}`)}</td>
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
