// Payments — INTEGRATION INTERFACE ONLY. NOT activated.
// No card data is ever received, logged, or stored by VORQON.
// A real flow: create a checkout session with the licensed provider
// (Paymob / Stripe / Fawry — see docs/INTEGRATIONS.md), redirect the buyer
// to the provider's hosted page, and verify the webhook signature on return.
// Until PAYMENT_PROVIDER keys are supplied, every call throws.
const config = require('../config');

function assertProviderConfigured() {
  if (!config.paymentProvider || config.paymentProvider === 'none') {
    const err = new Error('Payment provider is not configured — see docs/INTEGRATIONS.md');
    err.code = 'PAYMENT_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }
}

/** Returns a provider checkout URL — stub until a provider is wired in. */
async function createCheckoutSession({ orderId, amountEgp, currency }) {
  assertProviderConfigured();
  // TODO (after keys): call provider SDK, e.g. Paymob intention API.
  throw new Error('Provider adapter not implemented for: ' + config.paymentProvider);
}

/** Verify a provider webhook signature — stub. */
function verifyWebhookSignature() {
  assertProviderConfigured();
  return false;
}

module.exports = { createCheckoutSession, verifyWebhookSignature, assertProviderConfigured };
