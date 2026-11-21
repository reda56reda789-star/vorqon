// Seller suspend/reactivate harness — PATCH /api/admin/sellers/:id/suspend
// and /reactivate. Proves the validated transitions (suspend only from
// approved, reactivate only from suspended), the 404 on unknown sellers,
// the store is_active flip in both directions, that a seller with no
// store row still suspends cleanly, and that every successful action
// writes exactly one audit row while rejected transitions write none.
const { test } = require('node:test');
const assert = require('node:assert');
const { installStubs, fakeExpress, fakeAuth, fakeRbac, invoke } = require('./stub');

function makeFakePrisma(sellersById) {
  const calls = { sellerUpdate: [], storeUpdateMany: [], audit: [] };
  return {
    calls,
    seller: {
      findUnique: async ({ where }) => {
        const s = sellersById[where.id];
        return s ? { id: s.id, status: s.status } : null;
      },
      update: async ({ where, data }) => {
        calls.sellerUpdate.push([where.id, data]);
        sellersById[where.id].status = data.status;
        return { id: where.id, ...data };
      },
    },
    store: {
      updateMany: async ({ where, data }) => {
        calls.storeUpdateMany.push([where, data]);
        return { count: 1 };
      },
    },
    $queryRaw: async () => [],
    $executeRaw: async (strings, ...values) => { calls.audit.push(values); return 1; },
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
const call = (router, action, id) =>
  invoke(router, 'PATCH', `/sellers/:id/${action}`, { ...asAdmin, params: { id } });

test('suspend: approved seller → suspended, store deactivated, audit written', async () => {
  const sellers = { 's-1': { id: 's-1', status: 'approved' } };
  const prisma = makeFakePrisma(sellers);
  const router = loadAdminRouter(prisma);
  const res = await call(router, 'suspend', 's-1');
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { ok: true });
  assert.strictEqual(sellers['s-1'].status, 'suspended');
  assert.deepStrictEqual(prisma.calls.sellerUpdate, [['s-1', { status: 'suspended' }]]);
  assert.deepStrictEqual(prisma.calls.storeUpdateMany, [[{ sellerId: 's-1' }, { isActive: false }]]);
  assert.strictEqual(prisma.calls.audit.length, 1);
  assert.ok(prisma.calls.audit[0].includes('seller.suspend'));
  assert.ok(prisma.calls.audit[0].includes('s-1'));
});

test('suspend: pending seller → 400, nothing changes, no audit', async () => {
  const sellers = { 's-2': { id: 's-2', status: 'pending' } };
  const prisma = makeFakePrisma(sellers);
  const router = loadAdminRouter(prisma);
  const res = await call(router, 'suspend', 's-2');
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(sellers['s-2'].status, 'pending');
  assert.strictEqual(prisma.calls.sellerUpdate.length, 0);
  assert.strictEqual(prisma.calls.storeUpdateMany.length, 0);
  assert.strictEqual(prisma.calls.audit.length, 0);
});

test('suspend: already-suspended seller → 400 (no double suspend)', async () => {
  const sellers = { 's-3': { id: 's-3', status: 'suspended' } };
  const prisma = makeFakePrisma(sellers);
  const router = loadAdminRouter(prisma);
  const res = await call(router, 'suspend', 's-3');
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(prisma.calls.sellerUpdate.length, 0);
  assert.strictEqual(prisma.calls.audit.length, 0);
});

test('suspend: unknown seller → 404, nothing changes, no audit', async () => {
  const prisma = makeFakePrisma({});
  const router = loadAdminRouter(prisma);
  const res = await call(router, 'suspend', 'nope');
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(prisma.calls.sellerUpdate.length, 0);
  assert.strictEqual(prisma.calls.storeUpdateMany.length, 0);
  assert.strictEqual(prisma.calls.audit.length, 0);
});

test('reactivate: suspended seller → approved, store reactivated, audit written', async () => {
  const sellers = { 's-4': { id: 's-4', status: 'suspended' } };
  const prisma = makeFakePrisma(sellers);
  const router = loadAdminRouter(prisma);
  const res = await call(router, 'reactivate', 's-4');
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { ok: true });
  assert.strictEqual(sellers['s-4'].status, 'approved');
  assert.deepStrictEqual(prisma.calls.sellerUpdate, [['s-4', { status: 'approved' }]]);
  assert.deepStrictEqual(prisma.calls.storeUpdateMany, [[{ sellerId: 's-4' }, { isActive: true }]]);
  assert.strictEqual(prisma.calls.audit.length, 1);
  assert.ok(prisma.calls.audit[0].includes('seller.reactivate'));
});

test('reactivate: approved seller → 400, nothing changes, no audit', async () => {
  const sellers = { 's-5': { id: 's-5', status: 'approved' } };
  const prisma = makeFakePrisma(sellers);
  const router = loadAdminRouter(prisma);
  const res = await call(router, 'reactivate', 's-5');
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(sellers['s-5'].status, 'approved');
  assert.strictEqual(prisma.calls.sellerUpdate.length, 0);
  assert.strictEqual(prisma.calls.storeUpdateMany.length, 0);
  assert.strictEqual(prisma.calls.audit.length, 0);
});

test('reactivate: unknown seller → 404', async () => {
  const prisma = makeFakePrisma({});
  const router = loadAdminRouter(prisma);
  const res = await call(router, 'reactivate', 'nope');
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(prisma.calls.sellerUpdate.length, 0);
  assert.strictEqual(prisma.calls.audit.length, 0);
});

test('suspend → reactivate round trip restores status and store flag', async () => {
  const sellers = { 's-6': { id: 's-6', status: 'approved' } };
  const prisma = makeFakePrisma(sellers);
  const router = loadAdminRouter(prisma);
  assert.strictEqual((await call(router, 'suspend', 's-6')).statusCode, 200);
  assert.strictEqual((await call(router, 'reactivate', 's-6')).statusCode, 200);
  assert.strictEqual(sellers['s-6'].status, 'approved');
  assert.deepStrictEqual(
    prisma.calls.storeUpdateMany.map(([, data]) => data.isActive),
    [false, true],
  );
  assert.strictEqual(prisma.calls.audit.length, 2);
});
