// VORQON App shell — header, search, language/currency switcher, routes.
// Full pages live in src/pages/; the backend API remains the source of truth.
import { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import Product from './pages/Product.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Account from './pages/Account.jsx';
import Cart from './pages/Cart.jsx';
import Store from './pages/Store.jsx';
import Seller from './pages/Seller.jsx';
import Admin from './pages/Admin.jsx';
import { SESSION_EVENT, clearSession, getSessionUser } from './lib/api.js';

export default function App() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState(getSessionUser());
  const toggleLang = () => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar');

  useEffect(() => {
    const sync = () => setUser(getSessionUser());
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  function logout() {
    clearSession();
    navigate('/');
  }

  return (
    <div>
      <header style={{ display: 'flex', gap: 16, padding: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/" style={{ fontWeight: 800, fontSize: 24 }}>VORQON</Link>
        <span>{t('tagline')}</span>
        <input placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')} style={{ flex: 1, padding: 8 }} />
        <select aria-label="currency" defaultValue="EGP">
          <option value="EGP">EGP</option><option value="USD">USD</option>
          <option value="SAR">SAR</option><option value="AED">AED</option>
        </select>
        <button onClick={toggleLang}>{i18n.language === 'ar' ? 'English' : 'العربية'}</button>
      </header>
      <nav style={{ display: 'flex', gap: 16, padding: '0 16px 8px' }}>
        <Link to="/cart">{t('cart')}</Link>
        {user ? (
          <>
            <Link to="/account">{t('account')}</Link>
            {user.role === 'seller' && <Link to="/seller">{t('sellerCenter')}</Link>}
            {(user.role === 'admin' || user.role === 'staff') && <Link to="/admin">{t('adminDashboard')}</Link>}
            <button onClick={logout}>{t('logout')}</button>
          </>
        ) : (
          <>
            <Link to="/login">{t('signIn')}</Link>
            <Link to="/register">{t('register')}</Link>
          </>
        )}
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/product/:slug" element={<Product />} />
        <Route path="/store/:slug" element={<Store />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/account" element={<Account />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/seller" element={<Seller />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </div>
  );
}
