// Rate limiting — brute-force protection for login / register.
// 5 attempts per 15 minutes per IP on /api/auth. Uses in-memory store by
// default; swap to Redis (rate-limit-redis) in production for multi-instance.
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts — try again in 15 minutes' },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

module.exports = { authLimiter, generalLimiter };
