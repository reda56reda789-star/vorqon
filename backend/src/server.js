// VORQON API — Express entry point
// Security: helmet, CORS restricted to FRONTEND_URL, JSON limit, CSRF-ready,
// rate limiting on auth, XSS sanitisation in utils/security.js.
// i18n: Accept-Language header (ar default) -> req.lang; responses carry both
// name_ar / name_en where applicable so the frontend can render either.
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { authLimiter } = require('./middleware/rateLimit');

const app = express();
app.use(helmet({ contentSecurityPolicy: false })); // CSP tuned in production reverse proxy
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '1mb' })); // rejects oversized / malformed bodies
app.use(express.urlencoded({ extended: false }));
app.use(morgan('combined'));

// Language negotiation: ?lang=ar|en or Accept-Language; default 'ar'.
app.use((req, res, next) => {
  const q = (req.query.lang || '').toString().toLowerCase();
  const h = (req.headers['accept-language'] || '').slice(0, 2).toLowerCase();
  req.lang = config.supportedLanguages.includes(q) ? q
    : config.supportedLanguages.includes(h) ? h : config.defaultLanguage;
  res.setHeader('Content-Language', req.lang);
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, service: 'vorqon-api', lang: req.lang }));

// Routes — auth is rate-limited separately inside its router mount.
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/sellers', require('./routes/sellers'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/addresses', require('./routes/addresses'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/shipping', require('./routes/shipping'));

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`VORQON API listening on :${config.port} (lang default: ${config.defaultLanguage})`);
});
module.exports = app;
