// Cart — one cart per user (or session for guests), multi-seller allowed.
// Checkout splits by seller in services/orders.js.
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { t } = require('../utils/i18n');

const router = express.Router();
router.use(authenticate); // cart requires a signed-in user in v1

async function getOrCreateCart(userId) {
  let cart = await prisma.$queryRaw`SELECT id FROM carts WHERE user_id = ${userId}::uuid LIMIT 1`;
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
router.post('/items', async (req, res, next) => {
  try {
    const { product_id, quantity } = req.body;
    if (!product_id || !quantity || Number(quantity) < 1) return res.status(400).json({ error: t(req.lang, 'validation') });
    const cartId = await getOrCreateCart(req.user.id);
    const rows = await prisma.$queryRaw`
      INSERT INTO cart_items (cart_id, product_id, quantity)
      VALUES (${cartId}::uuid, ${product_id}::uuid, ${Number(quantity)})
      ON CONFLICT (cart_id, product_id, variant_id)
      DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
      RETURNING id, quantity`;
    res.status(201).json({ item: rows[0] });
  } catch (e) { next(e); }
});

// DELETE /api/cart/items/:id
router.delete('/items/:id', async (req, res, next) => {
  try {
    await prisma.$executeRaw`DELETE FROM cart_items WHERE id = ${req.params.id}::uuid`;
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
