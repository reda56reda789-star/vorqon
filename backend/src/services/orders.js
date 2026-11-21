// Order splitting — one checkout, one parent order, one sub-order per seller.
// All writes happen inside a single Prisma transaction: if any sub-order
// fails, the whole checkout rolls back. Stock is decremented atomically.
const prisma = require('../utils/db');
const { rateFor, commissionFor } = require('./commissions');

let orderSeq = 0;
function orderNumber() {
  orderSeq += 1;
  const d = new Date();
  // The numeric part mixes the boot-relative counter with the current
  // time so numbers stay unique across process restarts (a plain
  // counter would restart at VQ-YYYY-000001 after every deploy and hit
  // the UNIQUE constraint on order_number).
  const n = ((Date.now() % 900000) + orderSeq) % 900000 + 100000;
  return `VQ-${d.getFullYear()}-${String(n).padStart(6, '0')}`;
}

/**
 * items: [{ productId, variantId?, quantity }] — already validated + priced.
 * Creates parent order (seller_id NULL) + children grouped by seller_id.
 * userId may be null for guest checkout; then `guest`
 * ({ name, phone, city, address }) is recorded on parent + children.
 * paymentMethodCode / paymentStatus are recorded when supplied (guest
 * COD passes 'cod' / 'cash_on_delivery'); the signed-in flow omits
 * them and keeps the column defaults, exactly as before.
 * Returns { parent, children }.
 */
async function createOrderWithSplit({ userId, addressId, currency, exchangeRateUsed, items, couponCode, guest, notes, paymentMethodCode, paymentStatus }) {
  const guestFields = guest ? {
    guestName: guest.name, guestPhone: guest.phone,
    guestCity: guest.city, guestAddress: guest.address,
  } : {};
  const paymentFields = {
    ...(paymentMethodCode ? { paymentMethodCode } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
  };
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
        orderNumber: orderNumber(), userId: userId || null, addressId, currency,
        exchangeRateUsed, subtotal, grandTotal: subtotal, couponCode: couponCode || null,
        notes: notes || null, ...guestFields, ...paymentFields,
      },
    });

    const children = [];
    for (const [sellerId, sellerItems] of bySeller) {
      const childSubtotal = sellerItems.reduce((s, it) => s + Number(it.unitPrice) * it.quantity, 0);
      const child = await tx.order.create({
        data: {
          parentOrderId: parent.id, orderNumber: orderNumber(), userId: userId || null, sellerId,
          addressId, currency, exchangeRateUsed, subtotal: childSubtotal, grandTotal: childSubtotal,
          notes: notes || null, ...guestFields, ...paymentFields,
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
