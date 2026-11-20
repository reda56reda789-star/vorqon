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
//     initialised and nothing is applied.
//   - Otherwise applies schema.sql, then catalog-repo.sql. Both files
//     are idempotent (CREATE ... IF NOT EXISTS / ON CONFLICT DO
//     NOTHING; the catalog is a single transaction), so re-running on
//     a partially initialised DB never duplicates data.
//   - Any failure exits 1, which stops the `&&` boot chain with a clear
//     [db-bootstrap] error in the log instead of serving a broken API.
const fs = require('fs');
const path = require('path');

const TAG = '[db-bootstrap]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Locate an SQL file: DB_SQL_DIR override -> Docker image layout
// (<backend>/db/) -> repo layout (running from backend/src in the repo).
function resolveSqlFile(kind) {
  const fileName = kind === 'schema' ? 'schema.sql' : 'catalog-repo.sql';
  const candidates = [];
  if (process.env.DB_SQL_DIR) candidates.push(path.join(process.env.DB_SQL_DIR, fileName));
  candidates.push(path.join(__dirname, '..', 'db', fileName));
  candidates.push(kind === 'schema'
    ? path.join(__dirname, '..', '..', 'database', 'schema.sql')
    : path.join(__dirname, '..', '..', 'catalog-10000', 'catalog-repo.sql'));
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
      return;
    }

    const schemaPath = resolveSqlFile('schema');
    console.log(`${TAG} applying schema: ${schemaPath}`);
    await client.query(fs.readFileSync(schemaPath, 'utf8'));
    console.log(`${TAG} schema applied.`);

    const catalogPath = resolveSqlFile('catalog');
    console.log(`${TAG} applying catalog: ${catalogPath}`);
    await client.query(fs.readFileSync(catalogPath, 'utf8'));

    const after = await client.query('SELECT COUNT(*)::int AS n FROM products');
    console.log(`${TAG} catalog applied. products now: ${after.rows[0].n}`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`${TAG} FAILED — aborting boot: ${err.message}`);
    process.exit(1);
  }
);
