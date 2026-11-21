-- VORQON — إلغاء طلب الضيف الاختباري الآلي (يُطبَّق مرة واحدة من bootstrap-db.js، محروس بصف catalog_fixups 'cancel-test-order-v1')
-- Cancels the ONE automated test guest order placed by our own live
-- verification of guest checkout (parent VQ-2026-659036 + its per-
-- seller sub-order VQ-2026-659234, 1× black tea at 79 EGP, COD) and
-- restores the stock it decremented when it was created.
-- Safety: every statement is guarded by status = 'pending' and the
-- two exact order numbers, so a real order that has progressed (or
-- any other order) is never touched. Stock is restored BEFORE the
-- status flip, inside the same transaction, while the rows still
-- match the 'pending' guard — re-running the file is a no-op.
BEGIN;

CREATE TABLE IF NOT EXISTS catalog_fixups (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1) Restore stock / sold counts for the items of the two orders,
--    only while those orders are still pending.
UPDATE products p
SET stock_quantity = p.stock_quantity + oi.quantity,
    sold_count     = GREATEST(p.sold_count - oi.quantity, 0)
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE oi.product_id = p.id
  AND o.order_number IN ('VQ-2026-659036', 'VQ-2026-659234')
  AND o.status = 'pending';

-- 2) Cancel the parent and the sub-order, only if still pending.
UPDATE orders
SET status = 'cancelled'
WHERE order_number IN ('VQ-2026-659036', 'VQ-2026-659234')
  AND status = 'pending';

INSERT INTO catalog_fixups (name) VALUES ('cancel-test-order-v1') ON CONFLICT (name) DO NOTHING;

COMMIT;
