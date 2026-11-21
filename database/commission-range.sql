-- VORQON — نطاق عمولة البائع (يُطبَّق مرة واحدة من bootstrap-db.js، محروس بصف catalog_fixups 'commission-range-v1')
-- Seller commission range: schema.sql originally capped
-- sellers.commission_rate at 50% (CHECK commission_rate <= 50). The
-- admin commission editor accepts 0–100, so the CHECK is widened to
-- match. Mirrors the final state of database/schema.sql so fresh and
-- upgraded DBs converge. Idempotent; runs in one transaction.
BEGIN;

CREATE TABLE IF NOT EXISTS catalog_fixups (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_commission_rate_check;
ALTER TABLE sellers ADD CONSTRAINT sellers_commission_rate_check
  CHECK (commission_rate >= 0 AND commission_rate <= 100);

INSERT INTO catalog_fixups (name) VALUES ('commission-range-v1') ON CONFLICT (name) DO NOTHING;

COMMIT;
