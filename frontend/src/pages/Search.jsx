// Search results page — reads ?q= from the URL and calls /api/products.
import { useSearchParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api.js';

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const [products, setProducts] = useState([]);
  useEffect(() => {
    fetch(apiUrl(`/api/products?q=${encodeURIComponent(q)}`)).then((r) => r.json()).then((d) => setProducts(d.products || [])).catch(() => {});
  }, [q]);
  return (
    <main style={{ padding: 16 }}>
      <h1>نتائج البحث: {q}</h1>
      <ul>{products.map((p) => <li key={p.id}><Link to={`/product/${p.slug}`}>{p.name}</Link> — {p.price} {p.currency}</li>)}</ul>
    </main>
  );
}
