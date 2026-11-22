// Sales remain deliberately closed until supplier, shipping and payout terms
// have been verified and the owner approves a separate launch release.
// This is a code-level gate, not a client flag and not an environment default.
const ORDERING_ENABLED = false;
function rejectNewOrders(req, res, next) {
  if (req.method === 'POST' && !ORDERING_ENABLED) {
    res.set('Cache-Control', 'no-store');
    return res.status(503).json({
      code: 'ORDERING_PAUSED',
      error: req.lang === 'en' ? 'Ordering is temporarily paused. Browsing remains available.' : 'استقبال الطلبات متوقف مؤقتًا. التصفّح متاح.',
    });
  }
  return next();
}
module.exports = { ORDERING_ENABLED, rejectNewOrders };
