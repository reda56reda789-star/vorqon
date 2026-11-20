// Public store page — GET /api/sellers/stores/:slug (store info + its
// published products), mirroring the live store's store pages.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiUrl, pickName } from '../lib/api.js';

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

  if (error) return <main style={{ padding: 16 }}><p style={{ color: 'crimson' }}>{error}</p></main>;
  if (!store) return <main style={{ padding: 16 }}>{t('loading')}</main>;

  return (
    <main style={{ padding: 16 }}>
      <h1>{pickName(store, i18n.language)}</h1>
      {store.description && <p>{store.description}</p>}
      <h2>{t('products')}</h2>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            <Link to={`/product/${p.slug}`}>{pickName(p, i18n.language)}</Link> — {p.price} {p.currency}
          </li>
        ))}
      </ul>
    </main>
  );
}
