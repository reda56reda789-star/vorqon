// Categories — public tree (bilingual) + admin CRUD.
// The tree is data-driven: add/edit/delete from Admin, no code change needed.
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { localize } = require('../utils/security');
const { t } = require('../utils/i18n');

const router = express.Router();

// GET /api/categories — full tree, ?parent=<id> for children only
router.get('/', async (req, res, next) => {
  try {
    const where = { isActive: true };
    if (req.query.parent) where.parentId = req.query.parent;
    else if (req.query.root === 'true') where.parentId = null;
    const cats = await prisma.$queryRaw`
      SELECT id, parent_id, slug, name_ar, name_en, description_ar, description_en, sort_order
      FROM categories WHERE is_active = true ORDER BY sort_order, name_ar`;
    res.json({ categories: cats.map((c) => localize(c, req.lang)) });
  } catch (e) { next(e); }
});

// GET /api/categories/:slug
router.get('/:slug', async (req, res, next) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT id, parent_id, slug, name_ar, name_en, description_ar, description_en
      FROM categories WHERE slug = ${req.params.slug} LIMIT 1`;
    if (!rows.length) return res.status(404).json({ error: t(req.lang, 'notFound') });
    res.json({ category: localize(rows[0], req.lang) });
  } catch (e) { next(e); }
});

// POST /api/categories — admin only { slug, name_ar, name_en, parent_id? }
router.post('/', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { slug, name_ar, name_en, parent_id, description_ar, description_en } = req.body;
    if (!slug || !name_ar || !name_en) return res.status(400).json({ error: t(req.lang, 'validation') });
    const rows = await prisma.$queryRaw`
      INSERT INTO categories (slug, name_ar, name_en, parent_id, description_ar, description_en)
      VALUES (${slug}, ${name_ar}, ${name_en}, ${parent_id || null}::uuid, ${description_ar || null}, ${description_en || null})
      RETURNING id, slug, name_ar, name_en`;
    res.status(201).json({ category: rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
