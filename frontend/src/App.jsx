// VORQON App shell — navy header, search, language/currency switcher,
// category sub-nav, routes, footer. Pages live in src/pages/; the
// backend API remains the source of truth.
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
import Checkout from './pages/Checkout.jsx';
import Store from './pages/Store.jsx';
import Seller from './pages/Seller.jsx';
import Admin from './pages/Admin.jsx';
import AdminOrders from './pages/AdminOrders.jsx';
import Install from './pages/Install.jsx';
import { SESSION_EVENT, apiFetch, apiUrl, clearSession, getSessionUser, pickName } from './lib/api.js';
import { GUEST_CART_EVENT, guestCartCount } from './lib/guestCart.js';
import { usePwaInstall } from './lib/pwa.js';
import InstallBanner from './components/InstallBanner.jsx';
import { MobileActions, MobileBottomNav } from './components/MobileNav.jsx';

export default function App() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState(getSessionUser());
  const [categories, setCategories] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [query, setQuery] = useState('');
  const [searchCat, setSearchCat] = useState('');
  const pwa = usePwaInstall();
  const toggleLang = () => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar');

  async function refreshCartCount(u) {
    // Guests: the badge counts the local guest cart. Signed-in users:
    // the server cart (the two are never merged).
    if (!u) { setCartCount(guestCartCount()); return; }
    try {
      const d = await apiFetch('/api/cart');
      setCartCount((d.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0));
    } catch { setCartCount(0); }
  }

  useEffect(() => {
    const sync = () => {
      const u = getSessionUser();
      setUser(u);
      refreshCartCount(u);
    };
    sync();
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener(GUEST_CART_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener(GUEST_CART_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(apiUrl(`/api/categories?lang=${i18n.language}`))
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});
  }, [i18n.language]);

  function logout() {
    clearSession();
    navigate('/');
  }

  function submitSearch(e) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (searchCat) params.set('category', searchCat);
    navigate(`/search${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div>
      <header className="site-header">
        <div className="header-main">
          <Link to="/" className="logo">
            VORQ<span className="logo-accent">O</span>N
            <span className="logo-tagline">BEYOND POSSIBILITIES</span>
          </Link>
          <form className="search-bar" onSubmit={submitSearch} role="search">
            <select
              className="search-select"
              aria-label={t('categories')}
              value={searchCat}
              onChange={(e) => setSearchCat(e.target.value)}
            >
              <option value="">{t('categories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{pickName(c, i18n.language)}</option>
              ))}
            </select>
            <input
              className="search-input"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="search-btn" type="submit" aria-label="Search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" /></svg>
            </button>
          </form>
          <MobileActions user={user} lang={i18n.language} onLang={toggleLang} onLogout={logout} cartCount={cartCount} />
          <div className="header-actions">
            {!pwa.standalone && !pwa.installed && (
              <button
                className="header-ghost-btn install-header-btn"
                onClick={() => { if (pwa.canPrompt) void pwa.promptInstall(); else navigate('/install'); }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 1H7a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm0 18H7V5h10zM12 21a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" /></svg>
                {t('installApp')}
              </button>
            )}
            <button className="header-ghost-btn" onClick={toggleLang}>{i18n.language === 'ar' ? 'English' : 'العربية'}</button>
            <select className="header-currency" aria-label="currency" defaultValue="EGP">
              <option value="EGP">EGP</option><option value="USD">USD</option>
              <option value="SAR">SAR</option><option value="AED">AED</option>
            </select>
            {user ? (
              <>
                <Link className="header-link" to="/account">
                  <span className="hl-top">{user.fullName || user.email}</span>
                  <span className="hl-main">{t('account')}</span>
                </Link>
                {user.role === 'seller' && <Link className="header-link" to="/seller"><span className="hl-main">{t('sellerCenter')}</span></Link>}
                {(user.role === 'admin' || user.role === 'staff') && <Link className="header-link" to="/admin"><span className="hl-main">{t('adminDashboard')}</span></Link>}
                <button className="header-ghost-btn" onClick={logout}>{t('logout')}</button>
              </>
            ) : (
              <>
                <Link className="header-link" to="/login">
                  <span className="hl-top">{t('welcome')}</span>
                  <span className="hl-main">{t('signIn')}</span>
                </Link>
                <Link className="header-link" to="/register"><span className="hl-main">{t('register')}</span></Link>
              </>
            )}
            <Link className="header-link cart-link" to="/cart" aria-label={t('cart')}>
              <span className="cart-icon-wrap">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7.16 14h9.69c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21.3 5H5.21l-.94-2H1v2h2l3.6 7.59L5.24 17A2 2 0 0 0 7 20h12v-2H7.42a.25.25 0 0 1-.22-.37z" /></svg>
                {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
              </span>
              <span className="cart-label">{t('cart')}</span>
            </Link>
          </div>
        </div>
        <nav className="subnav">
          <div className="subnav-inner">
            <Link to="/">{t('browseCategories')}</Link>
            {categories.map((c) => (
              <Link key={c.id} to={`/search?category=${c.id}`}>{pickName(c, i18n.language)}</Link>
            ))}
          </div>
        </nav>
      </header>
      <div className="store-mode-notice" role="status">{i18n.language === 'ar' ? 'استقبال الطلبات متوقف مؤقتًا حاليًا. المنتجات معروضة للتصفح فقط.' : 'Ordering is temporarily paused. Products are shown for browsing only.'}</div>
      <InstallBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/product/:slug" element={<Product />} />
        <Route path="/store/:slug" element={<Store />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/account" element={<Account />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/seller" element={<Seller />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/orders" element={<AdminOrders />} />
        <Route path="/install" element={<Install />} />
      </Routes>
      <footer>
        <button className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          {i18n.language === 'ar' ? 'العودة إلى الأعلى' : 'Back to top'}
        </button>
        <div className="site-footer">
          <div className="footer-logo">VORQ<span className="logo-accent">O</span>N</div>
          <div className="footer-tag">BEYOND POSSIBILITIES</div>
          <nav>
            <Link to="/">{t('browseCategories')}</Link>
            <Link to="/cart">{t('cart')}</Link>
            <Link to="/account">{t('account')}</Link>
            <Link to="/seller">{t('sellerCenter')}</Link>
            <Link to="/install">{t('installApp')}</Link>
          </nav>
        </div>
      </footer>
      <MobileBottomNav lang={i18n.language} cartCount={cartCount} user={user} />
    </div>
  );
}
