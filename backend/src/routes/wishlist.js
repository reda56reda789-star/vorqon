// Wishlist — the signed-in user's saved products, stored in the
// `favourites` table (schema.sql; guaranteed on every DB by the
// wishlist-v1 bootstrap fixup). The composite PK (user_id, product_id)
// makes adding the same product twice a no-op instead of a duplicate.
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { localize } = require('../utils/security');
const { t } = require('../utils/i18n');

const router = express.Router();
router.use(authenticate);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/wishlist — my wishlist, newest first, with product cards data
router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.favourite.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: { images: { orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }], take: 1 } },
        },
      },
    });
    res.json({
      items: rows.map((r) => ({
        productId: r.productId,
        addedAt: r.createdAt,
        product: localize(r.product, req.lang),
      })),
    });
  } catch (e) { next(e); }
});

// POST /api/wishlist { product_id } — add a product to my wishlist
router.post('/', async (req, res, next) => {
  try {
    const productId = (req.body && (req.body.product_id || req.body.productId)) || '';
    if (!UUID_RE.test(productId)) return res.status(400).json({ error: t(req.lang, 'validation') });
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const fav = await prisma.favourite.upsert({
      where: { userId_productId: { userId: req.user.id, productId } },
      create: { userId: req.user.id, productId },
      update: {},
    });
    res.status(201).json({ item: { productId: fav.productId, addedAt: fav.createdAt } });
  } catch (e) { next(e); }
});

// DELETE /api/wishlist/:productId — remove a product from my wishlist
router.delete('/:productId', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.productId)) return res.status(400).json({ error: t(req.lang, 'validation') });
    await prisma.favourite.deleteMany({ where: { userId: req.user.id, productId: req.params.productId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
