// Checkout cart-resolution harness — POST /api/orders/checkout
// (routes/orders.js) against a fake Prisma + a recording
// createOrderWithSplit stub. Regression covered: checkout used to
// resolve the user's cart with SELECT ... LIMIT 1 and no ORDER BY
// while the cart endpoints used the OLDEST cart, so for a user with
// duplicate cart rows the order consumed a different cart than the
// one displayed. Checkout must consume exactly the oldest cart — the
// one GET /api/cart shows — and clear only that cart's items.
const { test } = require('node:test');
const assert = require('node:assert');
const { installStubs, fakeExpress, fakeAuth, fakeRbac, invoke } = require('./stub');

const USER = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '33333333-3333-4333-8333-333333333333';

function makeFakePrisma() {
  const state = {
    carts: [], // { id, user_id, seq }
    items: [], // { cart_id, product_id, variant_id, quantity, price, currency }
    seq: 0,
    clearedCartIds: [],
  };
  const sqlOf = (strings) => strings.join(' ').replace(/\s+/g, ' ').trim();

  async function queryRaw(strings, ...values) {
    const sql = sqlOf(strings);
    if (sql.startsWith('SELECT id FROM carts')) {
      const cart = state.carts.filter((c) => c.user_id === values[0]).sort((a, b) => a.seq - b.seq)[0];
      return cart ? [{ id: cart.id }] : [];
    }
    if (sql.startsWith('SELECT ci.product_id')) {
      return state.items.filter((it) => it.cart_id === values[0])
        .map((it) => ({ product_id: it.product_id, variant_id: it.variant_id, quantity: it.quantity, price: it.price, currency: it.currency }));
    }
    throw new Error(`fake prisma: unhandled query: ${sql}`);
  }

  async function executeRaw(strings, ...values) {
    const sql = sqlOf(strings);
    if (sql.startsWith('DELETE FROM cart_items WHERE cart_id')) {
      state.clearedCartIds.push(values[0]);
      const before = state.items.length;
      state.items = state.items.filter((it) => it.cart_id !== values[0]);
      return before - state.items.length;
    }
    throw new Error(`fake prisma: unhandled execute: ${sql}`);
  }

  return { $queryRaw: queryRaw, $executeRaw: executeRaw, __state: state };
}

function loadOrdersRouter(fakePrisma, orderCalls) {
  const fakeOrdersService = {
    createOrderWithSplit: async (args) => {
      orderCalls.push(args);
      return {
        parent: { id: 'order-parent', orderNumber: 'VQ-2026-000001', grandTotal: 200 },
        children: [{ id: 'order-child', orderNumber: 'VQ-2026-000002', sellerId: 'seller-1', grandTotal: 200 }],
      };
    },
  };
  const restore = installStubs(new Map([
    [(req) => req === 'express', fakeExpress()],
    [(req) => req.endsWith('/utils/db'), fakePrisma],
    [(req) => req.endsWith('/middleware/auth'), fakeAuth],
    [(req) => req.endsWith('/middleware/rbac'), fakeRbac],
    [(req) => req.endsWith('/services/orders'), fakeOrdersService],
  ]));
  delete require.cache[require.resolve('../src/routes/orders.js')];
  delete require.cache[require.resolve('../src/services/carts.js')];
  const router = require('../src/routes/orders.js');
  restore();
  return router;
}

const asUser = { __user: { id: USER, role: 'customer', email: 'u@example.com' }, lang: 'en' };

test('checkout consumes the OLDEST cart (the one the cart page shows) and clears only it', async () => {
  const prisma = makeFakePrisma();
  const st = prisma.__state;
  st.carts.push({ id: 'cart-a', user_id: USER, seq: 1 }); // oldest — displayed
  st.carts.push({ id: 'cart-b', user_id: USER, seq: 2 }); // duplicate
  st.items.push({ cart_id: 'cart-a', product_id: PRODUCT, variant_id: null, quantity: 2, price: 100, currency: 'EGP' });
  st.items.push({ cart_id: 'cart-b', product_id: PRODUCT, variant_id: null, quantity: 7, price: 100, currency: 'EGP' });

  const orderCalls = [];
  const router = loadOrdersRouter(prisma, orderCalls);
  const res = await invoke(router, 'POST', '/checkout', { ...asUser, body: { currency: 'EGP' } });

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(orderCalls.length, 1);
  assert.strictEqual(orderCalls[0].items.length, 1, 'the order takes the displayed cart\'s lines only');
  assert.strictEqual(orderCalls[0].items[0].quantity, 2, 'quantity comes from the oldest cart, not the duplicate');
  assert.deepStrictEqual(st.clearedCartIds, ['cart-a'], 'only the consumed cart is cleared');
  assert.strictEqual(st.items.length, 1);
  assert.strictEqual(st.items[0].cart_id, 'cart-b');
});

test('checkout with no cart at all → 400 Cart is empty, no order created', async () => {
  const prisma = makeFakePrisma();
  const orderCalls = [];
  const router = loadOrdersRouter(prisma, orderCalls);
  const res = await invoke(router, 'POST', '/checkout', { ...asUser, body: {} });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(orderCalls.length, 0);
});

test('checkout with an empty cart → 400 Cart is empty, no order created', async () => {
  const prisma = makeFakePrisma();
  prisma.__state.carts.push({ id: 'cart-a', user_id: USER, seq: 1 });
  const orderCalls = [];
  const router = loadOrdersRouter(prisma, orderCalls);
  const res = await invoke(router, 'POST', '/checkout', { ...asUser, body: {} });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(orderCalls.length, 0);
});
