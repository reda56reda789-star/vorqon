// Shipping — INTEGRATION INTERFACE ONLY. NOT activated.
// Tracking numbers / ETAs shown in the UI must come from a real carrier
// integration (see docs/INTEGRATIONS.md). Until then, shipments are created
// with status 'label_created' and no live tracking.
const config = require('../config');

function assertShippingConfigured() {
  if (!config.shippingProvider || config.shippingProvider === 'none') {
    const err = new Error('Shipping provider is not configured — see docs/INTEGRATIONS.md');
    err.code = 'SHIPPING_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }
}

/** Quote shipping for a zone + weight — DB zones only until carrier is live. */
async function quoteFromZones(prisma, countryCode, weightKg) {
  const zones = await prisma.$queryRaw`
    SELECT * FROM shipping_zones
    WHERE is_active = true AND ${countryCode} = ANY(countries)
    ORDER BY base_fee_egp ASC LIMIT 1`;
  if (!zones.length) return null;
  const z = zones[0];
  return {
    feeEgp: Number(z.base_fee_egp) + Number(z.per_kg_egp) * Number(weightKg || 0),
    etaDaysMin: z.eta_days_min, etaDaysMax: z.eta_days_max,
    zone: { name_ar: z.name_ar, name_en: z.name_en },
  };
}

module.exports = { assertShippingConfigured, quoteFromZones };
