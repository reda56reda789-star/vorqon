// Product detail page — loads /api/products/:slug.
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api.js';

export default function Product() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  useEffect(() => {
    fetch(apiUrl(`/api/products/${slug}`)).then((r) => r.json()).then((d) => setProduct(d.product || null)).catch(() => {});
  }, [slug]);
  if (!product) return <main style={{ padding: 16 }}>…</main>;
  return (
    <main style={{ padding: 16 }}>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      <p>{product.price} {product.currency} — {product.stock_quantity > 0 ? 'متوفر' : 'غير متوفر'}</p>
    </main>
  );
}
