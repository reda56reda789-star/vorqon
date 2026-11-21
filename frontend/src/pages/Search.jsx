// Search results page — reads ?q= and ?category= from the URL and
// calls /api/products (both are supported API filters). Loading,
// fetch-error (with retry), and genuinely-empty are three distinct
// states: a failed fetch must never render as "no products".
import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl, pickName } from '../lib/api.js';
import ProductCard from '../components/ProductCard.jsx';
import ListError from '../components/ListError.jsx';

export default function Search() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const [products, setProducts] = useState([]);
  const [categoryName, setCategoryName] = useState('');
  const [status, setStatus] = useState('loading'); // loading | error | done
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const search = new URLSearchParams();
    if (q) search.set('q', q);
    if (category) search.set('category', category);
    search.set('limit', '48');
    fetch(apiUrl(`/api/products?${search.toString()}`))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { if (!cancelled) { setProducts(d.products || []); setStatus('done'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [q, category, reloadKey]);

  useEffect(() => {
    if (!category) { setCategoryName(''); return; }
    fetch(apiUrl(`/api/categories?lang=${i18n.language}`))
      .then((r) => r.json())
      .then((d) => {
        const found = (d.categories || []).find((c) => c.id === category);
        setCategoryName(found ? pickName(found, i18n.language) : '');
      })
      .catch(() => {});
  }, [category, i18n.language]);

  const heading = q
    ? `${i18n.language === 'en' ? 'Search results' : 'نتائج البحث'}: ${q}`
    : categoryName || t('products');

  return (
    <main className="container page">
      <h1>{heading}</h1>
      {status === 'loading' ? (
        <p>{t('loading')}</p>
      ) : status === 'error' ? (
        <ListError onRetry={() => setReloadKey((k) => k + 1)} />
      ) : products.length === 0 ? (
        <p>{t('noProducts')}</p>
      ) : (
        <div className="product-grid">
          {products.map((p) => <ProductCard key={p.id} product={p} lang={i18n.language} />)}
        </div>
      )}
    </main>
  );
}
