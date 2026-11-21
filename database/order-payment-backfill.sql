-- VORQON — تعبئة وسيلة الدفع للطلبات القديمة (يُطبَّق مرة واحدة من bootstrap-db.js، محروس بصف catalog_fixups 'order-payment-backfill-v1')
-- Order payment-method backfill: the signed-in checkout never set
-- orders.payment_method_code (the order service only recorded it when
-- a caller supplied it, and only the guest path did), so registered
-- customers' orders show an empty payment method in the admin list.
-- The platform is cash-on-delivery only in this build — no other
-- method can exist — so every NULL is unambiguously COD. The order
-- service now defaults the code at creation; this backfill repairs
-- the rows that already exist. Idempotent; one transaction.
BEGIN;

CREATE TABLE IF NOT EXISTS catalog_fixups (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

UPDATE orders
SET payment_method_code = 'cash_on_delivery'
WHERE payment_method_code IS NULL;

INSERT INTO catalog_fixups (name) VALUES ('order-payment-backfill-v1') ON CONFLICT (name) DO NOTHING;

COMMIT;
