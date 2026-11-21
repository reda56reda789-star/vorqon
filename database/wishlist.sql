-- VORQON — قائمة المفضلة (يُطبَّق مرة واحدة من bootstrap-db.js، محروس بصف catalog_fixups 'wishlist-v1')
-- Wishlist: the favourites table has been part of database/schema.sql
-- since the first schema, so fresh DBs already have it. This fixup
-- guarantees it on any DB that predates or skipped the full schema,
-- so the wishlist endpoints (GET/POST/DELETE /api/wishlist) can rely
-- on the table existing. Idempotent; runs in one transaction.
BEGIN;

CREATE TABLE IF NOT EXISTS catalog_fixups (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS favourites (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

INSERT INTO catalog_fixups (name) VALUES ('wishlist-v1') ON CONFLICT (name) DO NOTHING;

COMMIT;
