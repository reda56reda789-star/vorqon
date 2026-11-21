// Defect 2 harness — GET /api/admin/products status filter.
// The frontend filter sends the raw enum values ('published', ...);
// this proves the backend accepts exactly the product_status enum
// values, passes them through to the typed Prisma query unchanged,
// and rejects anything else with a 400 (no silent empty list).
const { test } = require('node:test');
const assert = require('node:assert');
const { installStubs, fakeExpress, fakeAuth, fakeRbac, invoke } = require('./stub');

const STATUSES = ['draft', 'pending_review', 'published', 'rejected', 'archived'];

function makeFakePrisma() {
  const calls = [];
  const row = (status) => ({
    id: 'prod-1', sku: 'SKU-1', slug: 'prod-1', nameAr: 'منتج', nameEn: 'Product',
    price: 100, currency: 'EGP', stockQuantity: 3, status, createdAt: new Date(0),
    seller: { businessNameAr: 'متجر', businessNameEn: 'Store' },
    category: { slug: 'cat', nameAr: 'قسم', nameEn: 'Cat' },
  });
  return {
    calls,
    product: {
      count: async ({ where }) => { calls.push(['count', where]); return where.status ? 7 : 42; },
      findMany: async (args) => { calls.push(['findMany', args]); return [row(args.where.status || 'published')]; },
    },
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
  };
}

function loadAdminRouter(fakePrisma) {
  const restore = installStubs(new Map([
    [(req) => req === 'express', fakeExpress()],
    [(req) => req.endsWith('/utils/db'), fakePrisma],
    [(req) => req.endsWith('/middleware/auth'), fakeAuth],
    [(req) => req.endsWith('/middleware/rbac'), fakeRbac],
  ]));
  delete require.cache[require.resolve('../src/routes/admin.js')];
  const router = require('../src/routes/admin.js');
  restore();
  return router;
}

const asAdmin = { __user: { id: 'admin-1', role: 'admin', email: 'a@example.com' }, lang: 'en' };

for (const status of STATUSES) {
  test(`status=${status} is accepted and reaches Prisma unchanged`, async () => {
    const prisma = makeFakePrisma();
    const router = loadAdminRouter(prisma);
    const res = await invoke(router, 'GET', '/products', { ...asAdmin, query: { status } });
    assert.strictEqual(res.statusCode, 200);
    const findMany = prisma.calls.find((c) => c[0] === 'findMany');
    assert.ok(findMany, 'findMany must be called');
    assert.strictEqual(findMany[1].where.status, status);
    assert.strictEqual(res.body.total, 7);
    assert.strictEqual(res.body.products[0].status, status);
  });
}

test('no status → unfiltered query (no status key in where)', async () => {
  const prisma = makeFakePrisma();
  const router = loadAdminRouter(prisma);
  const res = await invoke(router, 'GET', '/products', { ...asAdmin, query: {} });
  assert.strictEqual(res.statusCode, 200);
  const findMany = prisma.calls.find((c) => c[0] === 'findMany');
  assert.ok(!('status' in findMany[1].where));
  assert.strictEqual(res.body.total, 42);
});

test('unknown status → 400 and Prisma is never queried', async () => {
  const prisma = makeFakePrisma();
  const router = loadAdminRouter(prisma);
  const res = await invoke(router, 'GET', '/products', { ...asAdmin, query: { status: 'live' } });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(prisma.calls.length, 0);
});
