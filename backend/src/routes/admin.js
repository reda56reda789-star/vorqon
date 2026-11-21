// Admin Dashboard — stats, seller approval, product review, payouts, coupons.
// All routes: authenticate + requireRole('admin' | 'staff' where noted).
// Every mutating admin action should also write an audit_logs row (see below).
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { t } = require('../utils/i18n');

const router = express.Router();
router.use(authenticate, requireRole('admin', 'staff'));

async function audit(req, action, entityType, entityId) {
  await prisma.$executeRaw`
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, ip_address)
    VALUES (${req.user.id}::uuid, ${action}, ${entityType}, ${entityId}::uuid, ${req.ip || null}::inet)`.catch(() => {});
}

// GET /api/admin/stats — sales, orders, customers, sellers, commissions
router.get('/stats', requireRole('admin'), async (req, res, next) => {
  try {
    const [stats] = await prisma.$queryRaw`
      SELECT
        (SELECT count(*)::int FROM orders WHERE parent_order_id IS NULL) AS total_orders,
        (SELECT count(*)::int FROM users WHERE role = 'customer') AS total_customers,
        (SELECT count(*)::int FROM sellers) AS total_sellers,
        (SELECT count(*)::int FROM stores WHERE is_active = true) AS active_stores,
        (SELECT count(*)::int FROM products WHERE status = 'published') AS published_products,
        (SELECT count(*)::int FROM products WHERE status = 'pending_review') AS pending_products,
        (SELECT COALESCE(sum(grand_total),0)::float FROM orders WHERE parent_order_id IS NULL) AS total_sales_egp,
        (SELECT COALESCE(sum(commission_amt),0)::float FROM order_items) AS total_commissions_egp`;
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
    await prisma.seller.update({ where: { id: req.params.id }, data: { status: 'approved' } });
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

// PATCH /api/admin/products/:id/approve | /reject — product moderation
router.patch('/products/:id/approve', async (req, res, next) => {
  try {
    await prisma.product.update({ where: { id: req.params.id }, data: { status: 'published' } });
    await audit(req, 'product.approve', 'product', req.params.id);
    res.json({ ok: true });
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
