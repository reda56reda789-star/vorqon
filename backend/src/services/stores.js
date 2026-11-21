// Store guarantee — every seller needs exactly one store row:
// products.store_id is a NOT NULL foreign key to stores, so a seller
// without a store cannot create products at all. Sellers who register
// through /api/auth/register get a seller row but no store; this
// helper creates the store on first use (seller approval in admin,
// or the seller's first product create/import), so the marketplace
// loop works for them exactly like it does for seeded sellers.
function slugBase(seller) {
  const raw = (seller.businessNameEn || seller.businessNameAr || 'store')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return raw || 'store';
}

async function ensureStore(prisma, seller) {
  const existing = await prisma.store.findUnique({ where: { sellerId: seller.id } });
  if (existing) return existing;
  const suffix = seller.id.replace(/-/g, '').slice(0, 8);
  const candidates = [`${slugBase(seller)}-${suffix}`, `store-${suffix}`];
  for (const slug of candidates) {
    try {
      return await prisma.store.create({
        data: {
          sellerId: seller.id, slug,
          nameAr: seller.businessNameAr, nameEn: seller.businessNameEn || seller.businessNameAr,
        },
      });
    } catch (e) {
      // Unique violation on slug — fall through to the next candidate.
      if (e && e.code === 'P2002') continue;
      throw e;
    }
  }
  // Both candidates taken (pathological): re-read in case a concurrent
  // request created the store meanwhile.
  return prisma.store.findUnique({ where: { sellerId: seller.id } });
}

module.exports = { ensureStore };
