// Defect 1 harness (auth part) — POST /api/auth/refresh exchanges a
// valid refresh token for a fresh pair; without it the frontend had
// no way to recover from the 15-minute access-token expiry and
// apiFetch dropped the whole session on the first 401, silently
// breaking signed-in actions (cart adds included).
const { test } = require('node:test');
const assert = require('node:assert');
const { installStubs, fakeExpress, fakeAuth, invoke } = require('./stub');

function makeFakePrisma() {
  const users = new Map([
    ['user-9', { id: 'user-9', email: 'nine@example.com', fullName: 'User Nine', role: 'customer', passwordHash: 'x', failedLogins: 0, lockedUntil: null }],
  ]);
  const fake = {
    user: {
      findUnique: async ({ where }) => {
        if (where.id) return users.get(where.id) || null;
        if (where.email) return [...users.values()].find((u) => u.email === where.email) || null;
        return null;
      },
      create: async ({ data }) => {
        const user = { id: `user-${users.size + 1}`, failedLogins: 0, lockedUntil: null, ...data };
        users.set(user.id, user);
        return user;
      },
      update: async ({ where, data }) => {
        const user = users.get(where.id);
        Object.assign(user, data);
        return user;
      },
    },
    seller: {
      create: async ({ data }) => {
        fake.createdSellers.push(data);
        return { id: 'seller-1', ...data };
      },
    },
    createdSellers: [],
    __users: users,
  };
  return fake;
}

function validatorStub() {
  const body = () => {
    const mw = (req, res, next) => next();
    for (const m of ['isEmail', 'normalizeEmail', 'isLength', 'notEmpty', 'isString', 'optional', 'trim', 'isIn']) mw[m] = () => mw;
    return mw;
  };
  return { body, validationResult: () => ({ isEmpty: () => true, array: () => [] }) };
}

function loadAuthRouter(fakePrisma) {
  const restore = installStubs(new Map([
    [(req) => req === 'express', fakeExpress()],
    [(req) => req === 'bcryptjs', { hash: async () => 'hashed', compare: async () => true }],
    [(req) => req === 'express-validator', validatorStub()],
    [(req) => req.endsWith('/utils/db'), fakePrisma],
    [(req) => req.endsWith('/config'), { bcryptRounds: 4 }],
    [(req) => req.endsWith('/middleware/auth'), fakeAuth],
    [(req) => req.endsWith('/utils/security'), { cleanText: (v) => (typeof v === 'string' ? v.trim() : ''), localize: (r) => r }],
  ]));
  delete require.cache[require.resolve('../src/routes/auth.js')];
  const router = require('../src/routes/auth.js');
  restore();
  return router;
}

test('refresh with a valid refresh token returns a fresh pair + user', async () => {
  const router = loadAuthRouter(makeFakePrisma());
  const res = await invoke(router, 'POST', '/refresh', { lang: 'en', body: { refresh: 'good-refresh' } });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.access, 'test-access');
  assert.strictEqual(res.body.refresh, 'test-refresh');
  assert.strictEqual(res.body.user.id, 'user-9');
});

test('refresh with an invalid token → 401; missing token → 400', async () => {
  const router = loadAuthRouter(makeFakePrisma());
  let res = await invoke(router, 'POST', '/refresh', { lang: 'en', body: { refresh: 'bad-token' } });
  assert.strictEqual(res.statusCode, 401);
  res = await invoke(router, 'POST', '/refresh', { lang: 'en', body: {} });
  assert.strictEqual(res.statusCode, 400);
});

// Defect 5 — seller registration store name: a provided storeName
// becomes the seller's business name (both languages, so ensureStore
// names the auto-created store after it); without one, the business
// name falls back to the user's personal name exactly as before.
test('register seller WITH storeName → business name is the store name', async () => {
  const prisma = makeFakePrisma();
  const router = loadAuthRouter(prisma);
  const res = await invoke(router, 'POST', '/register', {
    lang: 'en',
    body: { email: 'shop@example.com', password: 'password123', fullName: 'Personal Name', role: 'seller', storeName: 'My Shop' },
  });
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(prisma.createdSellers.length, 1);
  assert.strictEqual(prisma.createdSellers[0].businessNameAr, 'My Shop');
  assert.strictEqual(prisma.createdSellers[0].businessNameEn, 'My Shop');
});

test('register seller WITHOUT storeName → business name falls back to full name', async () => {
  const prisma = makeFakePrisma();
  const router = loadAuthRouter(prisma);
  const res = await invoke(router, 'POST', '/register', {
    lang: 'en',
    body: { email: 'plain@example.com', password: 'password123', fullName: 'Personal Name', role: 'seller' },
  });
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(prisma.createdSellers.length, 1);
  assert.strictEqual(prisma.createdSellers[0].businessNameAr, 'Personal Name');
  assert.strictEqual(prisma.createdSellers[0].businessNameEn, undefined);
});

test('register customer → no seller row is created', async () => {
  const prisma = makeFakePrisma();
  const router = loadAuthRouter(prisma);
  const res = await invoke(router, 'POST', '/register', {
    lang: 'en',
    body: { email: 'cust@example.com', password: 'password123', fullName: 'Cust Omer', role: 'customer', storeName: 'Ignored Shop' },
  });
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(prisma.createdSellers.length, 0);
});
