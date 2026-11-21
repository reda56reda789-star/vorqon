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
  return {
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
        makeFakePrisma.lastSellerCreate = data;
        return { id: 'seller-1', ...data };
      },
    },
    __users: users,
  };
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
