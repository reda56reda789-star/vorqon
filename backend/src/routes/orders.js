// Orders — checkout (split by seller) + customer order history + tracking.
// POST /api/orders/checkout builds the parent order + sub-orders in one
// transaction (services/orders.js). Payment is a separate step:
// POST /api/payments/checkout-session (provider redirect, not activated yet).
// POST /api/orders/guest is the guest checkout: no account, name + mobile
// + address only, cash on delivery. It is registered BEFORE the
// authenticate middleware below on purpose — everything after that line
// keeps requiring a signed-in session, exactly as before.
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { createOrderWithSplit } = require('../services/orders');
const { findCartId } = require('../services/carts');
const { t } = require('../utils/i18n');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Normalise an Egyptian mobile to its local 11-digit form
// (+20 / 0020 prefixes stripped) or return null when it is not one.
function egyptianMobile(raw) {
  let s = String(raw || '').replace(/[\s-]/g, '');
  if (s.startsWith('+20')) s = '0' + s.slice(3);
  else if (s.startsWith('0020')) s = '0' + s.slice(4);
  return /^01\d{9}$/.test(s) ? s : null;
}

// POST /api/orders/guest
// Body: { customer: { name, phone, city, address, notes? },
//         items: [{ productId | slug, quantity }], currency? }
// Prices and totals are computed server-side from the products table
// (client-sent prices are never read); stock is checked and decremented
// inside createOrderWithSplit, which splits the order per seller and
// records the same per-item commission as the signed-in checkout.
// Payment is cash on delivery — the repo has no wallet-pending order
// flow (payment providers are not activated), so guests get COD only.
router.post('/guest', async (req, res, next) => {
  try {
    const body = req.body || {};
    const customer = body.customer || body;
    const name = String(customer.name || '').trim();
    const phone = egyptianMobile(customer.phone);
    const city = String(customer.city || '').trim();
    const address = String(customer.address || '').trim();
    const notes = customer.notes ? String(customer.notes).trim() : null;
    if (!name) return res.status(400).json({ error: 'Guest name is required' });
    if (!phone) return res.status(400).json({ error: 'A valid Egyptian mobile number is required (01xxxxxxxxx)' });
    if (!city) return res.status(400).json({ error: 'City is required' });
    if (!address) return res.status(400).json({ error: 'Address is required' });

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) return res.status(400).json({ error: 'Cart is empty' });

    // Resolve every line against published products and price it here.
    const byProduct = new Map();
    for (const raw of rawItems) {
      const quantity = Math.floor(Number(raw && raw.quantity));
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({ error: t(req.lang, 'validation') });
      }
      const ref = String((raw && (raw.productId || raw.slug)) || '').trim();
      if (!ref) return res.status(400).json({ error: t(req.lang, 'validation') });
      const product = await prisma.product.findFirst({
        where: UUID_RE.test(ref) ? { id: ref, status: 'published' } : { slug: ref, status: 'published' },
      });
      if (!product) return res.status(400).json({ error: `Product not found: ${ref}` });
      const prev = byProduct.get(product.id);
      if (prev) prev.quantity += quantity;
      else byProduct.set(product.id, { productId: product.id, variantId: null, quantity, unitPrice: Number(product.price) });
    }

    const result = await createOrderWithSplit({
      userId: null, addressId: null,
      currency: ['EGP', 'USD', 'SAR', 'AED'].includes(body.currency) ? body.currency : 'EGP',
      exchangeRateUsed: 1, items: [...byProduct.values()], couponCode: null,
      guest: { name, phone, city, address }, notes,
      paymentMethodCode: 'cod', paymentStatus: 'cash_on_delivery',
    });
    res.status(201).json({
      guest: true, paymentMethod: 'cod',
      parentOrder: { id: result.parent.id, orderNumber: result.parent.orderNumber, grandTotal: Number(result.parent.grandTotal) },
      subOrders: result.children.map((c) => ({ id: c.id, orderNumber: c.orderNumber, sellerId: c.sellerId, grandTotal: Number(c.grandTotal) })),
    });
  } catch (e) { next(e); }
});

router.use(authenticate);

// POST /api/orders/checkout { address_id, currency, coupon_code? }
// Items are read from the user's cart and priced server-side (never trust client prices).
// address_id is optional (orders.address_id is nullable), but when one
// is supplied it must be one of the buyer's own addresses — an unknown
// or foreign id is a 400, not a database FK error.
router.post('/checkout', requireRole('customer', 'seller'), async (req, res, next) => {
  try {
    const { address_id, currency, coupon_code } = req.body;
    let addressId = null;
    if (address_id) {
      if (!UUID_RE.test(String(address_id))) return res.status(400).json({ error: t(req.lang, 'validation') });
      const addr = await prisma.address.findFirst({ where: { id: address_id, userId: req.user.id }, select: { id: true } });
      if (!addr) return res.status(400).json({ error: t(req.lang, 'validation') });
      addressId = addr.id;
    }
    // The cart is resolved through the same single path the cart
    // endpoints use (services/carts.js): the user's oldest cart. The
    // old code ran SELECT ... LIMIT 1 with no ORDER BY here while
    // routes/cart.js picked the oldest cart, so for a user with more
    // than one cart row, checkout could consume a different cart than
    // the one the cart page displayed and the adds merged into.
    const cartId = await findCartId(prisma, req.user.id);
    if (!cartId) return res.status(400).json({ error: 'Cart is empty' });
    const items = await prisma.$queryRaw`
      SELECT ci.product_id, ci.variant_id, ci.quantity, p.price, p.currency
      FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ${cartId}::uuid`;
    if (!items.length) return res.status(400).json({ error: 'Cart is empty' });
    const priced = items.map((i) => ({ productId: i.product_id, variantId: i.variant_id, quantity: i.quantity, unitPrice: Number(i.price) }));
    const result = await createOrderWithSplit({
      userId: req.user.id, addressId,
      currency: ['EGP', 'USD', 'SAR', 'AED'].includes(currency) ? currency : 'EGP',
      exchangeRateUsed: 1, items: priced, couponCode: coupon_code || null,
    });
    // Empty the cart after a successful checkout.
    await prisma.$executeRaw`DELETE FROM cart_items WHERE cart_id = ${cartId}::uuid`;
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
