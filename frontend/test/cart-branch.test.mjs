// Defect 1 harness — the unified addToCart branch (lib/guestCart.js).
// Loads the REAL api.js + guestCart.js sources (only `import.meta.env`
// is neutralised, since that is a Vite build-time global) with stubbed
// localStorage / window / fetch, and proves:
//   - with an access token: the add goes to POST /api/cart/items and
//     the local guest cart is untouched;
//   - without a token: no network call, the local guest cart is used.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib');

function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    __map: map,
  };
}

async function loadModules(localStorage, fetchImpl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vorqon-cart-branch-'));
  const apiSrc = fs.readFileSync(path.join(SRC, 'api.js'), 'utf8').replaceAll('import.meta.env', '({})');
  fs.writeFileSync(path.join(dir, 'api.js'), apiSrc);
  fs.copyFileSync(path.join(SRC, 'guestCart.js'), path.join(dir, 'guestCart.js'));
  globalThis.localStorage = localStorage;
  globalThis.window = { dispatchEvent: () => true };
  globalThis.fetch = fetchImpl;
  const guestCart = await import(pathToFileURL(path.join(dir, 'guestCart.js')).href);
  return guestCart;
}

const PRODUCT = { id: 'prod-1', slug: 'prod-1', nameAr: 'منتج', nameEn: 'Product', price: 50, currency: 'EGP', images: [] };

test('cartTargetFor: token → server, no token → guest', async () => {
  const ls = makeLocalStorage();
  const gc = await loadModules(ls, async () => { throw new Error('fetch must not be called'); });
  assert.strictEqual(gc.cartTargetFor(true), 'server');
  assert.strictEqual(gc.cartTargetFor(false), 'guest');
});

test('with an access token, addToCart posts to the server cart only', async () => {
  const ls = makeLocalStorage();
  ls.setItem('vorqon-access', 'token-123');
  const calls = [];
  const gc = await loadModules(ls, async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 201, json: async () => ({ item: { id: 'ci-1', quantity: 1 } }) };
  });
  await gc.addToCart(PRODUCT, 2);
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/cart/items'), `unexpected URL: ${calls[0].url}`);
  assert.strictEqual(calls[0].opts.method, 'POST');
  assert.deepStrictEqual(JSON.parse(calls[0].opts.body), { product_id: 'prod-1', quantity: 2 });
  assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer token-123');
  assert.strictEqual(ls.getItem('vorqon-guest-cart'), null, 'guest cart must stay untouched for signed-in adds');
});

test('without a token, addToCart uses the local guest cart only', async () => {
  const ls = makeLocalStorage();
  let fetchCalls = 0;
  const gc = await loadModules(ls, async () => { fetchCalls++; throw new Error('fetch must not be called'); });
  await gc.addToCart(PRODUCT, 1);
  await gc.addToCart(PRODUCT, 1);
  assert.strictEqual(fetchCalls, 0);
  const items = gc.getGuestCart();
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].productId, 'prod-1');
  assert.strictEqual(items[0].quantity, 2);
  assert.strictEqual(gc.guestCartCount(), 2);
});
