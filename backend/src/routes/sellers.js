// Seller Center — public store page + seller's own dashboard data.
// A seller can only see their own orders / balance / products (enforced by
// seller.userId === req.user.id). Admin sees all via /api/admin.
// The seller's own product list (all statuses), product editing, CSV
// import and payout history live here under /me and /products.
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { localize, cleanText } = require('../utils/security');
const { ensureStore } = require('../services/stores');
const { t } = require('../utils/i18n');

const router = express.Router();

const PRODUCT_STATUSES = ['draft', 'pending_review', 'published', 'rejected', 'archived'];
const CURRENCIES = ['EGP', 'USD', 'SAR', 'AED'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownSeller(req, res) {
  const seller = await prisma.seller.findUnique({ where: { userId: req.user.id } });
  if (!seller) { res.status(404).json({ error: t(req.lang, 'notFound') }); return null; }
  return seller;
}

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
    const seller = await ownSeller(req, res);
    if (!seller) return;
    const rows = await prisma.$queryRaw`
      INSERT INTO payouts (seller_id, amount_egp, method, account_ref)
      VALUES (${seller.id}::uuid, ${Number(amount_egp)}, ${method}, ${account_ref || null})
      RETURNING id, amount_egp, method, status`;
    res.status(201).json({ payout: rows[0] });
  } catch (e) { next(e); }
});

// GET /api/sellers/me/payouts — my payout requests, newest first
router.get('/me/payouts', authenticate, requireRole('seller'), async (req, res, next) => {
  try {
    const seller = await ownSeller(req, res);
    if (!seller) return;
    const payouts = await prisma.$queryRaw`
      SELECT id, amount_egp::float AS amount_egp, method, account_ref, status, requested_at, processed_at
      FROM payouts WHERE seller_id = ${seller.id}::uuid
      ORDER BY requested_at DESC LIMIT 100`;
    res.json({ payouts });
  } catch (e) { next(e); }
});

// GET /api/sellers/me/products?status= — ALL my products, any status
// (the public /api/products list only ever shows published ones, so a
// seller could not see their own pending-review products before this).
// The status filter is validated against the product_status enum and
// applied through the typed Prisma API.
router.get('/me/products', authenticate, requireRole('seller'), async (req, res, next) => {
  try {
    const status = req.query.status;
    if (status && !PRODUCT_STATUSES.includes(status)) {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    const seller = await ownSeller(req, res);
    if (!seller) return;
    const products = await prisma.product.findMany({
      where: { sellerId: seller.id, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ products });
  } catch (e) { next(e); }
});

// PATCH /api/sellers/products/:id — edit one of MY products.
// Only the owner can edit (a product owned by another seller is a 404,
// so ownership is never leaked). Identifiers (sku / slug) are not
// editable; status is not editable here either — moderation owns it.
router.patch('/products/:id', authenticate, requireRole('seller'), async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const seller = await ownSeller(req, res);
    if (!seller) return;
    const product = await prisma.product.findFirst({ where: { id: req.params.id, sellerId: seller.id } });
    if (!product) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const b = req.body || {};
    const data = {};
    if (b.name_ar !== undefined) { const v = cleanText(b.name_ar); if (!v) return res.status(400).json({ error: t(req.lang, 'validation') }); data.nameAr = v; }
    if (b.name_en !== undefined) { const v = cleanText(b.name_en); if (!v) return res.status(400).json({ error: t(req.lang, 'validation') }); data.nameEn = v; }
    if (b.description_ar !== undefined) data.descriptionAr = cleanText(b.description_ar) || null;
    if (b.description_en !== undefined) data.descriptionEn = cleanText(b.description_en) || null;
    if (b.price !== undefined) {
      const v = Number(b.price);
      if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: t(req.lang, 'validation') });
      data.price = v;
    }
    if (b.compare_at_price !== undefined) {
      if (b.compare_at_price === null || b.compare_at_price === '') data.compareAtPrice = null;
      else {
        const v = Number(b.compare_at_price);
        const effectivePrice = data.price !== undefined ? data.price : Number(product.price);
        if (!Number.isFinite(v) || v < effectivePrice) return res.status(400).json({ error: t(req.lang, 'validation') });
        data.compareAtPrice = v;
      }
    }
    if (b.currency !== undefined) {
      if (!CURRENCIES.includes(b.currency)) return res.status(400).json({ error: t(req.lang, 'validation') });
      data.currency = b.currency;
    }
    if (b.stock_quantity !== undefined) {
      const v = Math.floor(Number(b.stock_quantity));
      if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: t(req.lang, 'validation') });
      data.stockQuantity = v;
    }
    if (b.category_id !== undefined) {
      if (!UUID_RE.test(String(b.category_id))) return res.status(400).json({ error: t(req.lang, 'validation') });
      const cat = await prisma.category.findUnique({ where: { id: b.category_id }, select: { id: true } });
      if (!cat) return res.status(400).json({ error: t(req.lang, 'validation') });
      data.categoryId = b.category_id;
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: t(req.lang, 'validation') });
    const updated = await prisma.product.update({ where: { id: product.id }, data });
    res.json({ product: updated });
  } catch (e) { next(e); }
});

// --- CSV import -------------------------------------------------------------
// Minimal RFC-4180-style parser: quoted fields, embedded commas and
// doubled quotes are supported; rows are split on LF/CRLF outside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function slugify(text, fallback) {
  const base = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200);
  return base || fallback;
}

const IMPORT_MAX_ROWS = 500;
// Image hosts the CSV import may reference (supplier CDN used by the store's Taager catalog).
const IMAGE_HOSTS = ['media.taager.com'];

// POST /api/sellers/me/products/import — bulk-create products from CSV.
// Body: JSON { csv: "<text>" } or a raw text/csv body. Header row is
// required. Columns: name_ar, name_en, price, stock (or stock_quantity),
// category (slug or id; category_slug / category_id also accepted),
// sku (optional — generated), slug (optional — generated from name_en),
// currency (optional, default EGP), description_ar / description_en /
// compare_at_price / image_urls (optional, "|"-separated https URLs on media.taager.com). Imported products land in pending_review,
// exactly like a product added through the form. Response reports
// { imported, skipped, errors: [{ row, error }] } — row is the 1-based
// data-row number (header excluded).
router.post('/me/products/import',
  authenticate, requireRole('seller'),
  express.text({ type: ['text/csv', 'text/plain'], limit: '1mb' }),
  async (req, res, next) => {
    try {
      const csvText = typeof req.body === 'string' ? req.body : (req.body && req.body.csv);
      if (!csvText || typeof csvText !== 'string') {
        return res.status(400).json({ error: t(req.lang, 'validation') });
      }
      const seller = await ownSeller(req, res);
      if (!seller) return;
      const rows = parseCsv(csvText);
      if (rows.length < 2) return res.status(400).json({ error: t(req.lang, 'validation') });
      const header = rows[0].map((h) => String(h).trim().toLowerCase());
      const col = (names) => names.map((n) => header.indexOf(n)).find((i) => i >= 0);
      const idx = {
        name_ar: col(['name_ar']), name_en: col(['name_en']), price: col(['price']),
        stock: col(['stock', 'stock_quantity']), category: col(['category', 'category_slug', 'category_id']),
        sku: col(['sku']), slug: col(['slug']), currency: col(['currency']),
        description_ar: col(['description_ar']), description_en: col(['description_en']),
        compare_at_price: col(['compare_at_price']),
        image_urls: col(['image_urls', 'image_url']),
      };
      if (idx.name_ar === undefined || idx.name_en === undefined || idx.price === undefined || idx.category === undefined) {
        return res.status(400).json({ error: 'CSV header must include name_ar, name_en, price and category columns' });
      }
      const dataRows = rows.slice(1);
      if (dataRows.length > IMPORT_MAX_ROWS) {
        return res.status(400).json({ error: `Too many rows (max ${IMPORT_MAX_ROWS})` });
      }
      const store = await ensureStore(prisma, seller);
      if (!store) return res.status(403).json({ error: t(req.lang, 'forbidden') });
      const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
      const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));
      const catIds = new Set(categories.map((c) => c.id));
      const sellerSuffix = seller.id.replace(/-/g, '').slice(0, 8);
      const cell = (r, i) => (i === undefined ? '' : String(r[i] ?? '').trim());
      let imported = 0;
      const errors = [];
      for (let n = 0; n < dataRows.length; n++) {
        const r = dataRows[n];
        const rowNo = n + 1;
        try {
          const nameAr = cleanText(cell(r, idx.name_ar));
          const nameEn = cleanText(cell(r, idx.name_en));
          const price = Number(cell(r, idx.price));
          const stockRaw = cell(r, idx.stock);
          const stock = stockRaw === '' ? 0 : Math.floor(Number(stockRaw));
          const catRef = cell(r, idx.category);
          const categoryId = catBySlug.get(catRef) || (catIds.has(catRef) ? catRef : null);
          if (!nameAr || !nameEn) throw new Error('name_ar and name_en are required');
          if (!Number.isFinite(price) || price < 0) throw new Error('invalid price');
          if (!Number.isFinite(stock) || stock < 0) throw new Error('invalid stock');
          if (!categoryId) throw new Error(`unknown category: ${catRef}`);
          const currencyRaw = cell(r, idx.currency);
          const currency = currencyRaw ? currencyRaw.toUpperCase() : 'EGP';
          if (!CURRENCIES.includes(currency)) throw new Error(`invalid currency: ${currencyRaw}`);
          const sku = cell(r, idx.sku) || `IMP-${sellerSuffix}-${rowNo}`;
          const slug = cell(r, idx.slug) || `${slugify(nameEn, 'product')}-${sku.toLowerCase()}`;
          const compareRaw = cell(r, idx.compare_at_price);
          const compareAt = compareRaw === '' ? null : Number(compareRaw);
          if (compareAt !== null && (!Number.isFinite(compareAt) || compareAt < price)) {
            throw new Error('compare_at_price must be >= price');
          }
          // Optional images: "|"-separated https URLs on an allow-listed host.
          const imageUrls = cell(r, idx.image_urls).split('|').map((u) => u.trim()).filter(Boolean);
          if (imageUrls.length > 8) throw new Error('too many image urls (max 8)');
          for (const u of imageUrls) {
            let parsed;
            try { parsed = new URL(u); } catch (_) { throw new Error(`invalid image url: ${u.slice(0, 60)}`); }
            if (parsed.protocol !== 'https:' || !IMAGE_HOSTS.includes(parsed.hostname)) throw new Error(`image host not allowed: ${parsed.hostname}`);
          }
          await prisma.product.create({
            data: {
              images: imageUrls.length ? { create: imageUrls.map((url, i) => ({ url, sortOrder: i, isMain: i === 0 })) } : undefined,
              sellerId: seller.id, storeId: store.id, categoryId,
              sku, slug: slug.slice(0, 320), nameAr, nameEn,
              descriptionAr: cleanText(cell(r, idx.description_ar)) || null,
              descriptionEn: cleanText(cell(r, idx.description_en)) || null,
              price, compareAtPrice: compareAt, currency,
              stockQuantity: stock, status: 'pending_review',
            },
          });
          imported++;
        } catch (e) {
          errors.push({ row: rowNo, error: e && e.code === 'P2002' ? 'duplicate sku or slug' : (e.message || 'invalid row') });
        }
      }
      res.status(201).json({ imported, skipped: errors.length, errors });
    } catch (e) { next(e); }
  });

module.exports = router;
