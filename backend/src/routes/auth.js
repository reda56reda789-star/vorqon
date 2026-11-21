// Auth routes — register / login / refresh / me
// Passwords: bcrypt only. Failed logins increment a counter; the account
// locks for 15 min after 5 failures (see users.failed_logins / locked_until).
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const prisma = require('../utils/db');
const config = require('../config');
const { signTokens, authenticate, verifyRefreshToken } = require('../middleware/auth');
const { cleanText } = require('../utils/security');
const { t } = require('../utils/i18n');

const router = express.Router();
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ error: t(req.lang, 'validation'), details: errors.array() }); return false; }
  return true;
}

// POST /api/auth/register { email, password, fullName, role?: customer|seller, storeName?, language?, currency? }
// storeName is the seller's optional shop name: when given it becomes
// the seller's business name (and therefore the auto-created store's
// name via ensureStore); without it the business name falls back to
// the user's personal name, as before.
router.post('/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('fullName').isLength({ min: 2, max: 200 }),
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;
      const { email, password, fullName, role, storeName, language, currency } = req.body;
      // The store owner's email (ADMIN_EMAIL env var, never hardcoded)
      // registers directly as admin; everyone else is customer/seller
      // (admin/staff are otherwise never self-registered). The boot
      // bootstrap also promotes an already-registered ADMIN_EMAIL.
      const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const safeRole = (adminEmail && email.toLowerCase() === adminEmail)
        ? 'admin'
        : (role === 'seller' ? 'seller' : 'customer');
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: 'Email already registered' });
      const user = await prisma.user.create({
        data: {
          email, passwordHash: await bcrypt.hash(password, config.bcryptRounds),
          fullName: cleanText(fullName), role: safeRole,
          language: ['ar', 'en'].includes(language) ? language : 'ar',
          currency: ['EGP', 'USD', 'SAR', 'AED'].includes(currency) ? currency : 'EGP',
        },
      });
      if (safeRole === 'seller') {
        const shopName = cleanText(storeName || '');
        await prisma.seller.create({
          data: {
            userId: user.id,
            businessNameAr: shopName || cleanText(fullName),
            ...(shopName ? { businessNameEn: shopName } : {}),
          },
        });
      }
      const tokens = signTokens(user);
      res.status(201).json({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role }, ...tokens });
    } catch (e) { next(e); }
  });

// POST /api/auth/login { email, password }
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;
      const { email, password } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(401).json({ error: t(req.lang, 'invalidCredentials') });
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        return res.status(423).json({ error: t(req.lang, 'locked') });
      }
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        const failed = (user.failedLogins || 0) + 1;
        await prisma.user.update({ where: { id: user.id }, data: {
          failedLogins: failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null,
        } });
        return res.status(401).json({ error: t(req.lang, 'invalidCredentials') });
      }
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
      const tokens = signTokens(user);
      res.json({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role }, ...tokens });
    } catch (e) { next(e); }
  });

// POST /api/auth/refresh { refresh } — exchange a valid refresh
// token for a fresh token pair. Access tokens live 15 minutes; the
// frontend stores the refresh token and calls this on a 401 instead
// of dropping the session (which silently broke signed-in actions
// such as cart adds mid-session).
router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh } = req.body || {};
    if (!refresh || typeof refresh !== 'string') {
      return res.status(400).json({ error: t(req.lang, 'validation') });
    }
    let payload;
    try {
      payload = verifyRefreshToken(refresh);
    } catch {
      return res.status(401).json({ error: t(req.lang, 'unauthorized') });
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: t(req.lang, 'unauthorized') });
    const tokens = signTokens(user);
    res.json({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role }, ...tokens });
  } catch (e) { next(e); }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, fullName: true, role: true, language: true, currency: true } });
    if (!user) return res.status(404).json({ error: t(req.lang, 'notFound') });
    res.json({ user });
  } catch (e) { next(e); }
});

module.exports = router;
