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
//   - Finally, a one-time price/name fixup runs exactly once, guarded
//     by the sentinel row catalog_fixups('prices-v2'):
//     catalog-prices.sql re-prices every product from the v2
//     per-(type, size) ranges and cleans wrong-attribute names. A
//     missing fixup file only skips the step, never aborts boot.
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

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`${TAG} FAILED — aborting boot: ${err.message}`);
    process.exit(1);
  }
);
