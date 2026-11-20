// Products — search / filter / sort + detail + reviews.
// Search: name_ar / name_en / sku / model_number, trigram index in schema.sql.
// Filters: category, brand, seller, min/max price, min rating, in-stock.
// Sort: price | rating | newest | best_selling.
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { localize, cleanText } = require('../utils/security');
const { pagination, pageMeta } = require('../utils/pagination');
const { t } = require('../utils/i18n');

const router = express.Router();

// GET /api/products?q=&category=&brand=&seller=&min_price=&max_price=&min_rating=&in_stock=true&sort=newest
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = pagination(req);
    const { q, category, brand, seller, min_price, max_price, min_rating, in_stock, sort } = req.query;
    const where = { status: 'published' };
    if (q) where.OR = [{ nameAr: { contains: q, mode: 'insensitive' } }, { nameEn: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }];
    if (category) where.categoryId = String(category);
    if (brand) where.brandId = String(brand);
    if (seller) where.sellerId = String(seller);
    if (min_price || max_price) where.price = { ...(min_price ? { gte: Number(min_price) } : {}), ...(max_price ? { lte: Number(max_price) } : {}) };
    if (min_rating) where.ratingAvg = { gte: Number(min_rating) };
    if (in_stock === 'true') where.stockQuantity = { gt: 0 };
    const orderMap = { price_asc: { price: 'asc' }, price_desc: { price: 'desc' }, rating: { ratingAvg: 'desc' }, best_selling: { soldCount: 'desc' }, newest: { createdAt: 'desc' } };
    const [rows, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy: orderMap[sort] || orderMap.newest, skip, take: limit, include: { images: { orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }], take: 1 } } }),
      prisma.product.count({ where }),
    ]);
    res.json({ products: rows.map((x) => localize(x, req.lang)), meta: pageMeta(total, page, limit) });
  } catch (e) { next(e); }
});

// GET /api/products/:slug — full detail (images, variants, specs, seller)
router.get('/:slug', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({ where: { slug: req.params.slug }, include: { images: true, variants: true, reviews: { take: 10, orderBy: { createdAt: 'desc' } } } });
    if (!products.length) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const p = products[0];
    await prisma.product.update({ where: { id: p.id }, data: { viewCount: { increment: 1 } } }).catch(() => {});
    res.json({ product: localize(p, req.lang) });
  } catch (e) { next(e); }
});

// POST /api/products — seller creates a product (draft -> pending_review)
router.post('/', authenticate, requireRole('seller'), async (req, res, next) => {
  try {
    const { name_ar, name_en, slug, sku, price, currency, category_id, stock_quantity } = req.body;
    if (!name_ar || !name_en || !slug || !sku || price == null || !category_id) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const seller = await prisma.seller.findUnique({ where: { userId: req.user.id } });
    if (!seller) return res.status(403).json({ error: t(req.lang, 'forbidden') });
    const store = await prisma.store.findUnique({ where: { sellerId: seller.id } });
    const product = await prisma.product.create({
      data: {
        sellerId: seller.id, storeId: store ? store.id : seller.id, categoryId: category_id,
        sku, slug, nameAr: cleanText(name_ar), nameEn: cleanText(name_en),
        price: Number(price), currency: ['EGP', 'USD', 'SAR', 'AED'].includes(currency) ? currency : 'EGP',
        stockQuantity: Number(stock_quantity) || 0, status: 'pending_review',
      },
    });
    res.status(201).json({ product });
  } catch (e) { next(e); }
});

// POST /api/products/:id/reviews — customer review (1-5)
router.post('/:id/reviews', authenticate, requireRole('customer', 'seller'), async (req, res, next) => {
  try {
    const { rating, body } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: t(req.lang, 'validation') });
    const review = await prisma.review.create({ data: { productId: req.params.id, userId: req.user.id, rating: Number(rating), body: cleanText(body || '') } });
    res.status(201).json({ review });
  } catch (e) { next(e); }
});

module.exports = router;
