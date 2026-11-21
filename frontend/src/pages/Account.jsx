// Customer account — profile (GET /api/auth/me), my orders
// (GET /api/orders, detail via GET /api/orders/:id with sub-orders +
// items), my address book (GET/POST/PUT/DELETE /api/addresses — the
// default address is what checkout offers first), and my wishlist
// (GET /api/wishlist, DELETE /api/wishlist/:productId).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, getSessionUser, pickName } from '../lib/api.js';

const EMPTY_ADDR = {
  label: 'home', fullName: '', phone: '', country: 'EG', city: '',
  area: '', street: '', building: '', postalCode: '', isDefault: false,
};

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
  const [addresses, setAddresses] = useState([]);
  const [addrForm, setAddrForm] = useState(EMPTY_ADDR);
  const [editingAddr, setEditingAddr] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const setA = (k) => (e) => setAddrForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function loadAddresses() {
    const d = await apiFetch('/api/addresses');
    setAddresses(d.addresses || []);
  }

  async function loadWishlist() {
    const d = await apiFetch('/api/wishlist');
    setWishlist(d.items || []);
  }

  useEffect(() => {
    if (!sessionUser) return;
    apiFetch('/api/auth/me').then((d) => setProfile(d.user)).catch((e) => setError(e.message));
    apiFetch('/api/orders').then((d) => setOrders(d.orders || [])).catch((e) => setError(e.message));
    loadAddresses().catch(() => {});
    loadWishlist().catch(() => {});
  }, [sessionUser]);

  async function submitAddress(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingAddr) await apiFetch(`/api/addresses/${editingAddr}`, { method: 'PUT', body: addrForm });
      else await apiFetch('/api/addresses', { method: 'POST', body: addrForm });
      setAddrForm(EMPTY_ADDR);
      setEditingAddr(null);
      await loadAddresses();
    } catch (err) {
      setError(err.message);
    }
  }

  function editAddress(a) {
    setEditingAddr(a.id);
    setAddrForm({
      label: a.label || 'home', fullName: a.fullName || '', phone: a.phone || '',
      country: a.country || 'EG', city: a.city || '', area: a.area || '',
      street: a.street || '', building: a.building || '', postalCode: a.postalCode || '',
      isDefault: !!a.isDefault,
    });
  }

  async function removeAddress(id) {
    setError('');
    try {
      await apiFetch(`/api/addresses/${id}`, { method: 'DELETE' });
      if (editingAddr === id) { setEditingAddr(null); setAddrForm(EMPTY_ADDR); }
      await loadAddresses();
    } catch (err) {
      setError(err.message);
    }
  }

  async function makeDefault(a) {
    setError('');
    try {
      await apiFetch(`/api/addresses/${a.id}`, {
        method: 'PUT',
        body: {
          label: a.label, fullName: a.fullName, phone: a.phone, country: a.country,
          city: a.city, area: a.area || '', street: a.street, building: a.building || '',
          postalCode: a.postalCode || '', isDefault: true,
        },
      });
      await loadAddresses();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeFromWishlist(productId) {
    setError('');
    try {
      await apiFetch(`/api/wishlist/${productId}`, { method: 'DELETE' });
      await loadWishlist();
    } catch (err) {
      setError(err.message);
    }
  }

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
        <h2>{t('addresses')}</h2>
        {addresses.length === 0 ? <p>{t('noAddresses')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('addressLabel')}</th>
                  <th>{t('fullName')}</th>
                  <th>{t('city')}</th>
                  <th>{t('street')}</th>
                  <th>{t('phone')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {addresses.map((a) => (
                  <tr key={a.id}>
                    <td>{a.label}{a.isDefault && <span className="badge-guest">{t('defaultAddress')}</span>}</td>
                    <td>{a.fullName}</td>
                    <td>{a.city}</td>
                    <td>{[a.area, a.street, a.building].filter(Boolean).join('، ')}</td>
                    <td>{a.phone}</td>
                    <td>
                      <button className="btn-small" onClick={() => editAddress(a)}>{t('edit')}</button>{' '}
                      {!a.isDefault && <><button className="btn-small" onClick={() => makeDefault(a)}>{t('setDefault')}</button>{' '}</>}
                      <button className="btn-small btn-danger" onClick={() => removeAddress(a.id)}>{t('remove')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={submitAddress} className="form" style={{ maxWidth: 480, marginTop: 14 }}>
          <label>{t('addressLabel')}<input value={addrForm.label} onChange={setA('label')} /></label>
          <label>{t('fullName')}<input required value={addrForm.fullName} onChange={setA('fullName')} /></label>
          <label>{t('phone')}<input required value={addrForm.phone} onChange={setA('phone')} /></label>
          <label>{t('country')}<input value={addrForm.country} onChange={setA('country')} /></label>
          <label>{t('city')}<input required value={addrForm.city} onChange={setA('city')} /></label>
          <label>{t('area')}<input value={addrForm.area} onChange={setA('area')} /></label>
          <label>{t('street')}<input required value={addrForm.street} onChange={setA('street')} /></label>
          <label>{t('building')}<input value={addrForm.building} onChange={setA('building')} /></label>
          <label>{t('postalCode')}<input value={addrForm.postalCode} onChange={setA('postalCode')} /></label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={addrForm.isDefault} onChange={setA('isDefault')} style={{ width: 'auto' }} />
            {t('setDefault')}
          </label>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn-navy">{editingAddr ? t('edit') : t('addAddress')}</button>
            {editingAddr && (
              <button type="button" className="btn-small" onClick={() => { setEditingAddr(null); setAddrForm(EMPTY_ADDR); }}>{t('cancelAction')}</button>
            )}
          </span>
        </form>
      </section>

      <section className="panel">
        <h2>{t('wishlist')}</h2>
        {wishlist.length === 0 ? <p>{t('wishlistEmpty')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('products')}</th>
                  <th>{t('price')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {wishlist.map((it) => (
                  <tr key={it.productId}>
                    <td><Link to={`/product/${it.product.slug}`}>{pickName(it.product, i18n.language)}</Link></td>
                    <td>{it.product.price} {it.product.currency}</td>
                    <td><button className="btn-small btn-danger" onClick={() => removeFromWishlist(it.productId)}>{t('removeFromWishlist')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                    <td>{t(`status_${o.status}`)}</td>
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
            <p>{t('status')}: {t(`status_${detail.status}`)} — {t('total')}: {detail.grandTotal} {detail.currency}</p>
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
