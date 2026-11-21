// Cart identity — exactly ONE cart per signed-in user, resolved the
// same way by every code path (cart GET/POST/PATCH/DELETE and order
// placement in routes/orders.js).
//
// Why this exists: carts.user_id carries no uniqueness guarantee in
// the original schema and the old get-or-create was a racy
// check-then-insert, so a user could accumulate several carts across
// sessions; worse, the paths disagreed about which one is "the" cart —
// routes/cart.js took the OLDEST cart while checkout took an arbitrary
// one (LIMIT 1 with no ORDER BY). Adds, the displayed cart, and the
// cart consumed by checkout could therefore be three different carts:
// adds appeared not to merge and orders inherited another cart's rows.
// The cart-dedupe-v1 bootstrap fixup collapses existing duplicates and
// adds the partial unique index carts_one_per_user; this service is
// the single resolution path on top of it.
//
// Resolution rule (deterministic): the user's OLDEST cart
// (created_at ASC, id ASC as tiebreak) is the cart. Creation is
// race-safe: the INSERT uses the partial unique index so concurrent
// creators collide into DO NOTHING instead of duplicating, and every
// caller finishes by re-reading the oldest cart, so all paths converge
// on the same id even if their insert lost the race.

async function findCartId(prisma, userId) {
  const rows = await prisma.$queryRaw`
    SELECT id FROM carts WHERE user_id = ${userId}::uuid
    ORDER BY created_at ASC, id ASC LIMIT 1`;
  return rows.length ? rows[0].id : null;
}

async function getOrCreateCartId(prisma, userId) {
  const existing = await findCartId(prisma, userId);
  if (existing) return existing;
  try {
    // Partial unique index carts_one_per_user (schema.sql +
    // cart-dedupe-v1 fixup): a concurrent creator turns this into a
    // no-op instead of a second cart.
    await prisma.$executeRaw`
      INSERT INTO carts (user_id) VALUES (${userId}::uuid)
      ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING`;
  } catch (_) {
    // Index not present (a dev DB that predates the fixup): fall back
    // to a plain insert; the re-read below still converges every
    // caller on the same oldest cart.
    try {
      await prisma.$executeRaw`INSERT INTO carts (user_id) VALUES (${userId}::uuid)`;
    } catch (_) { /* a concurrent insert may have won — re-read below */ }
  }
  return findCartId(prisma, userId);
}

module.exports = { findCartId, getOrCreateCartId };
