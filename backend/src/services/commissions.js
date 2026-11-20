// Commission service — per-seller default rate, overridable per category.
// commission = line_total * rate%. Recorded on order_items at order time so
// later rate changes never rewrite history.
async function rateFor(prisma, sellerId, categoryId) {
  const byCategory = categoryId ? await prisma.$queryRaw`
    SELECT rate_percent FROM commissions
    WHERE seller_id = ${sellerId}::uuid AND category_id = ${categoryId}::uuid
    ORDER BY effective_from DESC LIMIT 1` : [];
  if (byCategory.length) return Number(byCategory[0].rate_percent);
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  return seller ? Number(seller.commissionRate) : 5.0;
}

function commissionFor(lineTotal, ratePercent) {
  return Number((Number(lineTotal) * Number(ratePercent) / 100).toFixed(2));
}

module.exports = { rateFor, commissionFor };
