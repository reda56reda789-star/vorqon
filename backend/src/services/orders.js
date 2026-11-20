// Order splitting — one checkout, one parent order, one sub-order per seller.
// All writes happen inside a single Prisma transaction: if any sub-order
// fails, the whole checkout rolls back. Stock is decremented atomically.
const prisma = require('../utils/db');
const { rateFor, commissionFor } = require('./commissions');

let orderSeq = 0;
function orderNumber() {
  orderSeq += 1;
  const d = new Date();
  return `VQ-${d.getFullYear()}-${String(orderSeq).padStart(6, '0')}`;
}

/**
 * items: [{ productId, variantId?, quantity }] — already validated + priced.
 * Creates parent order (seller_id NULL) + children grouped by seller_id.
 * Returns { parent, children }.
 */
async function createOrderWithSplit({ userId, addressId, currency, exchangeRateUsed, items, couponCode }) {
  return prisma.$transaction(async (tx) => {
    // Group items by seller
    const bySeller = new Map();
    for (const it of items) {
      const p = await tx.product.findUnique({ where: { id: it.productId } });
      if (!p) throw new Error(`Product not found: ${it.productId}`);
      if (p.stockQuantity < it.quantity) throw new Error(`Out of stock: ${p.sku}`);
      if (!bySeller.has(p.sellerId)) bySeller.set(p.sellerId, []);
      bySeller.get(p.sellerId).push({ ...it, product: p });
    }

    const subtotal = items.reduce((s, it) => s + Number(it.unitPrice) * it.quantity, 0);
    const parent = await tx.order.create({
      data: {
        orderNumber: orderNumber(), userId, addressId, currency,
        exchangeRateUsed, subtotal, grandTotal: subtotal, couponCode: couponCode || null,
      },
    });

    const children = [];
    for (const [sellerId, sellerItems] of bySeller) {
      const childSubtotal = sellerItems.reduce((s, it) => s + Number(it.unitPrice) * it.quantity, 0);
      const child = await tx.order.create({
        data: {
          parentOrderId: parent.id, orderNumber: orderNumber(), userId, sellerId,
          addressId, currency, exchangeRateUsed, subtotal: childSubtotal, grandTotal: childSubtotal,
        },
      });
      for (const it of sellerItems) {
        const lineTotal = Number(it.unitPrice) * it.quantity;
        const rate = await rateFor(tx, sellerId, it.product.categoryId);
        await tx.orderItem.create({
          data: {
            orderId: child.id, productId: it.productId, variantId: it.variantId || null,
            sellerId, nameAr: it.product.nameAr, nameEn: it.product.nameEn,
            sku: it.product.sku, unitPrice: it.unitPrice, quantity: it.quantity,
            lineTotal, commissionRate: rate, commissionAmt: commissionFor(lineTotal, rate),
          },
        });
        await tx.product.update({
          where: { id: it.productId },
          data: { stockQuantity: { decrement: it.quantity }, soldCount: { increment: it.quantity } },
        });
      }
      children.push(child);
    }
    return { parent, children };
  });
}

module.exports = { createOrderWithSplit, orderNumber };
