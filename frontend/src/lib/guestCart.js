// Guest cart — a localStorage-backed cart for signed-out visitors, plus
// a unified addToCart() used by product cards and the product page:
// signed-in users post to the server cart (POST /api/cart/items),
// guests write to the local cart instead. The two carts are deliberately
// NOT merged: after sign-in the header badge and the cart page show the
// server cart, and the local guest cart is left untouched.
import { apiFetch, getSessionUser, SESSION_EVENT } from './api.js';

const GUEST_KEY = 'vorqon-guest-cart';
export const GUEST_CART_EVENT = 'vorqon-guest-cart';

function read() {
  try {
    const items = JSON.parse(localStorage.getItem(GUEST_KEY) || '[]');
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function write(items) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(GUEST_CART_EVENT));
}

export function getGuestCart() {
  return read();
}

export function guestCartCount() {
  return read().reduce((s, it) => s + (Number(it.quantity) || 0), 0);
}

// Snapshot the display fields the cart page needs (name/price/image);
// the guest order endpoint re-prices everything server-side anyway.
export function addToGuestCart(product, quantity = 1) {
  const items = read();
  const prev = items.find((it) => it.productId === product.id);
  if (prev) {
    prev.quantity += quantity;
  } else {
    const images = Array.isArray(product.images) ? product.images : [];
    const main = images.find((im) => im.isMain) || images[0];
    items.push({
      productId: product.id,
      slug: product.slug,
      nameAr: product.nameAr || product.name_ar || '',
      nameEn: product.nameEn || product.name_en || '',
      price: Number(product.price) || 0,
      currency: product.currency || 'EGP',
      imageUrl: main?.url || null,
      quantity,
    });
  }
  write(items);
}

export function setGuestQuantity(productId, quantity) {
  const items = read();
  const it = items.find((x) => x.productId === productId);
  if (!it) return;
  it.quantity = Math.max(1, Math.floor(Number(quantity)) || 1);
  write(items);
}

export function removeFromGuestCart(productId) {
  write(read().filter((it) => it.productId !== productId));
}

export function clearGuestCart() {
  localStorage.removeItem(GUEST_KEY);
  window.dispatchEvent(new Event(GUEST_CART_EVENT));
}

// Unified add: server cart when signed in, local guest cart otherwise.
export async function addToCart(product, quantity = 1) {
  if (getSessionUser()) {
    await apiFetch('/api/cart/items', { method: 'POST', body: { product_id: product.id, quantity } });
    // App.jsx refreshes the header badge on SESSION_EVENT.
    window.dispatchEvent(new Event(SESSION_EVENT));
  } else {
    addToGuestCart(product, quantity);
  }
}
