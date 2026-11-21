// Addresses — the signed-in user's address book (full CRUD).
// Every query is scoped to req.user.id: a user can only ever see or
// touch their own addresses. Exactly one address per user is the
// default: setting a default (create or update) clears the flag on
// the user's other addresses inside the same operation, and the very
// first address a user adds becomes the default automatically.
// Checkout (routes/orders.js) validates that a supplied address_id
// belongs to the buyer before it is written onto an order.
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { cleanText } = require('../utils/security');
const { t } = require('../utils/i18n');

const router = express.Router();
router.use(authenticate);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shared field extraction + validation for create/update. Returns
// { data } or { error: true } — fullName / phone / city / street are
// required; everything else is optional.
function addressData(body) {
  const b = body || {};
  const data = {
    label: cleanText(b.label || '') || 'home',
    fullName: cleanText(b.full_name ?? b.fullName ?? ''),
    phone: cleanText(b.phone || ''),
    country: cleanText(b.country || '') || 'EG',
    city: cleanText(b.city || ''),
    area: cleanText(b.area || '') || null,
    street: cleanText(b.street || ''),
    building: cleanText(b.building || '') || null,
    postalCode: cleanText(b.postal_code ?? b.postalCode ?? '') || null,
  };
  if (!data.fullName || !data.phone || !data.city || !data.street) return { error: true };
  data.isDefault = b.is_default === true || b.isDefault === true;
  return { data };
}

function present(a) {
  return {
    id: a.id, label: a.label, fullName: a.fullName, phone: a.phone,
    country: a.country, city: a.city, area: a.area, street: a.street,
    building: a.building, postalCode: a.postalCode, isDefault: a.isDefault,
    createdAt: a.createdAt,
  };
}

// GET /api/addresses — my addresses (default first, then newest)
router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.address.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ addresses: rows.map(present) });
  } catch (e) { next(e); }
});

// POST /api/addresses — add an address
router.post('/', async (req, res, next) => {
  try {
    const { data, error } = addressData(req.body);
    if (error) return res.status(400).json({ error: t(req.lang, 'validation') });
    const count = await prisma.address.count({ where: { userId: req.user.id } });
    const makeDefault = data.isDefault || count === 0;
    const created = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
      }
      return tx.address.create({ data: { ...data, isDefault: makeDefault, userId: req.user.id } });
    });
    res.status(201).json({ address: present(created) });
  } catch (e) { next(e); }
});

// PUT /api/addresses/:id — edit one of my addresses
router.put('/:id', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const { data, error } = addressData(req.body);
    if (error) return res.status(400).json({ error: t(req.lang, 'validation') });
    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault && !existing.isDefault) {
        await tx.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
      }
      // Unsetting the only default would leave the user with none;
      // keep the flag in that case (the update still applies).
      const keepDefault = existing.isDefault && !data.isDefault;
      return tx.address.update({
        where: { id: existing.id },
        data: { ...data, isDefault: data.isDefault || keepDefault },
      });
    });
    res.json({ address: present(updated) });
  } catch (e) { next(e); }
});

// DELETE /api/addresses/:id — remove one of my addresses
router.delete('/:id', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: t(req.lang, 'notFound') });
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: t(req.lang, 'notFound') });
    await prisma.address.delete({ where: { id: existing.id } });
    // If the deleted address was the default, promote the newest
    // remaining one so the user keeps a default for checkout.
    if (existing.isDefault) {
      const next1 = await prisma.address.findFirst({
        where: { userId: req.user.id }, orderBy: { createdAt: 'desc' },
      });
      if (next1) await prisma.address.update({ where: { id: next1.id }, data: { isDefault: true } });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
