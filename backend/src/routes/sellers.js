// Seller Center — public store page + seller's own dashboard data.
// A seller can only see their own orders / balance / products (enforced by
// seller.userId === req.user.id). Admin sees all via /api/admin.
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { localize } = require('../utils/security');
const { t } = require('../utils/i18n');

const router = express.Router();

// GET /api/sellers/stores/:slug — public store page (bilingual)
router.get('/stores/:slug', async (req, res, next) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT s.id, s.slug, s.name_ar, s.name_en, s.description_ar, s.description_en,
             s.logo_url, s.banner_url, s.rating_avg
      FROM stores s WHERE s.slug = ${req.params.slug} AND s.is_active = true LIMIT 1`;
    if (!rows.length) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const products = await prisma.product.findMany({
      where: { storeId: rows[0].id, status: 'published' }, take: 20,
      select: { id: true, nameAr: true, nameEn: true, slug: true, price: true, currency: true, ratingAvg: true },
    });
    res.json({ store: localize(rows[0], req.lang), products: products.map((p) => localize(p, req.lang)) });
  } catch (e) { next(e); }
});

// GET /api/sellers/me/dashboard — seller's own stats
router.get('/me/dashboard', authenticate, requireRole('seller'), async (req, res, next) => {
  try {
    const seller = await prisma.seller.findUnique({ where: { userId: req.user.id } });
    if (!seller) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const [orders, balance] = await Promise.all([
      prisma.$queryRaw`SELECT count(*)::int AS c, COALESCE(sum(grand_total),0)::float AS total FROM orders WHERE seller_id = ${seller.id}::uuid`,
      prisma.$queryRaw`SELECT balance_egp, pending_egp FROM seller_balances WHERE seller_id = ${seller.id}::uuid`,
    ]);
    res.json({ seller: { id: seller.id, status: seller.status, commissionRate: Number(seller.commissionRate) }, orders: orders[0], balance: balance[0] || { balance_egp: 0, pending_egp: 0 } });
  } catch (e) { next(e); }
});

// GET /api/sellers/me/orders — seller's sub-orders only
router.get('/me/orders', authenticate, requireRole('seller'), async (req, res, next) => {
  try {
    const seller = await prisma.seller.findUnique({ where: { userId: req.user.id } });
    if (!seller) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const orders = await prisma.order.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: 'desc' }, take: 50, include: { items: true } });
    res.json({ orders });
  } catch (e) { next(e); }
});

// POST /api/sellers/me/payouts — request a payout (admin approves in /api/admin)
router.post('/me/payouts', authenticate, requireRole('seller'), async (req, res, next) => {
  try {
    const { amount_egp, method, account_ref } = req.body;
    if (!amount_egp || Number(amount_egp) <= 0 || !method) return res.status(400).json({ error: t(req.lang, 'validation') });
    const seller = await prisma.seller.findUnique({ where: { userId: req.user.id } });
    const rows = await prisma.$queryRaw`
      INSERT INTO payouts (seller_id, amount_egp, method, account_ref)
      VALUES (${seller.id}::uuid, ${Number(amount_egp)}, ${method}, ${account_ref || null})
      RETURNING id, amount_egp, method, status`;
    res.status(201).json({ payout: rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
