// Shipping — zone quote + tracking (DB zones only until a carrier is live).
// Live tracking requires a carrier integration — see docs/INTEGRATIONS.md.
const express = require('express');
const prisma = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { quoteFromZones } = require('../services/shipping');

const router = express.Router();

// GET /api/shipping/quote?country=EG&weight_kg=1.5
router.get('/quote', async (req, res, next) => {
  try {
    const quote = await quoteFromZones(prisma, (req.query.country || 'EG').toString(), Number(req.query.weight_kg) || 0);
    if (!quote) return res.status(404).json({ error: 'No shipping zone for this country yet' });
    res.json({ quote, liveTracking: false, note: 'Zone estimate only — carrier integration not activated' });
  } catch (e) { next(e); }
});

// GET /api/shipping/track/:tracking_number — returns stored shipment status only
router.get('/track/:tracking_number', authenticate, async (req, res, next) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT id, order_id, provider_code, tracking_number, status, shipped_at, delivered_at
      FROM shipments WHERE tracking_number = ${req.params.tracking_number} LIMIT 1`;
    if (!rows.length) return res.status(404).json({ error: 'Tracking number not found' });
    res.json({ shipment: rows[0], liveTracking: false });
  } catch (e) { next(e); }
});

module.exports = router;
