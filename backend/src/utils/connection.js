// DATABASE_URL normalisation for pooled Neon endpoints.
//
// The API connects to Neon through the pooled ("-pooler") host, which
// is PgBouncer in transaction mode. Prisma's own connection pool on
// top of PgBouncer needs three query parameters to behave there:
//   pgbouncer=true    — disables Prisma's named prepared statements,
//                       which transaction-mode pooling cannot honour;
//                       without it, pooled connections intermittently
//                       die ("Connection: Closed" in the server log).
//   connection_limit  — caps Prisma's pool so it does not multiply
//                       connections against the pooler's own limits.
//   pool_timeout      — how long Prisma waits for a pooled connection
//                       before erroring, instead of failing fast.
//
// Applied ONLY when the host is a pooled endpoint and the URL does not
// already carry a pgbouncer parameter (an explicitly configured URL is
// left exactly as the operator set it). The URL itself is never logged.
function normalizeDatabaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return raw; // unparseable — let Prisma surface its own error
  }
  if (!url.hostname.includes('-pooler')) return raw;
  if (url.searchParams.has('pgbouncer')) return raw;
  url.searchParams.set('pgbouncer', 'true');
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5');
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '30');
  return url.toString();
}

module.exports = { normalizeDatabaseUrl };
