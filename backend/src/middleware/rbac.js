// Role-based access control (RBAC).
// Roles: customer | seller | admin | staff
// Usage: router.get('/admin/...', authenticate, requireRole('admin'), handler)
const { t } = require('../utils/i18n');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: t(req.lang, 'unauthorized') });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: t(req.lang, 'forbidden') });
    }
    return next();
  };
}

// A seller may only touch their own seller record — enforced in routes by
// comparing req.user.id with the seller's user_id; this helper is the guard.
function requireSelfOrAdmin(getOwnerId) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (String(getOwnerId(req)) === String(req.user.id)) return next();
    return res.status(403).json({ error: t(req.lang, 'forbidden') });
  };
}

module.exports = { requireRole, requireSelfOrAdmin };
