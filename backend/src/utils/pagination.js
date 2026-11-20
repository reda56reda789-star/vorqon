// Shared pagination + sorting helpers for list endpoints.
function pagination(req) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}
function pageMeta(total, page, limit) {
  return { total, page, limit, pages: Math.ceil(total / limit) };
}
module.exports = { pagination, pageMeta };
