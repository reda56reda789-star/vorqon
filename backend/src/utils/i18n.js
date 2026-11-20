// Minimal server-side messages (ar default, en fallback).
// Frontend strings live in frontend/src/i18n/{ar,en}.json.
const MESSAGES = {
  ar: {
    unauthorized: 'غير مصرح — سجّل الدخول أولاً',
    forbidden: 'ليس لديك صلاحية لهذا الإجراء',
    notFound: 'غير موجود',
    invalidCredentials: 'بيانات الدخول غير صحيحة',
    locked: 'الحساب مقفل مؤقتاً بسبب محاولات كثيرة — حاول لاحقاً',
    validation: 'بيانات غير صالحة',
  },
  en: {
    unauthorized: 'Unauthorized — please sign in',
    forbidden: 'You do not have permission for this action',
    notFound: 'Not found',
    invalidCredentials: 'Invalid credentials',
    locked: 'Account temporarily locked after too many attempts — try again later',
    validation: 'Invalid data',
  },
};
function t(lang, key) {
  return (MESSAGES[lang] && MESSAGES[lang][key]) || MESSAGES.ar[key] || key;
}
module.exports = { t };
