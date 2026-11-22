import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { pickName } from '../lib/api.js';
import { formatPrice } from './ProductCard.jsx';

export default function CartItems({ items, itemKey, onQuantity, onRemove, busy = false, readOnly = false }) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language === 'ar';
  return <div className="shopping-cart-items">{items.map(it => {
    const id = itemKey(it);
    const name = pickName(it, i18n.language);
    const quantity = Number(it.quantity) || 1;
    return <article className="shopping-cart-item" key={id}>
      <h2>{it.slug ? <Link to={`/product/${it.slug}`}>{name}</Link> : name}</h2>
      <p className="shopping-unit-price">{formatPrice(it.price)} {it.currency || 'EGP'} {ar ? 'للواحدة' : 'each'}</p>
      <div className="shopping-cart-line">
        {readOnly ? <span>{t('quantity')}: {quantity}</span> : <div className="qty-stepper">
          <button type="button" disabled={busy || quantity <= 1} aria-label={`${ar ? 'تقليل كمية' : 'Decrease quantity of'} ${name}`} onClick={() => onQuantity(it, quantity - 1)}>−</button>
          <output className="qty-value" aria-label={`${t('quantity')} ${name}`}>{quantity}</output>
          <button type="button" disabled={busy || quantity >= 99} aria-label={`${ar ? 'زيادة كمية' : 'Increase quantity of'} ${name}`} onClick={() => onQuantity(it, quantity + 1)}>+</button>
        </div>}
        <strong>{formatPrice(Number(it.price) * quantity)} {it.currency || 'EGP'}</strong>
      </div>
      {!readOnly && <button type="button" className="cart-remove" disabled={busy} onClick={() => onRemove(id)}>{t('remove')} <span className="sr-only">{name}</span></button>}
    </article>;
  })}</div>;
}

export function ShoppingSummary({ subtotal, currency = 'EGP', children }) {
  const { i18n } = useTranslation(); const ar = i18n.language === 'ar';
  return <aside className="panel cart-summary shopping-summary">
    <h2>{ar ? 'ملخص السلة' : 'Cart summary'}</h2>
    <div className="summary-row"><span>{ar ? 'قيمة المنتجات' : 'Products subtotal'}</span><strong>{formatPrice(subtotal)} {currency}</strong></div>
    <div className="summary-row"><span>{ar ? 'الشحن' : 'Shipping'}</span><span>{ar ? 'غير محسوب' : 'Not calculated'}</span></div>
    <p className="shopping-subtotal-note">{ar ? 'المعروض هو قيمة المنتجات فقط، وليس الإجمالي النهائي. الطلبات متوقفة حاليًا.' : 'This is the products subtotal, not a final total. Ordering is currently paused.'}</p>
    {children}
  </aside>;
}
