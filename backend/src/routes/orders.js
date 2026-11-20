// Orders — checkout (split by seller) + customer order history + tracking.
// POST /api/orders/checkout builds the parent order + sub-orders in one
// transaction (services/orders.js). Payment is a separate step:
// POST /api/payments/checkout-session (provider redirect, not activated yet).
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { createOrderWithSplit } = require('../services/orders');
const { t } = require('../utils/i18n');

const router = express.Router();
router.use(authenticate);

// POST /api/orders/checkout { address_id, currency, coupon_code? }
// Items are read from the user's cart and priced server-side (never trust client prices).
router.post('/checkout', requireRole('customer', 'seller'), async (req, res, next) => {
  try {
    const { address_id, currency, coupon_code } = req.body;
    const cart = await prisma.$queryRaw`SELECT id FROM carts WHERE user_id = ${req.user.id}::uuid LIMIT 1`;
    if (!cart.length) return res.status(400).json({ error: 'Cart is empty' });
    const items = await prisma.$queryRaw`
      SELECT ci.product_id, ci.variant_id, ci.quantity, p.price, p.currency
      FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ${cart[0].id}::uuid`;
    if (!items.length) return res.status(400).json({ error: 'Cart is empty' });
    const priced = items.map((i) => ({ productId: i.product_id, variantId: i.variant_id, quantity: i.quantity, unitPrice: Number(i.price) }));
    const result = await createOrderWithSplit({
      userId: req.user.id, addressId: address_id || null,
      currency: ['EGP', 'USD', 'SAR', 'AED'].includes(currency) ? currency : 'EGP',
      exchangeRateUsed: 1, items: priced, couponCode: coupon_code || null,
    });
    // Empty the cart after a successful checkout.
    await prisma.$executeRaw`DELETE FROM cart_items WHERE cart_id = ${cart[0].id}::uuid`;
    res.status(201).json({
      parentOrder: { id: result.parent.id, orderNumber: result.parent.orderNumber, grandTotal: Number(result.parent.grandTotal) },
      subOrders: result.children.map((c) => ({ id: c.id, orderNumber: c.orderNumber, sellerId: c.sellerId, grandTotal: Number(c.grandTotal) })),
    });
  } catch (e) { next(e); }
});

// GET /api/orders — my parent orders
router.get('/', async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({ where: { userId: req.user.id, parentOrderId: null }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ orders });
  } catch (e) { next(e); }
});

// GET /api/orders/:id — parent order + its sub-orders + items
router.get('/:id', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.user.id }, include: { items: true, children: { include: { items: true } } } });
    if (!order) return res.status(404).json({ error: t(req.lang, 'notFound') });
    res.json({ order });
  } catch (e) { next(e); }
});

module.exports = router;
