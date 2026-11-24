const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { installStubs } = require('./stub');

const statuses = ['draft', 'pending_review', 'published', 'rejected', 'archived'];

function makeDatabase() {
  const calls = [];
  const products = statuses.map((status, i) => ({
    id: `product-${i}`, slug: `${status}-product`, status,
    nameAr: 'منتج للاختبار', nameEn: 'Local fixture', stockQuantity: 0,
    images: [], variants: [], reviews: [],
    seller: { status: 'approved' },
  }));
  products.push({
    id: 'product-demo', slug: 'suspended-seller-product', status: 'published',
    nameAr: 'منتج للاختبار', nameEn: 'Suspended seller fixture', stockQuantity: 5,
    images: [], variants: [], reviews: [], seller: { status: 'suspended' },
  });
  const matches = (p, where) => Object.entries(where).every(([key, val]) => (
    val && typeof val === 'object' ? matches(p[key] || {}, val) : p[key] === val));
  return {
    calls,
    product: {
      findMany: async args => {
        calls.push(['findMany', args]);
        return products.filter(p => matches(p, args.where));
      },
      count: async ({ where }) => products.filter(p => matches(p, where)).length,
      update: async args => { calls.push(['update', args]); return {}; },
    },
  };
}

async function withProducts(run) {
  const db = makeDatabase();
  const restore = installStubs(new Map([[r => r.endsWith('/utils/db'), db]]));
  let router;
  try {
    delete require.cache[require.resolve('../src/routes/products')];
    router = require('../src/routes/products');
  } finally { restore(); }
  const app = express();
  app.use((req, res, next) => { req.lang = 'en'; next(); });
  app.use('/api/products', router);
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try { await run(`http://127.0.0.1:${server.address().port}/api/products`, db); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

for (const status of statuses.filter(s => s !== 'published')) {
  test(`public detail rejects a known ${status} slug without recording a view`, async () => {
    await withProducts(async (base, db) => {
      const response = await fetch(`${base}/${status}-product`);
      assert.equal(response.status, 404);
      const body = await response.json();
      assert.equal(body.product, undefined);
      assert.equal(db.calls.filter(c => c[0] === 'update').length, 0);
      assert.deepEqual(db.calls[0][1].where, { slug: `${status}-product`, status: 'published', seller: { status: 'approved' } });
    });
  });
}

test('published detail remains available even when sold out, with its existing includes and view count', async () => {
  await withProducts(async (base, db) => {
    const response = await fetch(`${base}/published-product`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).product.status, 'published');
    assert.deepEqual(db.calls[0][1].include, { images: true, variants: true, reviews: { take: 10, orderBy: { createdAt: 'desc' } } });
    assert.deepEqual(db.calls.find(c => c[0] === 'update')[1], { where: { id: 'product-2' }, data: { viewCount: { increment: 1 } } });
  });
});

test('unknown and hidden slugs have the same public not-found response', async () => {
  await withProducts(async base => {
    const unknown = await fetch(`${base}/missing-product`);
    const hidden = await fetch(`${base}/draft-product`);
    assert.equal(unknown.status, 404);
    assert.equal(hidden.status, 404);
    assert.deepEqual(await unknown.json(), await hidden.json());
  });
});

test('query parameters cannot override detail visibility', async () => {
  await withProducts(async (base, db) => {
    const response = await fetch(`${base}/rejected-product?status=rejected&preview=true`);
    assert.equal(response.status, 404);
    assert.equal(db.calls[0][1].where.status, 'published');
    assert.equal(db.calls.filter(c => c[0] === 'update').length, 0);
  });
});

test('the public list still returns only published products', async () => {
  await withProducts(async base => {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.products.length, 1);
    assert.equal(body.products[0].status, 'published');
  });
});

test('products of a suspended seller are hidden from the public list and detail', async () => {
  await withProducts(async (base, db) => {
    const list = await (await fetch(base)).json();
    assert.equal(list.products.length, 1);
    assert.ok(list.products.every(p => p.slug !== 'suspended-seller-product'));
    const detail = await fetch(`${base}/suspended-seller-product`);
    assert.equal(detail.status, 404);
    assert.equal(db.calls.filter(c => c[0] === 'update').length, 0);
  });
});
