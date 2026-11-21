// Prisma client singleton — all queries are parameterised by Prisma,
// which is the primary defence against SQL injection (never string-concat SQL).
// The connection string is normalised first (utils/connection.js): on
// Neon's pooled (-pooler) endpoint Prisma needs pgbouncer=true plus
// sane pool limits, or pooled connections intermittently close.
const { PrismaClient } = require('@prisma/client');
const { normalizeDatabaseUrl } = require('./connection');

const datasourceUrl = process.env.DATABASE_URL
  ? normalizeDatabaseUrl(process.env.DATABASE_URL)
  : undefined;

const prisma = new PrismaClient({
  ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});
module.exports = prisma;
