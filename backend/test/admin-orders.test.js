// Admin orders harness — GET /api/admin/orders (routes/admin.js)
// against a fake Prisma. Covers the customer-phone fallback chain:
// guest orders surface the guest phone recorded on the order;
// registered orders fall back to the delivery address's phone, then
// the user record's phone (registered customers usually have no phone
// on their account, which is why their phone cell rendered empty).
const { test } = require('node:test');
const assert = require('node:assert');
const { installStubs, fakeExpress, fakeAuth, fakeRbac, invoke } = require('./stub');

function orderRow(overrides) {
  return {
    id: 'order-1', orderNumber: 'VQ-2026-000001', createdAt: new Date(0),
    status: 'pending', paymentStatus: 'cash_on_delivery',
    paymentMethodCode: 'cash_on_delivery', currency: 'EGP', grandTotal: 100,
    userId: 'user-1', guestName: null, guestPhone: null,
    user: { fullName: 'عميل مسجل', phone: null },
    address: null,
    children: [],
    ...overrides,
  };
}

function makeFakePrisma(orders) {
  const calls = [];
  return {
    calls,
    order: {
      count: async () => orders.length,
      findMany: async (args) => { calls.push(args); return orders; },
    },
    seller: { findMany: async () => [] },
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

test('registered order: phone falls back to the delivery address phone', async () => {
  const prisma = makeFakePrisma([orderRow({ address: { phone: '01012345678' } })]);
  const router = loadAdminRouter(prisma);
  const res = await invoke(router, 'GET', '/orders', { ...asAdmin, query: {} });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.orders[0].customerPhone, '01012345678');
  assert.strictEqual(res.body.orders[0].paymentMethodCode, 'cash_on_delivery');
  assert.ok(prisma.calls[0].include.address, 'the query must include the order address');
});

test('registered order without an address: phone falls back to the user record', async () => {
  const prisma = makeFakePrisma([orderRow({ user: { fullName: 'عميل', phone: '01198765432' } })]);
  const router = loadAdminRouter(prisma);
  const res = await invoke(router, 'GET', '/orders', { ...asAdmin, query: {} });
  assert.strictEqual(res.body.orders[0].customerPhone, '01198765432');
});

test('guest order: phone comes from the guest fields on the order', async () => {
  const prisma = makeFakePrisma([orderRow({
    userId: null, user: null, guestName: 'ضيف', guestPhone: '01234567890',
    paymentMethodCode: 'cod',
  })]);
  const router = loadAdminRouter(prisma);
  const res = await invoke(router, 'GET', '/orders', { ...asAdmin, query: {} });
  assert.strictEqual(res.body.orders[0].customerPhone, '01234567890');
  assert.strictEqual(res.body.orders[0].isGuest, true);
  assert.strictEqual(res.body.orders[0].customerName, 'ضيف');
});

test('no phone anywhere → empty string (never undefined)', async () => {
  const prisma = makeFakePrisma([orderRow({})]);
  const router = loadAdminRouter(prisma);
  const res = await invoke(router, 'GET', '/orders', { ...asAdmin, query: {} });
  assert.strictEqual(res.body.orders[0].customerPhone, '');
});
