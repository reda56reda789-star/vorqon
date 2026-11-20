// VORQON config — reads env only; no secrets are hard-coded here.
require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v && process.env.NODE_ENV === 'production') throw new Error(`Missing required env: ${name}`);
  return v;
}

// JWT signing secret resolution:
//   1. JWT_SECRET from the environment — always wins, behaviour unchanged.
//   2. Otherwise, when DATABASE_URL is available, derive the secret
//      deterministically from it (sha256 hex of the connection string).
//      This lets single-secret deploys (e.g. the free Hugging Face Space,
//      where DATABASE_URL is the only secret configured) boot without a
//      second hand-entered secret. Rotating the DB password rotates the
//      derived secret too, which simply invalidates existing tokens.
//   3. Otherwise production refuses to boot; development keeps its
//      long-standing local fallback.
function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const derived = require('crypto').createHash('sha256').update(databaseUrl).digest('hex');
    console.warn('[config] JWT_SECRET is not set — derived deterministically from DATABASE_URL. Set JWT_SECRET explicitly for production deployments beyond the free tier.');
    return derived;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Missing required env: JWT_SECRET');
  return 'dev-only-secret-change-me';
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // i18n / currencies — Arabic is the default.
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'ar',
  supportedLanguages: (process.env.SUPPORTED_LANGUAGES || 'ar,en').split(','),
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'EGP',
  supportedCurrencies: (process.env.SUPPORTED_CURRENCIES || 'EGP,USD,SAR,AED').split(','),
  // Payments / shipping are integration-ready only; 'none' means NOT activated.
  paymentProvider: process.env.PAYMENT_PROVIDER || 'none',
  shippingProvider: process.env.SHIPPING_PROVIDER || 'none',
};
