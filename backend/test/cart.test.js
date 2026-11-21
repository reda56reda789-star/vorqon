// Defect 1 harness — backend cart endpoints (routes/cart.js) against
// an in-memory fake Prisma that interprets the route's raw SQL.
// Covers: add, repeat-add merge (the old INSERT ... ON CONFLICT could
// never merge — variant_id is NULL and NULLs are distinct in the
// table's unique index), quantity update, owner scoping on
// update/delete, and input validation.
const { test } = require('node:test');
const assert = require('node:assert');
const { installStubs, fakeExpress, fakeAuth, invoke } = require('./stub');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PRODUCT = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_PRODUCT = '99999999-9999-4999-8999-999999999999';

function makeFakePrisma() {
  const state = {
    carts: new Map(), // userId -> cartId
    items: [], // { id, cart_id, product_id, quantity }
    products: new Map([[PRODUCT, { id: PRODUCT, name_ar: 'منتج', name_en: 'Product', sku: 'SKU-1', price: 100, currency: 'EGP', seller_id: 'seller-1', stock_quantity: 10 }]]),
    seq: 0,
  };
  const nextId = () => `44444444-4444-4444-8444-${String(++state.seq).padStart(12, '0')}`;
  const sqlOf = (strings) => strings.join(' ').replace(/\s+/g, ' ').trim();

  async function queryRaw(strings, ...values) {
    const sql = sqlOf(strings);
    if (sql.startsWith('SELECT id FROM carts')) {
      const cartId = state.carts.get(values[0]);
      return cartId ? [{ id: cartId }] : [];
    }
    if (sql.startsWith('INSERT INTO carts')) {
      const id = nextId();
      state.carts.set(values[0], id);
      return [{ id }];
    }
    if (sql.includes('FROM cart_items ci JOIN products')) {
      return state.items.filter((it) => it.cart_id === values[0]).map((it) => {
        const p = state.products.get(it.product_id);
        return { id: it.id, quantity: it.quantity, product_id: it.product_id, name_ar: p.name_ar, name_en: p.name_en, sku: p.sku, price: p.price, currency: p.currency, seller_id: p.seller_id, stock_quantity: p.stock_quantity };
      });
    }
    if (sql.startsWith('SELECT id FROM products')) {
      return state.products.has(values[0]) ? [{ id: values[0] }] : [];
    }
    if (sql.startsWith('UPDATE cart_items SET quantity = quantity +')) {
      const [qty, cartId, productId] = values;
      const row = state.items.find((it) => it.cart_id === cartId && it.product_id === productId);
      if (!row) return [];
      row.quantity += qty;
      return [{ id: row.id, quantity: row.quantity }];
    }
    if (sql.startsWith('INSERT INTO cart_items')) {
      const [cartId, productId, qty] = values;
      const row = { id: nextId(), cart_id: cartId, product_id: productId, quantity: qty };
      state.items.push(row);
      return [{ id: row.id, quantity: row.quantity }];
    }
    if (sql.startsWith('UPDATE cart_items ci SET quantity')) {
      const [qty, itemId, userId] = values;
      const row = state.items.find((it) => it.id === itemId);
      if (!row || state.carts.get(userId) !== row.cart_id) return [];
      row.quantity = qty;
      return [{ id: row.id, quantity: row.quantity }];
    }
    throw new Error(`fake prisma: unhandled query: ${sql}`);
  }

  async function executeRaw(strings, ...values) {
    const sql = sqlOf(strings);
    if (sql.startsWith('DELETE FROM cart_items')) {
      const [itemId, userId] = values;
      const cartId = state.carts.get(userId);
      const before = state.items.length;
      state.items = state.items.filter((it) => !(it.id === itemId && it.cart_id === cartId));
      return before - state.items.length;
    }
    throw new Error(`fake prisma: unhandled execute: ${sql}`);
  }

  return { $queryRaw: queryRaw, $executeRaw: executeRaw, __state: state };
}

function loadCartRouter(fakePrisma) {
  const restore = installStubs(new Map([
    [(req) => req === 'express', fakeExpress()],
    [(req) => req.endsWith('/utils/db'), fakePrisma],
    [(req) => req.endsWith('/middleware/auth'), fakeAuth],
  ]));
  delete require.cache[require.resolve('../src/routes/cart.js')];
  const router = require('../src/routes/cart.js');
  restore();
  return router;
}

const asUser = (id) => ({ __user: { id, role: 'customer', email: 'u@example.com' }, lang: 'en' });

test('add → repeat add merges into one row; GET shows merged quantity + subtotal', async () => {
  const prisma = makeFakePrisma();
  const router = loadCartRouter(prisma);

  let res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 1 } });
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.item.quantity, 1);

  res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 2 } });
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.item.quantity, 3, 'repeat add must merge, not duplicate');

  res = await invoke(router, 'GET', '/', asUser(USER));
  assert.strictEqual(res.body.items.length, 1);
  assert.strictEqual(res.body.items[0].quantity, 3);
  assert.strictEqual(res.body.subtotal, 300);
});

test('add validates input: bad uuid → 400, unknown product → 404, bad quantity → 400', async () => {
  const router = loadCartRouter(makeFakePrisma());
  let res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: 'not-a-uuid', quantity: 1 } });
  assert.strictEqual(res.statusCode, 400);
  res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: UNKNOWN_PRODUCT, quantity: 1 } });
  assert.strictEqual(res.statusCode, 404);
  res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 0 } });
  assert.strictEqual(res.statusCode, 400);
});

test('PATCH sets quantity, is owner-scoped, and validates quantity', async () => {
  const prisma = makeFakePrisma();
  const router = loadCartRouter(prisma);
  const add = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 1 } });
  const itemId = add.body.item.id;

  let res = await invoke(router, 'PATCH', '/items/:id', { ...asUser(USER), params: { id: itemId }, body: { quantity: 5 } });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.item.quantity, 5);

  res = await invoke(router, 'PATCH', '/items/:id', { ...asUser(OTHER), params: { id: itemId }, body: { quantity: 9 } });
  assert.strictEqual(res.statusCode, 404, "another user's item must not be updatable");
  assert.strictEqual(prisma.__state.items[0].quantity, 5);

  res = await invoke(router, 'PATCH', '/items/:id', { ...asUser(USER), params: { id: itemId }, body: { quantity: 0 } });
  assert.strictEqual(res.statusCode, 400);
});

test('DELETE removes only the caller\'s own items', async () => {
  const prisma = makeFakePrisma();
  const router = loadCartRouter(prisma);
  const add = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 1 } });
  const itemId = add.body.item.id;

  let res = await invoke(router, 'DELETE', '/items/:id', { ...asUser(OTHER), params: { id: itemId } });
  assert.strictEqual(res.body.removed, 0, "another user's item must not be deletable");
  assert.strictEqual(prisma.__state.items.length, 1);

  res = await invoke(router, 'DELETE', '/items/:id', { ...asUser(USER), params: { id: itemId } });
  assert.strictEqual(res.body.removed, 1);
  res = await invoke(router, 'GET', '/', asUser(USER));
  assert.deepStrictEqual(res.body.items, []);
  assert.strictEqual(res.body.subtotal, 0);
});
