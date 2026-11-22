// Shared product presentation — media (real image when the API provides
// one, navy placeholder tile otherwise), star rating, price formatting,
// and the Amazon-style product card used by Home / Search / Store.
// The card's Add to Cart button uses the unified cart helper: server
// cart for signed-in users, local guest cart otherwise.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { pickName } from '../lib/api.js';
import { addToCart } from '../lib/guestCart.js';

export function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value ?? '';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// Products in the seeded catalogue carry no images (the list API returns
// no image field and product_images is empty), so this renders the real
// image only when one is actually present in the payload and falls back
// to a navy tile with the product name's first letter everywhere else.
export function ProductMedia({ product, lang, large = false }) {
  const images = Array.isArray(product?.images) ? product.images : [];
  const main = images.find((im) => im.isMain) || images[0];
  if (main?.url) {
    return (
      <div className="product-media">
        <img src={main.url} alt={pickName(product, lang)} loading="lazy" />
      </div>
    );
  }
  const name = pickName(product, lang);
  const letter = (name.trim().charAt(0) || 'V').toUpperCase();
  return (
    <div className="product-media">
      <div className={`media-placeholder${large ? ' large' : ''}`} aria-hidden="true">
        <span className="ph-letter">{letter}</span>
        <span className="ph-brand">VORQON</span>
      </div>
    </div>
  );
}

export function Stars({ value, count }) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  const pct = (rating / 5) * 100;
  return (
    <span>
      <span className="stars" aria-label={`${rating} / 5`}>
        ★★★★★
        <span className="stars-fill" style={{ width: `${pct}%` }}>★★★★★</span>
      </span>
      {count != null && <span className="rating-count">{Number(count).toLocaleString('en-US')}</span>}
    </span>
  );
}

export default function ProductCard({ product: p, lang }) {
  const { t } = useTranslation();
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = pickName(p, lang);
  const compareAt = p.compareAt ?? p.compare_at_price ?? p.compareAtPrice;
  const price = Number(p.price);
  const hasDeal = compareAt != null && Number(compareAt) > price;
  const pctOff = hasDeal ? Math.round((1 - price / Number(compareAt)) * 100) : 0;
  const outOfStock = p.stockQuantity != null && Number(p.stockQuantity) <= 0;

  async function onAdd() {
    setBusy(true); setError('');
    try {
      await addToCart(p, 1);
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch { setError(lang === 'ar' ? 'تعذّرت الإضافة. حاول مرة أخرى.' : 'Could not add item. Please try again.'); }
    finally { setBusy(false); }
  }

  return (
    <article className="product-card">
      <Link to={`/product/${p.slug}`} style={{ position: 'relative', display: 'block' }}>
        {hasDeal && <span className="deal-badge">-{pctOff}%</span>}
        <ProductMedia product={p} lang={lang} />
      </Link>
      <Link className="product-name" to={`/product/${p.slug}`}>{name}</Link>
      {Number(p.ratingCount) > 0 && <Stars value={p.ratingAvg} count={p.ratingCount} />}
      <div className="price-row">
        <span className="price">{formatPrice(p.price)}</span>
        <span className="price-cur">{p.currency}</span>
        {hasDeal && <span className="old-price">{formatPrice(compareAt)} {p.currency}</span>}
      </div>
      {hasDeal && <span className="deal-text">-{pctOff}%</span>}
      <button type="button" className="btn-gold btn-block card-add-btn" disabled={outOfStock || busy} onClick={onAdd}>
        {busy ? (lang === 'ar' ? 'جارٍ الإضافة…' : 'Adding…') : added ? (lang === 'ar' ? 'تمت الإضافة ✓' : 'Added ✓') : t('addToCart')}
      </button>
      <div role="status" className="card-feedback">{error && <span className="error-text">{error}</span>}{added && <Link to="/cart">{lang === 'ar' ? 'افتح السلة' : 'View cart'}</Link>}</div>
    </article>
  );
}
