import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';

export function MobileActions({ user, lang, onLang, onLogout, cartCount }) {
  const ar = lang === 'ar';
  const menu = useRef(null);
  const location = useLocation();
  useEffect(() => { if (menu.current) menu.current.open = false; }, [location.pathname, location.search]);
  return <div className="mobile-actions">
    <Link className="mobile-cart" to="/cart" aria-label={`${ar ? 'السلة' : 'Cart'} (${cartCount})`}><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={paths.cart}/></svg></span> {ar ? 'السلة' : 'Cart'} <b>{cartCount}</b></Link>
    <details ref={menu} className="mobile-menu">
      <summary>{ar ? 'القائمة' : 'Menu'} <span aria-hidden="true">☰</span></summary>
      <div className="mobile-menu-panel">
        <Link to={user ? '/account' : '/login'}>{ar ? 'حسابي وطلباتي' : 'Account & orders'}</Link>
        {!user && <Link to="/register">{ar ? 'إنشاء حساب' : 'Create account'}</Link>}
        {user?.role === 'seller' && <Link to="/seller">{ar ? 'مركز البائعين' : 'Seller center'}</Link>}
        {['admin','staff'].includes(user?.role) && <Link to="/admin">{ar ? 'لوحة الإدارة' : 'Admin dashboard'}</Link>}
        <Link to="/install">{ar ? 'تثبيت التطبيق' : 'Install app'}</Link>
        <button type="button" onClick={onLang}>{ar ? 'English' : 'العربية'}</button>
        {user && <button type="button" onClick={onLogout}>{ar ? 'تسجيل الخروج' : 'Sign out'}</button>}
      </div>
    </details>
  </div>;
}
const paths = {
  home: 'M3 11 12 3l9 8v10h-6v-7H9v7H3Z',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',
  cart: 'M2 3h3l3 12h10l4-9H6M9 21h.01M18 21h.01',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 22v-3a8 8 0 0 1 16 0v3',
};
export function MobileBottomNav({ lang, cartCount, user }) {
  const { pathname } = useLocation();
  const ar = lang === 'ar';
  const links = [
    {key:'home',to:'/',label:ar?'الرئيسية':'Home',active:pathname==='/'},
    {key:'search',to:'/search',label:ar?'تصفّح':'Browse',active:pathname==='/search'},
    {key:'cart',to:'/cart',label:ar?'السلة':'Cart',active:pathname==='/cart'||pathname==='/checkout'},
    {key:'account',to:user?'/account':'/login',label:ar?'حسابي':'Account',active:['/account','/login','/register'].includes(pathname)},
  ];
  return <nav className="mobile-bottom-nav" aria-label={ar?'التنقل الرئيسي':'Main navigation'}>{links.map(x=><Link key={x.key} to={x.to} aria-current={x.active?'page':undefined}>
    <span className="mobile-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={paths[x.key]}/></svg>{x.key==='cart'&&cartCount>0&&<b>{cartCount}</b>}</span><span>{x.label}</span>
  </Link>)}</nav>;
}
