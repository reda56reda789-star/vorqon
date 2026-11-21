// Cart — one cart per user, multi-seller allowed.
// Checkout splits by seller in services/orders.js.
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { t } = require('../utils/i18n');

const router = express.Router();
router.use(authenticate); // cart requires a signed-in user in v1

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

async function getOrCreateCart(userId) {
  let cart = await prisma.$queryRaw`SELECT id FROM carts WHERE user_id = ${userId}::uuid ORDER BY created_at ASC LIMIT 1`;
  if (!cart.length) {
    const rows = await prisma.$queryRaw`INSERT INTO carts (user_id) VALUES (${userId}::uuid) RETURNING id`;
    cart = rows;
  }
  return cart[0].id;
}

// GET /api/cart
router.get('/', async (req, res, next) => {
  try {
    const cartId = await getOrCreateCart(req.user.id);
    const items = await prisma.$queryRaw`
      SELECT ci.id, ci.quantity, p.id AS product_id, p.name_ar, p.name_en, p.sku,
             p.price, p.currency, p.seller_id, p.stock_quantity
      FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ${cartId}::uuid`;
    const subtotal = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
    res.json({ items, subtotal });
  } catch (e) { next(e); }
});

// POST /api/cart/items { product_id, quantity }
// Adding the same product twice merges into one row. The merge is an
// UPDATE-first: the table's UNIQUE (cart_id, product_id, variant_id)
// can never fire an INSERT ... ON CONFLICT for these rows, because
// variant_id is NULL and NULLs are distinct in a Postgres unique
// index — the old upsert therefore inserted a duplicate row on every
// repeat add instead of incrementing the quantity.
router.post('/items', async (req, res, next) => {
  try {
    const { product_id, quantity } = req.body || {};
    const qty = Number(quantity);
    if (!product_id || !UUID_RE.test(String(product_id)) || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const product = await prisma.$queryRaw`SELECT id FROM products WHERE id = ${product_id}::uuid LIMIT 1`;
    if (!product.length) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const cartId = await getOrCreateCart(req.user.id);
    const merged = await prisma.$queryRaw`
      UPDATE cart_items SET quantity = quantity + ${qty}
      WHERE cart_id = ${cartId}::uuid AND product_id = ${product_id}::uuid AND variant_id IS NULL
      RETURNING id, quantity`;
    if (merged.length) return res.status(201).json({ item: merged[0] });
    const rows = await prisma.$queryRaw`
      INSERT INTO cart_items (cart_id, product_id, quantity)
      VALUES (${cartId}::uuid, ${product_id}::uuid, ${qty})
      RETURNING id, quantity`;
    res.status(201).json({ item: rows[0] });
  } catch (e) { next(e); }
});

// PATCH /api/cart/items/:id { quantity } — set an item's quantity.
// Scoped to the caller's own cart: another user's item id is a 404.
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

// DELETE /api/cart/items/:id — scoped to the caller's own cart (the
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
