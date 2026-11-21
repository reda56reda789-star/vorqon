// Admin Dashboard — stats, seller approval + commission, orders,
// product review (list + approve/reject), payouts (list + approve),
// coupons (list + create). Seller lifecycle also includes the
// reversible suspend/reactivate pair (store is_active follows).
// All routes: authenticate + requireRole('admin' | 'staff' where noted).
// Every mutating admin action should also write an audit_logs row (see below).
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { ensureStore } = require('../services/stores');
const { t } = require('../utils/i18n');

const router = express.Router();
router.use(authenticate, requireRole('admin', 'staff'));

async function audit(req, action, entityType, entityId) {
  await prisma.$executeRaw`
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, ip_address)
    VALUES (${req.user.id}::uuid, ${action}, ${entityType}, ${entityId}::uuid, ${req.ip || null}::inet)`.catch(() => {});
}

// GET /api/admin/stats — sales, orders, customers, sellers, commissions.
// Cancelled / refunded orders are NOT real business: they are excluded
// from the order count, the sales total, and the commission total (the
// commission exclusion joins each item to its parent order, whose status
// is the customer-facing one).
router.get('/stats', requireRole('admin'), async (req, res, next) => {
  try {
    const [stats] = await prisma.$queryRaw`
      SELECT
        (SELECT count(*)::int FROM orders WHERE parent_order_id IS NULL AND status NOT IN ('cancelled', 'refunded')) AS total_orders,
        (SELECT count(*)::int FROM users WHERE role = 'customer') AS total_customers,
        (SELECT count(*)::int FROM sellers) AS total_sellers,
        (SELECT count(*)::int FROM stores WHERE is_active = true) AS active_stores,
        (SELECT count(*)::int FROM products WHERE status = 'published') AS published_products,
        (SELECT count(*)::int FROM products WHERE status = 'pending_review') AS pending_products,
        (SELECT COALESCE(sum(grand_total),0)::float FROM orders WHERE parent_order_id IS NULL AND status NOT IN ('cancelled', 'refunded')) AS total_sales_egp,
        (SELECT COALESCE(sum(oi.commission_amt),0)::float FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           LEFT JOIN orders p ON p.id = o.parent_order_id
           WHERE COALESCE(p.status, o.status) NOT IN ('cancelled', 'refunded')) AS total_commissions_egp`;
    res.json({ stats });
  } catch (e) { next(e); }
});

// GET /api/admin/sellers?status=pending — review registrations
const SELLER_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];
router.get('/sellers', async (req, res, next) => {
  try {
    const status = req.query.status;
    // sellers.status is the Postgres enum seller_status: Prisma sends an
    // untyped text parameter, which Postgres rejects with
    // "operator does not exist: seller_status = text". Validate against the
    // enum values (400 on anything else) and cast the parameter explicitly.
    if (status && !SELLER_STATUSES.includes(status)) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const sellers = status
      ? await prisma.$queryRaw`SELECT s.id, s.business_name_ar, s.business_name_en, s.status, s.commission_rate, u.email FROM sellers s JOIN users u ON u.id = s.user_id WHERE s.status = ${status}::seller_status ORDER BY s.created_at DESC LIMIT 100`
      : await prisma.$queryRaw`SELECT s.id, s.business_name_ar, s.business_name_en, s.status, s.commission_rate, u.email FROM sellers s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 100`;
    res.json({ sellers });
  } catch (e) { next(e); }
});

// PATCH /api/admin/sellers/:id/approve | /reject
router.patch('/sellers/:id/approve', requireRole('admin'), async (req, res, next) => {
  try {
    const seller = await prisma.seller.update({ where: { id: req.params.id }, data: { status: 'approved' } });
    // Approval is what makes a seller operational: guarantee the store
    // row exists from this moment (products.store_id is a NOT NULL FK,
    // and a registered seller has no store until one is created).
    await ensureStore(prisma, seller).catch(() => {});
    await audit(req, 'seller.approve', 'seller', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.patch('/sellers/:id/reject', requireRole('admin'), async (req, res, next) => {
  try {
    await prisma.seller.update({ where: { id: req.params.id }, data: { status: 'rejected' } });
    await audit(req, 'seller.reject', 'seller', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// PATCH /api/admin/sellers/:id/suspend | /reactivate — suspend is the
// reversible off-switch for a live seller: only an approved seller can
// be suspended, only a suspended seller can be reactivated, and the
// seller's store follows the same switch (stores.is_active drives the
// public storefront and the active-stores stat). updateMany is used
// for the store so a seller whose store row is missing (never created)
// suspends cleanly instead of throwing.
router.patch('/sellers/:id/suspend', requireRole('admin'), async (req, res, next) => {
  try {
    const seller = await prisma.seller.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
    if (!seller) return res.status(404).json({ error: t(req.lang, 'notFound') });
    if (seller.status !== 'approved') return res.status(400).json({ error: t(req.lang, 'validation') });
    await prisma.seller.update({ where: { id: req.params.id }, data: { status: 'suspended' } });
    await prisma.store.updateMany({ where: { sellerId: req.params.id }, data: { isActive: false } });
    await audit(req, 'seller.suspend', 'seller', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.patch('/sellers/:id/reactivate', requireRole('admin'), async (req, res, next) => {
  try {
    const seller = await prisma.seller.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
    if (!seller) return res.status(404).json({ error: t(req.lang, 'notFound') });
    if (seller.status !== 'suspended') return res.status(400).json({ error: t(req.lang, 'validation') });
    await prisma.seller.update({ where: { id: req.params.id }, data: { status: 'approved' } });
    await prisma.store.updateMany({ where: { sellerId: req.params.id }, data: { isActive: true } });
    await audit(req, 'seller.reactivate', 'seller', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// PATCH /api/admin/sellers/:id/commission { commissionRate } — set a
// seller's platform commission (0–100 percent). The rate applies to
// future orders only; order_items recorded their rate at order time.
// The DB CHECK on sellers.commission_rate allows 0–100 (widened from
// the original 50 cap by the commission-range-v1 bootstrap fixup).
router.patch('/sellers/:id/commission', requireRole('admin'), async (req, res, next) => {
  try {
    const rate = Number(req.body && req.body.commissionRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const existing = await prisma.seller.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const seller = await prisma.seller.update({ where: { id: req.params.id }, data: { commissionRate: rate } });
    await audit(req, 'seller.commission', 'seller', req.params.id);
    res.json({ ok: true, seller: { id: seller.id, commissionRate: Number(seller.commissionRate) } });
  } catch (e) { next(e); }
});

// GET /api/admin/orders?status=&page=&limit= — all parent orders.
// Parent orders carry no items and no seller of their own: items and
// sellers live on the per-seller sub-orders (children), so item counts
// and seller names are aggregated from them. Guest orders (user_id NULL)
// surface guest_name / guest_phone instead of an account.
// The status filter goes through the typed Prisma API, so the value is
// bound as the order_status enum — no raw-SQL text/enum mismatch — and
// anything outside the enum is rejected with 400 before querying.
const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded', 'returned'];

function adminOrderRow(o, sellerNames) {
  const children = o.children || [];
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethodCode: o.paymentMethodCode,
    currency: o.currency,
    grandTotal: Number(o.grandTotal),
    isGuest: !o.userId,
    customerName: (o.user && o.user.fullName) || o.guestName || '',
    // Phone: guests recorded theirs on the order itself. Registered
    // customers usually have no phone on their user record, so fall
    // back to the delivery address's phone (captured at checkout)
    // before the user record's phone.
    customerPhone: o.guestPhone || (o.address && o.address.phone) || (o.user && o.user.phone) || '',
    itemCount: children.reduce((sum, c) => sum + (c.items || []).reduce((s, it) => s + it.quantity, 0), 0),
    sellers: children.map((c) => ({
      sellerId: c.sellerId,
      nameAr: (sellerNames.get(c.sellerId) || {}).nameAr || '',
      nameEn: (sellerNames.get(c.sellerId) || {}).nameEn || '',
    })),
  };
}

router.get('/orders', async (req, res, next) => {
  try {
    const status = req.query.status;
    if (status && !ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const where = { parentOrderId: null, ...(status ? { status } : {}) };
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { fullName: true, phone: true } },
          address: { select: { phone: true } },
          children: { select: { sellerId: true, items: { select: { quantity: true } } } },
        },
      }),
    ]);
    const sellerIds = [...new Set(orders.flatMap((o) => (o.children || []).map((c) => c.sellerId)))];
    const sellerNames = new Map();
    if (sellerIds.length) {
      const sellers = await prisma.seller.findMany({
        where: { id: { in: sellerIds } },
        select: { id: true, businessNameAr: true, businessNameEn: true, store: { select: { nameAr: true, nameEn: true } } },
      });
      for (const s of sellers) {
        sellerNames.set(s.id, {
          nameAr: (s.store && s.store.nameAr) || s.businessNameAr || '',
          nameEn: (s.store && s.store.nameEn) || s.businessNameEn || '',
        });
      }
    }
    res.json({ orders: orders.map((o) => adminOrderRow(o, sellerNames)), total, page, pageSize: limit });
  } catch (e) { next(e); }
});

// PATCH /api/admin/orders/:id/status { status } — set an order's status.
// The parent order carries the customer-facing status; the same status
// is propagated to its per-seller sub-orders so the admin list, seller
// orders, and customer history never disagree about an order.
router.patch('/orders/:id/status', requireRole('admin'), async (req, res, next) => {
  try {
    const status = req.body && req.body.status;
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const updated = await prisma.order.update({ where: { id: req.params.id }, data: { status } });
    if (!existing.parentOrderId) {
      await prisma.order.updateMany({ where: { parentOrderId: req.params.id }, data: { status } });
    }
    await audit(req, 'order.status', 'order', req.params.id);
    res.json({ ok: true, order: { id: updated.id, orderNumber: updated.orderNumber, status: updated.status } });
  } catch (e) { next(e); }
});

// GET /api/admin/products?status=&page=&limit= — the moderation list
// (default view: the pending_review queue). The status filter is
// validated against the product_status enum and applied through the
// typed Prisma API, so no raw text/enum comparison can occur.
const PRODUCT_STATUSES = ['draft', 'pending_review', 'published', 'rejected', 'archived'];
router.get('/products', async (req, res, next) => {
  try {
    const status = req.query.status;
    if (status && !PRODUCT_STATUSES.includes(status)) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const where = status ? { status } : {};
    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          seller: { select: { businessNameAr: true, businessNameEn: true } },
          category: { select: { slug: true, nameAr: true, nameEn: true } },
        },
      }),
    ]);
    res.json({
      products: products.map((p) => ({
        id: p.id, sku: p.sku, slug: p.slug,
        nameAr: p.nameAr, nameEn: p.nameEn,
        price: Number(p.price), currency: p.currency,
        stockQuantity: p.stockQuantity, status: p.status, createdAt: p.createdAt,
        sellerNameAr: (p.seller && p.seller.businessNameAr) || '',
        sellerNameEn: (p.seller && p.seller.businessNameEn) || '',
        categorySlug: (p.category && p.category.slug) || '',
        categoryNameAr: (p.category && p.category.nameAr) || '',
        categoryNameEn: (p.category && p.category.nameEn) || '',
      })),
      total, page, pageSize: limit,
    });
  } catch (e) { next(e); }
});

// PATCH /api/admin/products/:id/approve | /reject — product moderation
router.patch('/products/:id/approve', async (req, res, next) => {
  try {
    const exists = await prisma.product.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: t(req.lang, 'notFound') });
    await prisma.product.update({ where: { id: req.params.id }, data: { status: 'published' } });
    await audit(req, 'product.approve', 'product', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.patch('/products/:id/reject', async (req, res, next) => {
  try {
    const exists = await prisma.product.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: t(req.lang, 'notFound') });
    await prisma.product.update({ where: { id: req.params.id }, data: { status: 'rejected' } });
    await audit(req, 'product.reject', 'product', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/admin/payouts?status= — every seller payout request, newest
// first, with the seller's business name + account email. The status
// filter is validated against the payout_status enum and cast
// explicitly (the 695a120 lesson: never bind text against an enum).
const PAYOUT_STATUSES = ['pending', 'approved', 'paid', 'rejected'];
router.get('/payouts', async (req, res, next) => {
  try {
    const status = req.query.status;
    if (status && !PAYOUT_STATUSES.includes(status)) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const payouts = status
      ? await prisma.$queryRaw`
          SELECT p.id, p.seller_id, p.amount_egp::float AS amount_egp, p.method, p.account_ref,
                 p.status, p.requested_at, p.processed_at,
                 s.business_name_ar, s.business_name_en, u.email
          FROM payouts p JOIN sellers s ON s.id = p.seller_id JOIN users u ON u.id = s.user_id
          WHERE p.status = ${status}::payout_status
          ORDER BY p.requested_at DESC LIMIT 100`
      : await prisma.$queryRaw`
          SELECT p.id, p.seller_id, p.amount_egp::float AS amount_egp, p.method, p.account_ref,
                 p.status, p.requested_at, p.processed_at,
                 s.business_name_ar, s.business_name_en, u.email
          FROM payouts p JOIN sellers s ON s.id = p.seller_id JOIN users u ON u.id = s.user_id
          ORDER BY p.requested_at DESC LIMIT 100`;
    res.json({ payouts });
  } catch (e) { next(e); }
});

// PATCH /api/admin/payouts/:id/approve — approve a seller payout
router.patch('/payouts/:id/approve', requireRole('admin'), async (req, res, next) => {
  try {
    await prisma.$executeRaw`UPDATE payouts SET status = 'approved', processed_at = now() WHERE id = ${req.params.id}::uuid`;
    await audit(req, 'payout.approve', 'payout', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/admin/coupons — every coupon, newest first
router.get('/coupons', async (req, res, next) => {
  try {
    const coupons = await prisma.$queryRaw`
      SELECT id, code, discount_type, discount_value::float AS discount_value,
             min_order_egp::float AS min_order_egp, max_uses, used_count,
             valid_from, valid_until, is_active
      FROM coupons ORDER BY valid_from DESC LIMIT 100`;
    res.json({ coupons });
  } catch (e) { next(e); }
});

// POST /api/admin/coupons — create a coupon { code, discount_type, discount_value, ... }
router.post('/coupons', requireRole('admin'), async (req, res, next) => {
  try {
    const { code, discount_type, discount_value, min_order_egp, valid_until } = req.body;
    if (!code || !['percent', 'fixed'].includes(discount_type) || !discount_value) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const rows = await prisma.$queryRaw`
      INSERT INTO coupons (code, discount_type, discount_value, min_order_egp, valid_until)
      VALUES (${code}, ${discount_type}, ${Number(discount_value)}, ${Number(min_order_egp) || 0}, ${valid_until || null}::timestamptz)
      RETURNING id, code, discount_type, discount_value`;
    res.status(201).json({ coupon: rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
