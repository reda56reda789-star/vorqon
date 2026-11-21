// Cart harness — backend cart endpoints (routes/cart.js) + the shared
// cart resolution (services/carts.js) against an in-memory fake Prisma
// that interprets the raw SQL. Covers: add, repeat-add merge, the
// concurrent-insert race (unique violation → merge retry), quantity
// update, owner scoping, input validation — and the multi-cart
// regression: a user with TWO cart rows (the old racy get-or-create
// could create them, and checkout resolved a different one than the
// cart endpoints) must see GET and POST converge on the OLDEST cart.
const { test } = require('node:test');
const assert = require('node:assert');
const { installStubs, fakeExpress, fakeAuth, invoke } = require('./stub');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PRODUCT = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_PRODUCT = '99999999-9999-4999-8999-999999999999';
const VARIANT = '55555555-5555-4555-8555-555555555555';

function makeFakePrisma() {
  const state = {
    carts: [], // { id, user_id, seq } — seq stands in for created_at order
    items: [], // { id, cart_id, product_id, variant_id, quantity }
    products: new Map([[PRODUCT, { id: PRODUCT, name_ar: 'منتج', name_en: 'Product', sku: 'SKU-1', price: 100, currency: 'EGP', seller_id: 'seller-1', stock_quantity: 10 }]]),
    seq: 0,
    // Test hooks simulating a concurrent request winning a race:
    raceCartCreate: false, // next ON CONFLICT cart insert finds a cart already there
    raceItemInsertQty: null, // next cart_items insert loses to a row with this qty
  };
  const nextId = () => `44444444-4444-4444-8444-${String(++state.seq).padStart(12, '0')}`;
  const sqlOf = (strings) => strings.join(' ').replace(/\s+/g, ' ').trim();
  const oldestCart = (userId) => state.carts.filter((c) => c.user_id === userId).sort((a, b) => a.seq - b.seq)[0];
  const sameVariant = (a, b) => (a ?? null) === (b ?? null);

  function createCart(userId) {
    const cart = { id: nextId(), user_id: userId, seq: state.seq };
    state.carts.push(cart);
    return cart;
  }

  async function queryRaw(strings, ...values) {
    const sql = sqlOf(strings);
    if (sql.startsWith('SELECT id FROM carts')) {
      const cart = oldestCart(values[0]);
      return cart ? [{ id: cart.id }] : [];
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
      const [qty, cartId, productId, variantId] = values;
      const row = state.items.find((it) => it.cart_id === cartId && it.product_id === productId && sameVariant(it.variant_id, variantId));
      if (!row) return [];
      row.quantity += qty;
      return [{ id: row.id, quantity: row.quantity }];
    }
    if (sql.startsWith('INSERT INTO cart_items')) {
      const [cartId, productId, variantId, qty] = values;
      if (state.raceItemInsertQty !== null) {
        // A concurrent add landed first with this quantity; our
        // insert hits the unique line index, exactly like Postgres.
        const winnerQty = state.raceItemInsertQty;
        state.raceItemInsertQty = null;
        state.items.push({ id: nextId(), cart_id: cartId, product_id: productId, variant_id: variantId ?? null, quantity: winnerQty });
        const err = new Error('duplicate key value violates unique constraint "cart_items_unique_line"');
        err.code = '23505';
        throw err;
      }
      const dup = state.items.find((it) => it.cart_id === cartId && it.product_id === productId && sameVariant(it.variant_id, variantId));
      if (dup) {
        const err = new Error('duplicate key value violates unique constraint "cart_items_unique_line"');
        err.code = '23505';
        throw err;
      }
      const row = { id: nextId(), cart_id: cartId, product_id: productId, variant_id: variantId ?? null, quantity: qty };
      state.items.push(row);
      return [{ id: row.id, quantity: row.quantity }];
    }
    if (sql.startsWith('UPDATE cart_items ci SET quantity')) {
      const [qty, itemId, userId] = values;
      const row = state.items.find((it) => it.id === itemId);
      const cart = row && state.carts.find((c) => c.id === row.cart_id);
      if (!row || !cart || cart.user_id !== userId) return [];
      row.quantity = qty;
      return [{ id: row.id, quantity: row.quantity }];
    }
    throw new Error(`fake prisma: unhandled query: ${sql}`);
  }

  async function executeRaw(strings, ...values) {
    const sql = sqlOf(strings);
    if (sql.startsWith('INSERT INTO carts')) {
      const userId = values[0];
      if (sql.includes('ON CONFLICT')) {
        if (state.raceCartCreate) {
          state.raceCartCreate = false;
          createCart(userId); // the concurrent creator's row
          return 0; // ours was a no-op (DO NOTHING)
        }
        if (oldestCart(userId)) return 0;
        createCart(userId);
        return 1;
      }
      createCart(userId);
      return 1;
    }
    if (sql.startsWith('DELETE FROM cart_items')) {
      const [itemId, userId] = values;
      const userCartIds = new Set(state.carts.filter((c) => c.user_id === userId).map((c) => c.id));
      const before = state.items.length;
      state.items = state.items.filter((it) => !(it.id === itemId && userCartIds.has(it.cart_id)));
      return before - state.items.length;
    }
    throw new Error(`fake prisma: unhandled execute: ${sql}`);
  }

  return { $queryRaw: queryRaw, $executeRaw: executeRaw, __state: state, __createCart: createCart };
}

function loadCartRouter(fakePrisma) {
  const restore = installStubs(new Map([
    [(req) => req === 'express', fakeExpress()],
    [(req) => req.endsWith('/utils/db'), fakePrisma],
    [(req) => req.endsWith('/middleware/auth'), fakeAuth],
  ]));
  delete require.cache[require.resolve('../src/routes/cart.js')];
  delete require.cache[require.resolve('../src/services/carts.js')];
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
  assert.strictEqual(prisma.__state.carts.length, 1, 'exactly one cart must exist');
});

test('concurrent insert race: unique violation on insert retries as a merge', async () => {
  const prisma = makeFakePrisma();
  const router = loadCartRouter(prisma);
  // Another request inserts the same product (qty 4) between our
  // merge UPDATE (miss) and our INSERT: the insert must surface as a
  // unique violation and the add must land as a merge, not a 500 and
  // not a duplicate row.
  prisma.__state.raceItemInsertQty = 4;
  const res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 1 } });
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.item.quantity, 5, 'our qty merges into the race winner row');
  assert.strictEqual(prisma.__state.items.length, 1, 'still exactly one row for the product');
});

test('variant lines merge per variant; NULL variant is its own line', async () => {
  const prisma = makeFakePrisma();
  const router = loadCartRouter(prisma);
  let res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 1, variant_id: VARIANT } });
  assert.strictEqual(res.statusCode, 201);
  res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 2, variant_id: VARIANT } });
  assert.strictEqual(res.body.item.quantity, 3, 'same variant merges');
  res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 1 } });
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(prisma.__state.items.length, 2, 'NULL-variant line stays separate from the variant line');
});

test('multi-cart user: GET and POST converge on the OLDEST cart', async () => {
  const prisma = makeFakePrisma();
  const router = loadCartRouter(prisma);
  const st = prisma.__state;
  const cartA = prisma.__createCart(USER); // older
  const cartB = prisma.__createCart(USER); // newer duplicate
  st.items.push({ id: 'item-a', cart_id: cartA.id, product_id: PRODUCT, variant_id: null, quantity: 1 });
  st.items.push({ id: 'item-b', cart_id: cartB.id, product_id: PRODUCT, variant_id: null, quantity: 5 });

  let res = await invoke(router, 'GET', '/', asUser(USER));
  assert.strictEqual(res.body.items.length, 1);
  assert.strictEqual(res.body.items[0].id, 'item-a', 'GET reads the oldest cart');
  assert.strictEqual(res.body.subtotal, 100);

  res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 1 } });
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.item.id, 'item-a', 'POST merges into the same oldest cart');
  assert.strictEqual(res.body.item.quantity, 2);
  assert.strictEqual(st.items.find((i) => i.id === 'item-b').quantity, 5, 'the duplicate cart is untouched');
  assert.strictEqual(st.carts.length, 2, 'no third cart is created');
});

test('cart creation race: a concurrent creator still yields one shared cart', async () => {
  const prisma = makeFakePrisma();
  const router = loadCartRouter(prisma);
  prisma.__state.raceCartCreate = true;
  const res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 1 } });
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(prisma.__state.carts.length, 1, 'exactly one cart after the race');
  const get = await invoke(router, 'GET', '/', asUser(USER));
  assert.strictEqual(get.body.items.length, 1, 'GET resolves to the same cart the POST used');
});

test('add validates input: bad uuid → 400, unknown product → 404, bad quantity → 400, bad variant → 400', async () => {
  const router = loadCartRouter(makeFakePrisma());
  let res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: 'not-a-uuid', quantity: 1 } });
  assert.strictEqual(res.statusCode, 400);
  res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: UNKNOWN_PRODUCT, quantity: 1 } });
  assert.strictEqual(res.statusCode, 404);
  res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 0 } });
  assert.strictEqual(res.statusCode, 400);
  res = await invoke(router, 'POST', '/items', { ...asUser(USER), body: { product_id: PRODUCT, quantity: 1, variant_id: 'nope' } });
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
