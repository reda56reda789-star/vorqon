// VORQON config — reads env only; no secrets are hard-coded here.
require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v && process.env.NODE_ENV === 'production') throw new Error(`Missing required env: ${name}`);
  return v;
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwtSecret: required('JWT_SECRET') || 'dev-only-secret-change-me',
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
