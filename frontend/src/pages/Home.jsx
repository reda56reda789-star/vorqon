// Home page — loads categories + best sellers from the API (no hard-coded catalogue).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../lib/api.js';

export default function Home() {
  const { t, i18n } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  useEffect(() => {
    fetch(apiUrl(`/api/categories?lang=${i18n.language}`)).then((r) => r.json()).then((d) => setCategories(d.categories || [])).catch(() => {});
    fetch(apiUrl(`/api/products?sort=best_selling&limit=12&lang=${i18n.language}`)).then((r) => r.json()).then((d) => setProducts(d.products || [])).catch(() => {});
  }, [i18n.language]);
  return (
    <main style={{ padding: 16 }}>
      <h1>{t('welcome')}</h1>
      <h2>{t('browseCategories')}</h2>
      <ul>{categories.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
      <h2>{t('bestSellers')}</h2>
      <ul>{products.map((p) => <li key={p.id}>{p.name} — {p.price} {p.currency}</li>)}</ul>
    </main>
  );
}
