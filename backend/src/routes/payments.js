// Payments — checkout-session + webhook endpoints.
// STATUS: NOT ACTIVATED. No provider is wired in; see docs/INTEGRATIONS.md.
// These routes return 503 until PAYMENT_PROVIDER + keys are configured.
// Card data must NEVER be sent to these endpoints — buyers pay on the
// provider's hosted page only.
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { createCheckoutSession, verifyWebhookSignature } = require('../services/payments');

const router = express.Router();

// POST /api/payments/checkout-session { order_id }
router.post('/checkout-session', authenticate, async (req, res, next) => {
  try {
    const session = await createCheckoutSession({ orderId: req.body.order_id, amountEgp: 0, currency: 'EGP' });
    res.json(session);
  } catch (e) {
    if (e.code === 'PAYMENT_NOT_CONFIGURED') return res.status(503).json({ error: e.message, status: 'not_configured' });
    next(e);
  }
});

// POST /api/payments/webhook — provider callback (signature verified in service)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!verifyWebhookSignature(req)) return res.status(400).json({ error: 'Invalid signature' });
    return res.json({ ok: true });
  } catch {
    return res.status(503).json({ error: 'Payment provider is not configured', status: 'not_configured' });
  }
});

// GET /api/payments/methods — list enabled payment methods (COD only until a gateway is live)
router.get('/methods', async (req, res, next) => {
  try {
    const prisma = require('../utils/db');
    const methods = await prisma.$queryRaw`SELECT code, name_ar, name_en, provider, is_active, is_cod FROM payment_methods ORDER BY code`;
    res.json({ methods });
  } catch (e) { next(e); }
});

module.exports = router;
