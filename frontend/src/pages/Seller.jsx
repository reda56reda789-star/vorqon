// Seller Center — dashboard (GET /api/sellers/me/dashboard), my published
// products (GET /api/products?seller=<id>), add product (POST /api/products,
// lands in pending_review), my store orders (GET /api/sellers/me/orders),
// and payout requests (POST /api/sellers/me/payouts).
// API limits reflected honestly below: there is no endpoint to list a
// seller's pending-review products, to edit a product, to list past payout
// requests, or to import products via CSV — so none of those are faked here.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, getSessionUser, pickName } from '../lib/api.js';

const CURRENCIES = ['EGP', 'USD', 'SAR', 'AED'];

export default function Seller() {
  const { t, i18n } = useTranslation();
  const [sessionUser] = useState(getSessionUser());
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [productForm, setProductForm] = useState({
    name_ar: '', name_en: '', slug: '', sku: '', price: '', currency: 'EGP', category_id: '', stock_quantity: '',
  });
  const setP = (k) => (e) => setProductForm((f) => ({ ...f, [k]: e.target.value }));

  const [payoutForm, setPayoutForm] = useState({ amount_egp: '', method: 'bank_transfer', account_ref: '' });
  const setPay = (k) => (e) => setPayoutForm((f) => ({ ...f, [k]: e.target.value }));

  async function loadProducts(sellerId) {
    const d = await apiFetch(`/api/products?seller=${sellerId}&limit=100&lang=${i18n.language}`);
    setProducts(d.products || []);
  }

  useEffect(() => {
    if (!sessionUser || sessionUser.role !== 'seller') return;
    (async () => {
      try {
        const dash = await apiFetch('/api/sellers/me/dashboard');
        setDashboard(dash);
        await loadProducts(dash.seller.id);
        const ord = await apiFetch('/api/sellers/me/orders');
        setOrders(ord.orders || []);
        const cats = await apiFetch(`/api/categories?lang=${i18n.language}`);
        setCategories(cats.categories || []);
      } catch (e) {
        setError(e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser, i18n.language]);

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
      if (dashboard) await loadProducts(dashboard.seller.id);
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
            <li><b>{t('sellerStatus')}:</b> {dashboard.seller.status}</li>
            <li><b>{t('commissionRate')}:</b> {dashboard.seller.commissionRate}%</li>
            <li><b>{t('orders')}:</b> {dashboard.orders.c} — <b>{t('totalSales')}:</b> {dashboard.orders.total} EGP</li>
            <li><b>{t('balance')}:</b> {dashboard.balance.balance_egp} EGP</li>
            <li><b>{t('pendingBalance')}:</b> {dashboard.balance.pending_egp} EGP</li>
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>{t('myProducts')}</h2>
        {products.length === 0 ? <p>{t('noProducts')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('products')}</th><th>{t('sku')}</th>
                  <th>{t('price')}</th><th>{t('stock')}</th><th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>{pickName(p, i18n.language)}</td>
                    <td>{p.sku}</td>
                    <td>{p.price} {p.currency}</td>
                    <td>{p.stockQuantity}</td>
                    <td>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p><small>{t('publishedOnlyNote')}</small></p>
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
                    <td>{o.status}</td>
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
        <p><small>{t('payoutHistoryNote')}</small></p>
      </section>
    </main>
  );
}
