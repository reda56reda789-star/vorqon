// Cart — one cart per user, multi-seller allowed.
// Checkout splits by seller in services/orders.js.
// Cart identity comes from services/carts.js (single resolution path,
// shared with order placement): the user's oldest cart is THE cart.
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { getOrCreateCartId } = require('../services/carts');
const { t } = require('../utils/i18n');

const router = express.Router();
router.use(authenticate); // cart requires a signed-in user in v1

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isUniqueViolation(e) {
  if (!e) return false;
  if (e.code === '23505') return true;
  if (e.meta && e.meta.code === '23505') return true;
  return /duplicate key|unique constraint/i.test(String(e.message || ''));
}

// Merge-add one line into the cart: UPDATE-first with a NULL-safe
// variant match (IS NOT DISTINCT FROM treats two NULL variants as the
// same line; the table's UNIQUE (cart_id, product_id, variant_id)
// cannot do that — NULLs are distinct in a Postgres unique index, so
// it never backstopped duplicates). When the UPDATE misses, INSERT;
// if a concurrent add won the insert race, the cart_items_unique_line
// index (schema.sql + cart-dedupe-v1 fixup) turns the loser into a
// unique violation and we retry the merge UPDATE instead of failing
// or duplicating the row.
async function mergeCartItem(cartId, productId, variantId, qty) {
  const updated = await prisma.$queryRaw`
    UPDATE cart_items SET quantity = quantity + ${qty}
    WHERE cart_id = ${cartId}::uuid AND product_id = ${productId}::uuid
      AND variant_id IS NOT DISTINCT FROM ${variantId}::uuid
    RETURNING id, quantity`;
  if (updated.length) return updated[0];
  try {
    const inserted = await prisma.$queryRaw`
      INSERT INTO cart_items (cart_id, product_id, variant_id, quantity)
      VALUES (${cartId}::uuid, ${productId}::uuid, ${variantId}::uuid, ${qty})
      RETURNING id, quantity`;
    return inserted[0];
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const retried = await prisma.$queryRaw`
      UPDATE cart_items SET quantity = quantity + ${qty}
      WHERE cart_id = ${cartId}::uuid AND product_id = ${productId}::uuid
        AND variant_id IS NOT DISTINCT FROM ${variantId}::uuid
      RETURNING id, quantity`;
    if (retried.length) return retried[0];
    throw e;
  }
}

// GET /api/cart
router.get('/', async (req, res, next) => {
  try {
    const cartId = await getOrCreateCartId(prisma, req.user.id);
    const items = await prisma.$queryRaw`
      SELECT ci.id, ci.quantity, p.id AS product_id, p.name_ar, p.name_en, p.sku,
             p.price, p.currency, p.seller_id, p.stock_quantity
      FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ${cartId}::uuid`;
    const subtotal = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
    res.json({ items, subtotal });
  } catch (e) { next(e); }
});

// POST /api/cart/items { product_id, quantity, variant_id? }
// Adding the same (product, variant) twice merges into one row —
// see mergeCartItem above.
router.post('/items', async (req, res, next) => {
  try {
    const { product_id, quantity, variant_id } = req.body || {};
    const qty = Number(quantity);
    if (!product_id || !UUID_RE.test(String(product_id)) || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    if (variant_id !== undefined && variant_id !== null && !UUID_RE.test(String(variant_id))) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const product = await prisma.$queryRaw`SELECT id FROM products WHERE id = ${product_id}::uuid LIMIT 1`;
    if (!product.length) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const cartId = await getOrCreateCartId(prisma, req.user.id);
    const item = await mergeCartItem(cartId, product_id, variant_id || null, qty);
    res.status(201).json({ item });
  } catch (e) { next(e); }
});

// PATCH /api/cart/items/:id { quantity } — set an item's quantity.
// Scoped to the caller's own carts: another user's item id is a 404.
router.patch('/items/:id', async (req, res, next) => {
  try {
    const qty = Number((req.body || {}).quantity);
    if (!UUID_RE.test(String(req.params.id)) || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const rows = await prisma.$queryRaw`
      UPDATE cart_items ci SET quantity = ${qty}
      FROM carts c
      WHERE ci.cart_id = c.id AND ci.id = ${req.params.id}::uuid AND c.user_id = ${req.user.id}::uuid
      RETURNING ci.id, ci.quantity`;
    if (!rows.length) return res.status(404).json({ error: t(req.lang, 'notFound') });
    res.json({ item: rows[0] });
  } catch (e) { next(e); }
});

// DELETE /api/cart/items/:id — scoped to the caller's own carts (the
// old handler deleted any cart item by id, whoever it belonged to).
router.delete('/items/:id', async (req, res, next) => {
  try {
    if (!UUID_RE.test(String(req.params.id))) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const removed = await prisma.$executeRaw`
      DELETE FROM cart_items
      WHERE id = ${req.params.id}::uuid
        AND cart_id IN (SELECT id FROM carts WHERE user_id = ${req.user.id}::uuid)`;
    res.json({ ok: true, removed });
  } catch (e) { next(e); }
});

module.exports = router;
