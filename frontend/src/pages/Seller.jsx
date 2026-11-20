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
const inputStyle = { display: 'block', width: '100%', padding: 8 };
const cell = { padding: 6, textAlign: 'start' };

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
      <main style={{ padding: 16 }}>
        <h1>{t('sellerCenter')}</h1>
        <p>{t('signInRequired')} <Link to="/login">{t('signIn')}</Link></p>
      </main>
    );
  }
  if (sessionUser.role !== 'seller') {
    return (
      <main style={{ padding: 16 }}>
        <h1>{t('sellerCenter')}</h1>
        <p>{t('sellerOnly')}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 16 }}>
      <h1>{t('sellerCenter')}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {notice && <p style={{ color: 'green' }}>{notice}</p>}

      <h2>{t('dashboard')}</h2>
      {!dashboard ? <p>{t('loading')}</p> : (
        <ul>
          <li>{t('sellerStatus')}: {dashboard.seller.status}</li>
          <li>{t('commissionRate')}: {dashboard.seller.commissionRate}%</li>
          <li>{t('orders')}: {dashboard.orders.c} — {t('totalSales')}: {dashboard.orders.total} EGP</li>
          <li>{t('balance')}: {dashboard.balance.balance_egp} EGP</li>
          <li>{t('pendingBalance')}: {dashboard.balance.pending_egp} EGP</li>
        </ul>
      )}

      <h2>{t('myProducts')}</h2>
      {products.length === 0 ? <p>{t('noProducts')}</p> : (
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>{t('products')}</th><th style={cell}>{t('sku')}</th>
              <th style={cell}>{t('price')}</th><th style={cell}>{t('stock')}</th><th style={cell}>{t('status')}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td style={cell}>{pickName(p, i18n.language)}</td>
                <td style={cell}>{p.sku}</td>
                <td style={cell}>{p.price} {p.currency}</td>
                <td style={cell}>{p.stockQuantity}</td>
                <td style={cell}>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p><small>{t('publishedOnlyNote')}</small></p>

      <h2>{t('addProduct')}</h2>
      <form onSubmit={addProduct} style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
        <label>{t('nameAr')}<input required value={productForm.name_ar} onChange={setP('name_ar')} style={inputStyle} /></label>
        <label>{t('nameEn')}<input required value={productForm.name_en} onChange={setP('name_en')} style={inputStyle} /></label>
        <label>{t('slug')}<input required value={productForm.slug} onChange={setP('slug')} style={inputStyle} /></label>
        <label>{t('sku')}<input required value={productForm.sku} onChange={setP('sku')} style={inputStyle} /></label>
        <label>{t('price')}<input type="number" min="0" step="0.01" required value={productForm.price} onChange={setP('price')} style={inputStyle} /></label>
        <label>
          {t('currency')}
          <select value={productForm.currency} onChange={setP('currency')} style={inputStyle}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          {t('categories')}
          <select required value={productForm.category_id} onChange={setP('category_id')} style={inputStyle}>
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{pickName(c, i18n.language)}</option>)}
          </select>
        </label>
        <label>{t('stock')}<input type="number" min="0" value={productForm.stock_quantity} onChange={setP('stock_quantity')} style={inputStyle} /></label>
        <button type="submit" style={{ padding: 10 }}>{t('addProduct')}</button>
      </form>

      <h2>{t('sellerOrders')}</h2>
      {orders.length === 0 ? <p>{t('noOrders')}</p> : (
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>{t('orderNumber')}</th><th style={cell}>{t('status')}</th>
              <th style={cell}>{t('total')}</th><th style={cell}>{t('products')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td style={cell}>{o.orderNumber}</td>
                <td style={cell}>{o.status}</td>
                <td style={cell}>{o.grandTotal} {o.currency}</td>
                <td style={cell}>{(o.items || []).map((it) => `${pickName(it, i18n.language)} × ${it.quantity}`).join('، ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>{t('requestPayout')}</h2>
      <form onSubmit={requestPayout} style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
        <label>{t('amount')} (EGP)<input type="number" min="1" step="0.01" required value={payoutForm.amount_egp} onChange={setPay('amount_egp')} style={inputStyle} /></label>
        <label>
          {t('payoutMethod')}
          <select value={payoutForm.method} onChange={setPay('method')} style={inputStyle}>
            <option value="bank_transfer">bank_transfer</option>
            <option value="wallet">wallet</option>
            <option value="cash">cash</option>
          </select>
        </label>
        <label>{t('accountRef')}<input value={payoutForm.account_ref} onChange={setPay('account_ref')} style={inputStyle} /></label>
        <button type="submit" style={{ padding: 10 }}>{t('requestPayout')}</button>
      </form>
      <p><small>{t('payoutHistoryNote')}</small></p>
    </main>
  );
}
