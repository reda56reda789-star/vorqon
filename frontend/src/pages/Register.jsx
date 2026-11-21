// Registration page — POST /api/auth/register (role: customer | seller only;
// admin/staff accounts are never self-registered, per the API).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, saveSession } from '../lib/api.js';
import { homePathForRole } from './Login.jsx';

const CURRENCIES = ['EGP', 'USD', 'SAR', 'AED'];

export default function Register() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'customer', currency: 'EGP', storeName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: { ...form, language: i18n.language },
      });
      saveSession(data);
      navigate(homePathForRole(data.user?.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container page">
      <div className="auth-wrap panel">
        <h1>{t('register')}</h1>
        <form onSubmit={submit} className="form">
          <label>{t('fullName')}<input required value={form.fullName} onChange={set('fullName')} /></label>
          <label>{t('email')}<input type="email" required value={form.email} onChange={set('email')} /></label>
          <label>
            {t('password')}
            <input type="password" required minLength={8} value={form.password} onChange={set('password')} />
            <small>{t('passwordHint')}</small>
          </label>
          <label>
            {t('role')}
            <select value={form.role} onChange={set('role')}>
              <option value="customer">{t('roleCustomer')}</option>
              <option value="seller">{t('roleSeller')}</option>
            </select>
          </label>
          {form.role === 'seller' && (
            <label>
              {t('storeName')}
              <input value={form.storeName} onChange={set('storeName')} />
              <small>{t('storeNameHint')}</small>
            </label>
          )}
          <label>
            {t('currency')}
            <select value={form.currency} onChange={set('currency')}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}
          <button type="submit" className="btn-gold btn-block" disabled={busy}>{t('register')}</button>
        </form>
        <p style={{ marginTop: 14 }}>{t('haveAccount')} <Link to="/login">{t('signIn')}</Link></p>
      </div>
    </main>
  );
}
