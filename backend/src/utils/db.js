// Prisma client singleton — all queries are parameterised by Prisma,
// which is the primary defence against SQL injection (never string-concat SQL).
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'] });
module.exports = prisma;
