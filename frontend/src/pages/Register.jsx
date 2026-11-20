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
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'customer', currency: 'EGP' });
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

  const inputStyle = { display: 'block', width: '100%', padding: 8 };
  return (
    <main style={{ padding: 16, maxWidth: 420 }}>
      <h1>{t('register')}</h1>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label>{t('fullName')}<input required value={form.fullName} onChange={set('fullName')} style={inputStyle} /></label>
        <label>{t('email')}<input type="email" required value={form.email} onChange={set('email')} style={inputStyle} /></label>
        <label>
          {t('password')}
          <input type="password" required minLength={8} value={form.password} onChange={set('password')} style={inputStyle} />
          <small>{t('passwordHint')}</small>
        </label>
        <label>
          {t('role')}
          <select value={form.role} onChange={set('role')} style={inputStyle}>
            <option value="customer">{t('roleCustomer')}</option>
            <option value="seller">{t('roleSeller')}</option>
          </select>
        </label>
        <label>
          {t('currency')}
          <select value={form.currency} onChange={set('currency')} style={inputStyle}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ padding: 10 }}>{t('register')}</button>
      </form>
      <p>{t('haveAccount')} <Link to="/login">{t('signIn')}</Link></p>
    </main>
  );
}
