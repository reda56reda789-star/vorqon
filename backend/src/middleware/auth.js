// JWT authentication middleware.
const jwt = require('jsonwebtoken');
const config = require('../config');
const { t } = require('../utils/i18n');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: t(req.lang, 'unauthorized') });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ error: t(req.lang, 'unauthorized') });
  }
}

function signTokens(user) {
  const access = jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    config.jwtSecret, { expiresIn: config.jwtExpiresIn },
  );
  const refresh = jwt.sign({ sub: user.id, type: 'refresh' }, config.jwtSecret,
    { expiresIn: config.jwtRefreshExpiresIn });
  return { access, refresh };
}

module.exports = { authenticate, signTokens };
