// Sign-in page — POST /api/auth/login, stores the session, then routes by role.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, saveSession } from '../lib/api.js';

export function homePathForRole(role) {
  if (role === 'seller') return '/seller';
  if (role === 'admin' || role === 'staff') return '/admin';
  return '/account';
}

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch('/api/auth/login', { method: 'POST', body: { email, password } });
      saveSession(data);
      navigate(homePathForRole(data.user?.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 16, maxWidth: 420 }}>
      <h1>{t('signIn')}</h1>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label>
          {t('email')}
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: 'block', width: '100%', padding: 8 }} />
        </label>
        <label>
          {t('password')}
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={{ display: 'block', width: '100%', padding: 8 }} />
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ padding: 10 }}>{t('signIn')}</button>
      </form>
      <p>{t('noAccount')} <Link to="/register">{t('register')}</Link></p>
    </main>
  );
}
