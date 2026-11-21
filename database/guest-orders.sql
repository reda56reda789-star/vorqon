-- VORQON — طلبات الضيوف (يُطبَّق مرة واحدة من bootstrap-db.js، محروس بصف catalog_fixups 'guest-orders-v1')
-- Guest checkout: orders must be able to exist without a user account.
-- Makes orders.user_id nullable and adds the guest contact columns
-- (guest_name / guest_phone / guest_city / guest_address). Mirrors the
-- final state of database/schema.sql so fresh and upgraded DBs converge.
-- Every statement is idempotent; the whole file runs in one transaction.
BEGIN;

CREATE TABLE IF NOT EXISTS catalog_fixups (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_name    VARCHAR(200);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_phone   VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_city    VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_address TEXT;

INSERT INTO catalog_fixups (name) VALUES ('guest-orders-v1') ON CONFLICT (name) DO NOTHING;

COMMIT;
