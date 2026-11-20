// Security helpers: XSS sanitising + safe text handling.
// Never store card data — see services/payments.js (provider redirect only).
const xss = require('xss');

/** Strip HTML / script from a user string. Returns '' for non-strings. */
function cleanText(value) {
  if (typeof value !== 'string') return '';
  return xss(value.trim(), { whiteList: {}, stripIgnoreTag: true });
}

/** Pick the localised name: { name_ar, name_en } -> string for req.lang. */
function localize(row, lang = 'ar') {
  if (!row) return row;
  const out = { ...row };
  if ('name_ar' in row || 'name_en' in row) {
    out.name = lang === 'en' ? (row.name_en || row.name_ar) : (row.name_ar || row.name_en);
  }
  if ('description_ar' in row || 'description_en' in row) {
    out.description = lang === 'en' ? (row.description_en || row.description_ar) : (row.description_ar || row.description_en);
  }
  return out;
}

module.exports = { cleanText, localize };
