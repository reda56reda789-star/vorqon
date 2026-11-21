// Order-service harness — createOrderWithSplit (services/orders.js)
// against a fake Prisma transaction. Covers the payment-method
// default: the platform is COD-only, so an order created without an
// explicit method (the signed-in checkout) must record
// 'cash_on_delivery' on parent AND sub-orders instead of leaving the
// column NULL (which rendered as an empty payment method in admin);
// an explicitly supplied method (guest checkout's 'cod') is kept.
const { test } = require('node:test');
const assert = require('node:assert');
const { installStubs } = require('./stub');

const USER = '11111111-1111-4111-8111-111111111111';
const SELLER = '66666666-6666-4666-8666-666666666666';
const PRODUCT = '33333333-3333-4333-8333-333333333333';

function makeFakePrisma() {
  const created = { orders: [], items: [] };
  const product = {
    id: PRODUCT, sku: 'SKU-1', sellerId: SELLER, categoryId: 'cat-1',
    nameAr: 'منتج', nameEn: 'Product', stockQuantity: 10,
  };
  const tx = {
    product: {
      findUnique: async () => product,
      update: async () => ({}),
    },
    order: {
      create: async ({ data }) => {
        const row = { id: `order-${created.orders.length + 1}`, ...data };
        created.orders.push(row);
        return row;
      },
    },
    orderItem: {
      create: async ({ data }) => { created.items.push(data); return data; },
    },
    seller: { findUnique: async () => ({ commissionRate: 5 }) },
    $queryRaw: async () => [], // commissions: no per-category override
  };
  return {
    created,
    $transaction: async (cb) => cb(tx),
  };
}

function loadOrderService(fakePrisma) {
  const restore = installStubs(new Map([
    [(req) => req.endsWith('/utils/db'), fakePrisma],
  ]));
  delete require.cache[require.resolve('../src/services/orders.js')];
  const svc = require('../src/services/orders.js');
  restore();
  return svc;
}

const oneItem = [{ productId: PRODUCT, quantity: 1, unitPrice: 100 }];

test('signed-in checkout (no method supplied) records cash_on_delivery on parent + children', async () => {
  const prisma = makeFakePrisma();
  const { createOrderWithSplit } = loadOrderService(prisma);
  const { parent, children } = await createOrderWithSplit({
    userId: USER, addressId: null, currency: 'EGP', exchangeRateUsed: 1,
    items: oneItem, couponCode: null,
  });
  assert.strictEqual(parent.paymentMethodCode, 'cash_on_delivery');
  assert.strictEqual(children.length, 1);
  assert.strictEqual(children[0].paymentMethodCode, 'cash_on_delivery');
});

test('an explicitly supplied method (guest cod) is preserved', async () => {
  const prisma = makeFakePrisma();
  const { createOrderWithSplit } = loadOrderService(prisma);
  const { parent, children } = await createOrderWithSplit({
    userId: null, addressId: null, currency: 'EGP', exchangeRateUsed: 1,
    items: oneItem, couponCode: null,
    guest: { name: 'ضيف', phone: '01000000000', city: 'القاهرة', address: 'شارع' },
    paymentMethodCode: 'cod', paymentStatus: 'cash_on_delivery',
  });
  assert.strictEqual(parent.paymentMethodCode, 'cod');
  assert.strictEqual(children[0].paymentMethodCode, 'cod');
  assert.strictEqual(parent.paymentStatus, 'cash_on_delivery');
  assert.strictEqual(parent.guestPhone, '01000000000');
});
