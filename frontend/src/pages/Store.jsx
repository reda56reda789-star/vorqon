// Public store page — GET /api/sellers/stores/:slug (store info + its
// published products), mirroring the live store's store pages.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiUrl, pickName } from '../lib/api.js';
import ProductCard from '../components/ProductCard.jsx';

export default function Store() {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(apiUrl(`/api/sellers/stores/${slug}?lang=${i18n.language}`))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then((d) => {
        setStore(d.store);
        setProducts(d.products || []);
      })
      .catch((e) => setError(e.message));
  }, [slug, i18n.language]);

  if (error) return <main className="container page"><p className="error-text">{error}</p></main>;
  if (!store) return <main className="container page">{t('loading')}</main>;

  return (
    <main>
      <section className="hero">
        <div className="container">
          <h1>{pickName(store, i18n.language)}</h1>
          {store.description && <p style={{ color: '#fff', letterSpacing: 0 }}>{store.description}</p>}
        </div>
      </section>
      <div className="container page">
        <h2 className="section-title">{t('products')}</h2>
        {products.length === 0 ? (
          <p>{t('noProducts')}</p>
        ) : (
          <div className="product-grid">
            {products.map((p) => <ProductCard key={p.id} product={p} lang={i18n.language} />)}
          </div>
        )}
      </div>
    </main>
  );
}
