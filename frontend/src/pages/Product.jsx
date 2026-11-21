// Product detail page — loads /api/products/:slug. Three-column layout
// (media | details | buy box); on mobile the buy box stacks right after
// the image. Add-to-cart / buy-now work for everyone: signed-in users
// post to the server cart (POST /api/cart/items); guests write to the
// local guest cart (lib/guestCart.js) and check out from the cart page
// with name + mobile + address — no sign-in required.
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl, pickName } from '../lib/api.js';
import { addToCart as addToCartUnified } from '../lib/guestCart.js';
import { ProductMedia, Stars, formatPrice } from '../components/ProductCard.jsx';

export default function Product() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { slug } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(apiUrl(`/api/products/${slug}`)).then((r) => r.json()).then((d) => setProduct(d.product || null)).catch(() => {});
  }, [slug]);

  if (!product) return <main className="container page">{t('loading')}</main>;

  const inStock = product.stockQuantity > 0;
  const images = Array.isArray(product.images) ? product.images.filter((im) => im.url) : [];
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const reviews = Array.isArray(product.reviews) ? product.reviews : [];
  const compareAt = product.compareAt ?? product.compare_at_price ?? product.compareAtPrice;
  const hasDeal = compareAt != null && Number(compareAt) > Number(product.price);

  async function addToCart(goToCart) {
    setBusy(true);
    setError('');
    try {
      await addToCartUnified(product, qty);
      if (goToCart) navigate('/cart');
      else { setAdded(true); setTimeout(() => setAdded(false), 2500); }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container page">
      <div className="product-layout">
        <div className="product-media-col">
          {images.length > 0 ? (
            <>
              <div className="product-media">
                <img src={images[activeImage]?.url} alt={pickName(product, lang)} />
              </div>
              {images.length > 1 && (
                <div className="thumb-row">
                  {images.map((im, i) => (
                    <button key={im.id || i} className={i === activeImage ? 'active' : ''} onClick={() => setActiveImage(i)}>
                      <img src={im.url} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <ProductMedia product={product} lang={lang} large />
          )}
        </div>

        <section className="product-details-col">
          <h1>{pickName(product, lang)}</h1>
          {Number(product.ratingCount) > 0 && (
            <Stars value={product.ratingAvg} count={product.ratingCount} />
          )}
          <hr className="divider" />
          <div className="price-row">
            <span className="price" style={{ fontSize: 28 }}>{formatPrice(product.price)}</span>
            <span className="price-cur">{product.currency}</span>
            {hasDeal && <span className="old-price">{formatPrice(compareAt)} {product.currency}</span>}
            {hasDeal && <span className="deal-text">-{Math.round((1 - Number(product.price) / Number(compareAt)) * 100)}%</span>}
          </div>
          {product.description && <p style={{ marginTop: 12 }}>{product.description}</p>}
          <div className="detail-list">
            <div className="dl-row"><span className="dl-key">{t('sku')}</span><span>{product.sku}</span></div>
            <div className="dl-row">
              <span className="dl-key">{t('stock')}</span>
              <span className={inStock ? 'availability in' : 'availability out'} style={{ fontSize: 14 }}>
                {inStock ? (lang === 'en' ? 'In Stock' : 'متوفر') : (lang === 'en' ? 'Out of Stock' : 'غير متوفر')}
              </span>
            </div>
          </div>
          {variants.length > 0 && (
            <>
              <h3>{lang === 'en' ? 'Variants' : 'الخيارات'}</h3>
              <div className="variant-chips">
                {variants.map((v) => (
                  <span className="variant-chip" key={v.id}>
                    {[lang === 'en' ? v.colorEn : v.colorAr, v.sizeValue].filter(Boolean).join(' — ') || v.sku}
                  </span>
                ))}
              </div>
            </>
          )}
          {reviews.length > 0 && (
            <>
              <hr className="divider" />
              <h3>{lang === 'en' ? 'Reviews' : 'التقييمات'}</h3>
              {reviews.map((r) => (
                <div className="review-item" key={r.id}>
                  <Stars value={r.rating} />
                  {r.body && <p style={{ marginTop: 6 }}>{r.body}</p>}
                </div>
              ))}
            </>
          )}
        </section>

        <aside className="buy-box">
          <div>
            <span className="buy-price">{formatPrice(product.price)}</span>{' '}
            <span className="price-cur">{product.currency}</span>
          </div>
          <span className={`availability ${inStock ? 'in' : 'out'}`}>
            {inStock ? (lang === 'en' ? 'In Stock' : 'متوفر') : (lang === 'en' ? 'Out of Stock' : 'غير متوفر')}
          </span>
          <div>
            <label htmlFor="qty">{t('quantity')}</label>
            <span className="qty-stepper">
              <button type="button" aria-label="-" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <span className="qty-value" id="qty">{qty}</span>
              <button type="button" aria-label="+" onClick={() => setQty((q) => Math.min(product.stockQuantity || 99, q + 1))}>+</button>
            </span>
          </div>
          {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}
          {added && <p className="notice-text" style={{ margin: 0 }}>{t('done')}</p>}
          <button className="btn-gold btn-block" disabled={!inStock || busy} onClick={() => addToCart(false)}>
            {lang === 'en' ? 'Add to Cart' : 'أضف إلى السلة'}
          </button>
          <button className="btn-orange btn-block" disabled={!inStock || busy} onClick={() => addToCart(true)}>
            {lang === 'en' ? 'Buy Now' : 'اشترِ الآن'}
          </button>
        </aside>
      </div>
    </main>
  );
}
