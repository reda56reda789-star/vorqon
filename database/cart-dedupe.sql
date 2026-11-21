-- VORQON — دمج سلات المستخدمين المكررة (يُطبَّق مرة واحدة من bootstrap-db.js، محروس بصف catalog_fixups 'cart-dedupe-v1')
-- Cart dedupe: carts.user_id carried no uniqueness guarantee and the
-- old get-or-create was a racy check-then-insert, so a user could
-- accumulate several carts across sessions — and the code paths
-- disagreed about which one was "the" cart (cart endpoints took the
-- oldest, checkout took an arbitrary one), scattering items across
-- carts and defeating the per-cart merge. This fixup collapses every
-- user to exactly one cart (the oldest), merging item quantities per
-- (product, variant) with NULL-safe variant grouping, then adds the
-- two guard indexes the runtime relies on:
--   carts_one_per_user    — partial unique index: one cart per user.
--   cart_items_unique_line — expression unique index whose COALESCE
--                            makes NULL-variant lines unique too (the
--                            plain UNIQUE (cart_id, product_id,
--                            variant_id) cannot: NULLs are distinct).
-- Idempotent: a second run finds one cart per user and summed lines
-- already in place, and both indexes use IF NOT EXISTS. One
-- transaction throughout.
BEGIN;

CREATE TABLE IF NOT EXISTS catalog_fixups (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The keeper cart per user: the oldest (created_at, then id as a
-- deterministic tiebreak) — the same rule services/carts.js applies.
CREATE TEMP TABLE cart_keepers ON COMMIT DROP AS
SELECT DISTINCT ON (user_id) user_id, id AS keep_id
FROM carts
WHERE user_id IS NOT NULL
ORDER BY user_id, created_at ASC, id ASC;

-- Total quantity per (keeper cart, product, variant) across ALL of
-- the user's carts. GROUP BY treats NULL variants as one group,
-- which is exactly the NULL-safe line identity the merge needs.
CREATE TEMP TABLE cart_item_totals ON COMMIT DROP AS
SELECT k.keep_id AS cart_id, ci.product_id, ci.variant_id,
       SUM(ci.quantity)::int AS quantity
FROM cart_items ci
JOIN carts c ON c.id = ci.cart_id
JOIN cart_keepers k ON k.user_id = c.user_id
GROUP BY k.keep_id, ci.product_id, ci.variant_id;

-- Replace the items of every signed-in user's carts with the merged
-- totals on the keeper cart, then drop the duplicate carts (their
-- items are already gone, so the FK cascade has nothing to remove).
DELETE FROM cart_items
WHERE cart_id IN (SELECT id FROM carts WHERE user_id IS NOT NULL);

INSERT INTO cart_items (cart_id, product_id, variant_id, quantity)
SELECT cart_id, product_id, variant_id, quantity FROM cart_item_totals;

DELETE FROM carts
WHERE user_id IS NOT NULL
  AND id NOT IN (SELECT keep_id FROM cart_keepers);

CREATE UNIQUE INDEX IF NOT EXISTS carts_one_per_user
  ON carts (user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_unique_line
  ON cart_items (cart_id, product_id,
                 COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

INSERT INTO catalog_fixups (name) VALUES ('cart-dedupe-v1') ON CONFLICT (name) DO NOTHING;

COMMIT;
