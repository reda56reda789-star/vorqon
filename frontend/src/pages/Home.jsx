// Home page — hero, category tiles, best sellers + new arrivals from
// the API (no hard-coded catalogue). A failed products fetch renders
// an error + retry state, never an empty grid: during DB connection
// drops the lists used to flash "no products" for data that exists.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiUrl, pickName } from '../lib/api.js';
import ProductCard from '../components/ProductCard.jsx';
import ListError from '../components/ListError.jsx';

export default function Home() {
  const { t, i18n } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [listError, setListError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetch(apiUrl(`/api/categories?lang=${i18n.language}`)).then((r) => r.json()).then((d) => setCategories(d.categories || [])).catch(() => {});
  }, [i18n.language]);

  useEffect(() => {
    let cancelled = false;
    setListError(false);
    const load = (params, set) => fetch(apiUrl(`/api/products?${params}&lang=${i18n.language}`))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { if (!cancelled) set(d.products || []); });
    Promise.all([
      load('sort=best_selling&limit=12', setProducts),
      load('sort=newest&limit=12', setNewArrivals),
    ]).catch(() => { if (!cancelled) setListError(true); });
    return () => { cancelled = true; };
  }, [i18n.language, reloadKey]);

  return (
    <main>
      <section className="hero">
        <div className="container">
          <h1>{t('welcome')}</h1>
          <p>{t('tagline')}</p>
        </div>
      </section>
      <div className="container page">
        <h2 className="section-title">{t('browseCategories')}</h2>
        <div className="cat-grid">
          {categories.map((c) => {
            const name = pickName(c, i18n.language);
            return (
              <Link className="cat-tile" key={c.id} to={`/search?category=${c.id}`}>
                <span className="cat-tile-badge">{(name.trim().charAt(0) || 'V').toUpperCase()}</span>
                <span className="cat-tile-name">{name}</span>
              </Link>
            );
          })}
        </div>
        <h2 className="section-title">{t('bestSellers')}</h2>
        {listError ? (
          <ListError onRetry={() => setReloadKey((k) => k + 1)} />
        ) : (
          <>
            <div className="product-grid">
              {products.map((p) => <ProductCard key={p.id} product={p} lang={i18n.language} />)}
            </div>
            {newArrivals.length > 0 && (
              <>
                <h2 className="section-title">{t('newArrivals')}</h2>
                <div className="product-grid">
                  {newArrivals.map((p) => <ProductCard key={p.id} product={p} lang={i18n.language} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
