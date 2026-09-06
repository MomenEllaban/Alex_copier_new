import { prisma } from "./prisma";
import type { PaymentStatus } from "@/generated/prisma/client";

// The `tx` inside $transaction is a PrismaClient minus some methods
type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Compute the effective total for a sales order after deducting approved returns.
 */
export async function getEffectiveTotal(
  tx: PrismaTx,
  orderId: string,
  orderTotal: number
): Promise<number> {
  const returns = await tx.returnTransaction.findMany({
    where: { salesOrderId: orderId, status: { in: ["APPROVED", "COMPLETED"] } },
    select: { total: true },
  });
  const totalReturns = returns.reduce((sum, r) => sum + r.total, 0);
  return Math.max(0, orderTotal - totalReturns);
}

/**
 * Compute the paymentStatus for a sales order based on:
 * - effectiveTotal (order total minus approved returns)
 * - paidAmount (accumulated cash + under-account credit)
 * - tradeInTotal (the value of machines handed over as trade-in, which is
 *   customer coverage toward the invoice the same way cash is)
 * - installment statuses (for INSTALLMENT/MIXED orders)
 *
 * Priority:
 *   1. PAID   → paidAmount + tradeInTotal >= effectiveTotal
 *   2. OVERDUE → any installment is OVERDUE and not fully paid
 *   3. PARTIAL → paidAmount + tradeInTotal > 0 and below effectiveTotal
 *   4. PENDING → nothing paid yet
 */
export async function computePaymentStatus(
  tx: PrismaTx,
  orderId: string
): Promise<PaymentStatus> {
  const order = await tx.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      total: true,
      paidAmount: true,
      tradeInTotal: true,
      paymentMethod: true,
      installments: {
        select: { status: true, amount: true, paidDate: true },
      },
    },
  });

  const effectiveTotal = await getEffectiveTotal(tx, orderId, order.total);
  const covered = Math.min(effectiveTotal, order.paidAmount + (order.tradeInTotal || 0));

  // If fully paid
  if (covered >= effectiveTotal && effectiveTotal > 0) {
    return "PAID";
  }

  // Check installment statuses for OVERDUE
  if (order.paymentMethod === "INSTALLMENT" || order.paymentMethod === "MIXED") {
    const hasOverdue = order.installments.some(
      (inst) => inst.status === "OVERDUE" && !inst.paidDate
    );
    if (hasOverdue) {
      return "OVERDUE";
    }
  }

  // Partial payment
  if (covered > 0 && covered < effectiveTotal) {
    return "PARTIAL";
  }

  return "PENDING";
}

/**
 * Recompute and persist paymentStatus for a single order.
 * Returns the new status.
 */
export async function recalculatePaymentStatus(
  tx: PrismaTx,
  orderId: string
): Promise<PaymentStatus> {
  const status = await computePaymentStatus(tx, orderId);
  await tx.salesOrder.update({
    where: { id: orderId },
    data: { paymentStatus: status },
  });
  return status;
}

/**
 * Recompute paymentStatus for ALL orders (for backfill / batch refresh).
 */
export async function recalculateAllPaymentStatuses(): Promise<{
  updated: number;
  statuses: Record<string, number>;
}> {
  const orders = await prisma.salesOrder.findMany({
    select: { id: true },
  });

  const statuses: Record<string, number> = {
    PENDING: 0,
    PARTIAL: 0,
    PAID: 0,
    OVERDUE: 0,
  };

  let updated = 0;
  for (const order of orders) {
    const status = await recalculatePaymentStatus(prisma, order.id);
    statuses[status]++;
    updated++;
  }

  return { updated, statuses };
}
