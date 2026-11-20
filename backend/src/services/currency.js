// Currency service — EGP/USD/SAR/AED.
// Prices are stored in the product's original currency; conversion uses the
// exchange rate recorded at order time (exchange_rate_used), never re-priced.
const prisma = require('../utils/db');

/** Latest rate from -> to (1.0 if same currency). Falls back to admin rate. */
async function getRate(from, to) {
  if (from === to) return 1;
  const row = await prisma.$queryRaw`
    SELECT rate FROM exchange_rates
    WHERE from_currency = ${from} AND to_currency = ${to}
    ORDER BY effective_at DESC LIMIT 1`;
  return row.length ? Number(row[0].rate) : null;
}

async function convert(amount, from, to) {
  const rate = await getRate(from, to);
  if (rate === null) throw new Error(`No exchange rate ${from} -> ${to}`);
  return { amount: Number((Number(amount) * rate).toFixed(2)), rate, from, to };
}

module.exports = { getRate, convert };
