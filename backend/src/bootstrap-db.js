// VORQON — DB bootstrap: first-boot database self-initialisation.
// Wired into boot through the package.json `start` script:
//   node src/bootstrap-db.js && node src/server.js
//
// Guard: unless DB_BOOTSTRAP === 'true' this is a no-op (exit 0), so
// local dev and docker-compose behave exactly as before (compose seeds
// the schema itself via postgres initdb). On Render the blueprint sets
// DB_BOOTSTRAP=true and the image bundles the SQL files (see the
// repo-root Dockerfile: /app/db/schema.sql + /app/db/catalog-repo.sql).
//
// Behaviour when enabled:
//   - Connects to DATABASE_URL, with retries — Neon compute may be
//     waking from scale-to-zero on the very first deploy.
//   - If table `products` exists and holds rows, the DB is considered
//     initialised and the schema/catalog are not re-applied.
//   - Otherwise applies schema.sql, then catalog-repo.sql. Both files
//     are idempotent (CREATE ... IF NOT EXISTS / ON CONFLICT DO
//     NOTHING; the catalog is a single transaction), so re-running on
//     a partially initialised DB never duplicates data.
//   - Either way, a one-time catalog data completion then runs when
//     `product_images` is still empty: catalog-images.sql seeds one
//     type photo per product, compare-at prices and descriptions. A
//     missing completion file only skips the step, never aborts boot.
//   - Finally, one-time fixups run exactly once each, guarded by
//     sentinel rows in catalog_fixups: 'prices-v2' applies
//     catalog-prices.sql (v2 per-(type, size) re-pricing + wrong-
//     attribute name cleanup), 'guest-orders-v1' applies
//     guest-orders.sql (orders.user_id nullable + guest contact
//     columns for guest checkout), and 'cancel-test-order-v1'
//     applies cancel-test-order.sql (cancels the one automated test
//     guest order created during live verification, restoring its
//     stock), 'wishlist-v1' applies wishlist.sql (guarantees the
//     favourites table behind the wishlist endpoints), and
//     'commission-range-v1' applies commission-range.sql (widens the
//     sellers.commission_rate CHECK from 50 to the admin-editable
//     0–100 range), 'cart-dedupe-v1' applies cart-dedupe.sql
//     (collapses duplicate carts per user into the oldest cart,
//     merging item quantities NULL-safely, and adds the one-cart-per-
//     user + unique-cart-line guard indexes), and
//     'order-payment-backfill-v1' applies order-payment-backfill.sql
//     (sets payment_method_code='cash_on_delivery' on orders that
//     predate the order service recording it). A missing fixup file
//     only skips its step, never aborts boot.
//   - On EVERY boot (not sentinel-gated), if ADMIN_EMAIL is set, the
//     user with that email is promoted to role 'admin' (idempotent
//     UPDATE; a missing user is simply retried on the next boot).
//     Failures here are logged and never abort boot.
//   - Any failure exits 1, which stops the `&&` boot chain with a clear
//     [db-bootstrap] error in the log instead of serving a broken API.
const fs = require('fs');
const path = require('path');

const TAG = '[db-bootstrap]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Locate an SQL file: DB_SQL_DIR override -> Docker image layout
// (<backend>/db/) -> repo layout (running from backend/src in the repo).
const SQL_FILES = {
  schema: { fileName: 'schema.sql', repoPath: ['database', 'schema.sql'] },
  catalog: { fileName: 'catalog-repo.sql', repoPath: ['catalog-10000', 'catalog-repo.sql'] },
  'catalog-images': { fileName: 'catalog-images.sql', repoPath: ['catalog-10000', 'catalog-images.sql'] },
  'catalog-prices': { fileName: 'catalog-prices.sql', repoPath: ['catalog-10000', 'catalog-prices.sql'] },
  'guest-orders': { fileName: 'guest-orders.sql', repoPath: ['database', 'guest-orders.sql'] },
  'cancel-test-order': { fileName: 'cancel-test-order.sql', repoPath: ['database', 'cancel-test-order.sql'] },
  wishlist: { fileName: 'wishlist.sql', repoPath: ['database', 'wishlist.sql'] },
  'commission-range': { fileName: 'commission-range.sql', repoPath: ['database', 'commission-range.sql'] },
  'cart-dedupe': { fileName: 'cart-dedupe.sql', repoPath: ['database', 'cart-dedupe.sql'] },
  'order-payment-backfill': { fileName: 'order-payment-backfill.sql', repoPath: ['database', 'order-payment-backfill.sql'] },
};

function resolveSqlFile(kind) {
  const { fileName, repoPath } = SQL_FILES[kind];
  const candidates = [];
  if (process.env.DB_SQL_DIR) candidates.push(path.join(process.env.DB_SQL_DIR, fileName));
  candidates.push(path.join(__dirname, '..', 'db', fileName));
  candidates.push(path.join(__dirname, '..', '..', ...repoPath));
  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error(`SQL file not found (${kind}). Tried: ${candidates.join(' | ')}`);
}

// Neon's pooled endpoint ("<endpoint>-pooler.<region>...") goes through
// PgBouncer in transaction mode, which cannot run the multi-statement
// SQL files below. The direct endpoint is the same host without the
// "-pooler" infix — use it for the bootstrap connection only (the API
// keeps using DATABASE_URL exactly as configured).
function directConnectionString(cs) {
  const m = cs.match(/^(postgres(?:ql)?:\/\/[^@]+@)([^/?]+)(.*)$/);
  if (m && m[2].includes('-pooler')) return m[1] + m[2].replace('-pooler', '') + m[3];
  return cs;
}

async function connectWithRetry(Client, connectionString, attempts = 5) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 30000,
      application_name: 'vorqon-db-bootstrap',
    });
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastErr = err;
      try { await client.end(); } catch (_) { /* already closed */ }
      console.error(`${TAG} connection attempt ${i}/${attempts} failed: ${err.message}`);
      if (i < attempts) await sleep(4000);
    }
  }
  throw lastErr;
}

async function main() {
  if (process.env.DB_BOOTSTRAP !== 'true') {
    console.log(`${TAG} DB_BOOTSTRAP is not 'true' — skipping.`);
    return;
  }

  try { require('dotenv').config(); } catch (_) { /* env already provided (e.g. Render) */ }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  const { Client } = require('pg');

  console.log(`${TAG} connecting to database...`);
  const client = await connectWithRetry(Client, directConnectionString(connectionString));
  try {
    const reg = await client.query("SELECT to_regclass('public.products') AS products_table");
    let productCount = 0;
    if (reg.rows[0].products_table) {
      const c = await client.query('SELECT COUNT(*)::int AS n FROM products');
      productCount = c.rows[0].n;
    }
    if (productCount > 0) {
      console.log(`${TAG} database already initialised (${productCount} products) — nothing to apply.`);
    } else {
      const schemaPath = resolveSqlFile('schema');
      console.log(`${TAG} applying schema: ${schemaPath}`);
      await client.query(fs.readFileSync(schemaPath, 'utf8'));
      console.log(`${TAG} schema applied.`);

      const catalogPath = resolveSqlFile('catalog');
      console.log(`${TAG} applying catalog: ${catalogPath}`);
      await client.query(fs.readFileSync(catalogPath, 'utf8'));

      const after = await client.query('SELECT COUNT(*)::int AS n FROM products');
      console.log(`${TAG} catalog applied. products now: ${after.rows[0].n}`);
    }

    await applyCatalogCompletion(client);
    await applyPriceFixup(client);
    await applyGuestOrdersFixup(client);
    await applyCancelTestOrderFixup(client);
    await applyWishlistFixup(client);
    await applyCommissionRangeFixup(client);
    await applyCartDedupeFixup(client);
    await applyOrderPaymentBackfillFixup(client);
    await promoteAdmin(client);
  } finally {
    await client.end().catch(() => {});
  }
}

// One-time catalog data completion: type photos, compare-at prices and
// descriptions from catalog-images.sql. Runs on both the fresh-DB path
// (right after the catalog seed) and the already-initialised path (the
// live DB predates the file), exactly once — it is skipped whenever
// product_images already holds rows, and the file itself is idempotent.
// A missing file (older image) skips the step instead of aborting boot.
async function applyCatalogCompletion(client) {
  const reg = await client.query("SELECT to_regclass('public.product_images') AS images_table");
  if (!reg.rows[0].images_table) {
    console.log(`${TAG} product_images table not found — skipping catalog data completion.`);
    return;
  }
  const c = await client.query('SELECT COUNT(*)::int AS n FROM product_images');
  if (c.rows[0].n > 0) {
    console.log(`${TAG} catalog data completion already applied (${c.rows[0].n} product images) — skipping.`);
    return;
  }
  let completionPath;
  try {
    completionPath = resolveSqlFile('catalog-images');
  } catch (_) {
    console.log(`${TAG} catalog-images.sql not found — skipping catalog data completion.`);
    return;
  }
  console.log(`${TAG} applying catalog data completion: ${completionPath}`);
  await client.query(fs.readFileSync(completionPath, 'utf8'));
  console.log(`${TAG} catalog data completion applied (images/compare/descriptions).`);
}

// One-time catalog price/name fixup: catalog-prices.sql re-prices all
// products from the v2 per-(type, size) ranges (the repo catalog was
// converted from the v1 CSV, whose prices were drawn from whole
// category ranges) and cleans wrong-attribute names/slugs. Guarded by
// the sentinel table catalog_fixups: the file is applied only when no
// 'prices-v2' row exists, and the file itself inserts that row inside
// the same transaction (the INSERT below is a defensive no-op for
// files that already carry it). A missing file skips, never aborts.
async function applyPriceFixup(client) {
  await client.query(
    'CREATE TABLE IF NOT EXISTS catalog_fixups (' +
    'name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const c = await client.query("SELECT COUNT(*)::int AS n FROM catalog_fixups WHERE name = 'prices-v2'");
  if (c.rows[0].n > 0) {
    console.log(`${TAG} catalog price fixup already applied (prices-v2) — skipping.`);
    return;
  }
  let fixupPath;
  try {
    fixupPath = resolveSqlFile('catalog-prices');
  } catch (_) {
    console.log(`${TAG} catalog-prices.sql not found — skipping catalog price fixup.`);
    return;
  }
  console.log(`${TAG} applying catalog price fixup: ${fixupPath}`);
  await client.query(fs.readFileSync(fixupPath, 'utf8'));
  await client.query("INSERT INTO catalog_fixups (name) VALUES ('prices-v2') ON CONFLICT (name) DO NOTHING");
  console.log(`${TAG} catalog price fixup applied (prices-v2: v2 per-type ranges + name cleanup).`);
}

// One-time guest-checkout schema fixup: guest-orders.sql makes
// orders.user_id nullable and adds the guest contact columns
// (guest_name / guest_phone / guest_city / guest_address) so an order
// can exist without a user account. Same sentinel pattern as the
// price fixup ('guest-orders-v1' in catalog_fixups); the file itself
// also inserts the sentinel inside its transaction. A missing file
// skips the step instead of aborting boot.
async function applyGuestOrdersFixup(client) {
  await client.query(
    'CREATE TABLE IF NOT EXISTS catalog_fixups (' +
    'name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const c = await client.query("SELECT COUNT(*)::int AS n FROM catalog_fixups WHERE name = 'guest-orders-v1'");
  if (c.rows[0].n > 0) {
    console.log(`${TAG} guest orders fixup already applied (guest-orders-v1) — skipping.`);
    return;
  }
  let fixupPath;
  try {
    fixupPath = resolveSqlFile('guest-orders');
  } catch (_) {
    console.log(`${TAG} guest-orders.sql not found — skipping guest orders fixup.`);
    return;
  }
  console.log(`${TAG} applying guest orders fixup: ${fixupPath}`);
  await client.query(fs.readFileSync(fixupPath, 'utf8'));
  await client.query("INSERT INTO catalog_fixups (name) VALUES ('guest-orders-v1') ON CONFLICT (name) DO NOTHING");
  console.log(`${TAG} guest orders fixup applied (guest-orders-v1: orders.user_id nullable + guest columns).`);
}

// One-time cleanup fixup: cancel-test-order.sql cancels the automated
// test guest order placed during live verification of guest checkout
// (parent + its per-seller sub-order) and restores the stock it took.
// Same sentinel pattern ('cancel-test-order-v1' in catalog_fixups);
// the file only touches those two order numbers while their status is
// still 'pending', so it can never cancel a real, progressed order.
// A missing file skips the step instead of aborting boot.
async function applyCancelTestOrderFixup(client) {
  await client.query(
    'CREATE TABLE IF NOT EXISTS catalog_fixups (' +
    'name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const c = await client.query("SELECT COUNT(*)::int AS n FROM catalog_fixups WHERE name = 'cancel-test-order-v1'");
  if (c.rows[0].n > 0) {
    console.log(`${TAG} cancel test order fixup already applied (cancel-test-order-v1) — skipping.`);
    return;
  }
  let fixupPath;
  try {
    fixupPath = resolveSqlFile('cancel-test-order');
  } catch (_) {
    console.log(`${TAG} cancel-test-order.sql not found — skipping cancel test order fixup.`);
    return;
  }
  console.log(`${TAG} applying cancel test order fixup: ${fixupPath}`);
  await client.query(fs.readFileSync(fixupPath, 'utf8'));
  await client.query("INSERT INTO catalog_fixups (name) VALUES ('cancel-test-order-v1') ON CONFLICT (name) DO NOTHING");
  console.log(`${TAG} cancel test order fixup applied (cancel-test-order-v1: automated test guest order cancelled, stock restored).`);
}

// One-time wishlist fixup: wishlist.sql guarantees the favourites
// table (the wishlist store) exists. The table has been part of
// schema.sql since the first schema, so this is a no-op CREATE on
// fresh DBs and a safety net for any DB that predates it. Same
// sentinel pattern ('wishlist-v1' in catalog_fixups); the file itself
// also inserts the sentinel inside its transaction. A missing file
// skips the step instead of aborting boot.
async function applyWishlistFixup(client) {
  await client.query(
    'CREATE TABLE IF NOT EXISTS catalog_fixups (' +
    'name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const c = await client.query("SELECT COUNT(*)::int AS n FROM catalog_fixups WHERE name = 'wishlist-v1'");
  if (c.rows[0].n > 0) {
    console.log(`${TAG} wishlist fixup already applied (wishlist-v1) — skipping.`);
    return;
  }
  let fixupPath;
  try {
    fixupPath = resolveSqlFile('wishlist');
  } catch (_) {
    console.log(`${TAG} wishlist.sql not found — skipping wishlist fixup.`);
    return;
  }
  console.log(`${TAG} applying wishlist fixup: ${fixupPath}`);
  await client.query(fs.readFileSync(fixupPath, 'utf8'));
  await client.query("INSERT INTO catalog_fixups (name) VALUES ('wishlist-v1') ON CONFLICT (name) DO NOTHING");
  console.log(`${TAG} wishlist fixup applied (wishlist-v1: favourites table guaranteed).`);
}

// One-time commission-range fixup: commission-range.sql widens the
// sellers.commission_rate CHECK from the original 50 cap to 0–100,
// the range the admin commission editor accepts. Same sentinel
// pattern ('commission-range-v1' in catalog_fixups); the file itself
// also inserts the sentinel inside its transaction. A missing file
// skips the step instead of aborting boot.
async function applyCommissionRangeFixup(client) {
  await client.query(
    'CREATE TABLE IF NOT EXISTS catalog_fixups (' +
    'name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const c = await client.query("SELECT COUNT(*)::int AS n FROM catalog_fixups WHERE name = 'commission-range-v1'");
  if (c.rows[0].n > 0) {
    console.log(`${TAG} commission range fixup already applied (commission-range-v1) — skipping.`);
    return;
  }
  let fixupPath;
  try {
    fixupPath = resolveSqlFile('commission-range');
  } catch (_) {
    console.log(`${TAG} commission-range.sql not found — skipping commission range fixup.`);
    return;
  }
  console.log(`${TAG} applying commission range fixup: ${fixupPath}`);
  await client.query(fs.readFileSync(fixupPath, 'utf8'));
  await client.query("INSERT INTO catalog_fixups (name) VALUES ('commission-range-v1') ON CONFLICT (name) DO NOTHING");
  console.log(`${TAG} commission range fixup applied (commission-range-v1: sellers.commission_rate CHECK widened to 0-100).`);
}

// One-time cart dedupe fixup: cart-dedupe.sql collapses duplicate
// carts per user (created by the old racy get-or-create, which had no
// uniqueness guarantee to lean on) into the oldest cart, merging item
// quantities per (product, variant) NULL-safely, and adds the guard
// indexes (one cart per user; one line per cart/product/variant with
// NULL variants coalesced) that services/carts.js relies on. Same
// sentinel pattern ('cart-dedupe-v1' in catalog_fixups); the file
// itself also inserts the sentinel inside its transaction. A missing
// file skips the step instead of aborting boot.
async function applyCartDedupeFixup(client) {
  await client.query(
    'CREATE TABLE IF NOT EXISTS catalog_fixups (' +
    'name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const c = await client.query("SELECT COUNT(*)::int AS n FROM catalog_fixups WHERE name = 'cart-dedupe-v1'");
  if (c.rows[0].n > 0) {
    console.log(`${TAG} cart dedupe fixup already applied (cart-dedupe-v1) — skipping.`);
    return;
  }
  let fixupPath;
  try {
    fixupPath = resolveSqlFile('cart-dedupe');
  } catch (_) {
    console.log(`${TAG} cart-dedupe.sql not found — skipping cart dedupe fixup.`);
    return;
  }
  console.log(`${TAG} applying cart dedupe fixup: ${fixupPath}`);
  await client.query(fs.readFileSync(fixupPath, 'utf8'));
  await client.query("INSERT INTO catalog_fixups (name) VALUES ('cart-dedupe-v1') ON CONFLICT (name) DO NOTHING");
  console.log(`${TAG} cart dedupe fixup applied (cart-dedupe-v1: duplicate carts merged, guard indexes added).`);
}

// One-time order payment backfill: order-payment-backfill.sql sets
// payment_method_code='cash_on_delivery' on orders created before
// the order service recorded the method (the signed-in checkout left
// it NULL, so those orders show an empty payment method in admin).
// The platform is COD-only, so no NULL can mean anything else. Same
// sentinel pattern ('order-payment-backfill-v1' in catalog_fixups);
// the file itself also inserts the sentinel inside its transaction.
// A missing file skips the step instead of aborting boot.
async function applyOrderPaymentBackfillFixup(client) {
  await client.query(
    'CREATE TABLE IF NOT EXISTS catalog_fixups (' +
    'name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const c = await client.query("SELECT COUNT(*)::int AS n FROM catalog_fixups WHERE name = 'order-payment-backfill-v1'");
  if (c.rows[0].n > 0) {
    console.log(`${TAG} order payment backfill already applied (order-payment-backfill-v1) — skipping.`);
    return;
  }
  let fixupPath;
  try {
    fixupPath = resolveSqlFile('order-payment-backfill');
  } catch (_) {
    console.log(`${TAG} order-payment-backfill.sql not found — skipping order payment backfill.`);
    return;
  }
  console.log(`${TAG} applying order payment backfill: ${fixupPath}`);
  await client.query(fs.readFileSync(fixupPath, 'utf8'));
  await client.query("INSERT INTO catalog_fixups (name) VALUES ('order-payment-backfill-v1') ON CONFLICT (name) DO NOTHING");
  console.log(`${TAG} order payment backfill applied (order-payment-backfill-v1: NULL payment_method_code set to cash_on_delivery).`);
}

// Admin promotion — runs on EVERY boot (deliberately NOT sentinel-
// gated): the store owner may register his account at any time, so
// each boot re-checks. If ADMIN_EMAIL is set and a user with that
// email (case-insensitive) exists with any other role, promote him to
// 'admin'. Idempotent and cheap (one indexed UPDATE). Any failure is
// logged and swallowed — promotion must never abort boot.
async function promoteAdmin(client) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim();
  if (!adminEmail) {
    console.log(`${TAG} admin promotion: ADMIN_EMAIL not set — skipping.`);
    return;
  }
  try {
    const upd = await client.query(
      "UPDATE users SET role = 'admin' WHERE lower(email) = lower($1) AND role <> 'admin'",
      [adminEmail]
    );
    if (upd.rowCount > 0) {
      console.log(`${TAG} admin promotion: user found, promoted (${upd.rowCount} row(s) updated).`);
      return;
    }
    const chk = await client.query(
      'SELECT role FROM users WHERE lower(email) = lower($1)',
      [adminEmail]
    );
    if (chk.rows.length === 0) {
      console.log(`${TAG} admin promotion: no user with ADMIN_EMAIL yet — will promote on a later boot once registered.`);
    } else {
      console.log(`${TAG} admin promotion: already admin — nothing to do.`);
    }
  } catch (err) {
    console.error(`${TAG} admin promotion failed (boot continues): ${err.message}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`${TAG} FAILED — aborting boot: ${err.message}`);
    process.exit(1);
  }
);
