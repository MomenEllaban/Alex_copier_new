// Customer "money under account" (رصيد تحت الحساب) logic.
//
// The credit balance is encoded inside Customer.remainingDebt: a positive value
// means the customer owes us (مدين), a negative value means they have money
// deposited under their account (دائن) that offsets future invoices/collections.
// This file is the single source of truth for how a sales order's total is
// covered when such a credit exists.

export interface CreditSplit {
  creditUsed: number; // portion of the order total covered by under-account money
  cashUpfront: number; // upfront cash paid on top of the credit (non-CASH orders)
  paidAmount: number; // creditUsed + cashUpfront
  unpaid: number; // remainder left as debt (total - paidAmount)
}

/** Credit available under the customer's account (0 when they owe us, >= 0 when they deposited money). */
export function availableCredit(remainingDebt: number): number {
  return Math.max(0, -remainingDebt);
}

export const CREDIT_USED_PREFIX = "خصم من رصيد تحت الحساب";

export function creditUsedNote(orderId: string): string {
  return `${CREDIT_USED_PREFIX} — ${orderId}`;
}

export function isCreditUsedNote(notes: string | null | undefined): boolean {
  return Boolean(notes && notes.startsWith(CREDIT_USED_PREFIX));
}

/**
 * Split how an order `total` is covered when the customer has money under their
 * account, a trade-in value (قيمة الاستبدال), or both. The trade-in value
 * counts as customer coverage FIRST (they handed over an old machine as a
 * discount), then under-account credit, then any upfront cash.
 *
 * - CASH orders: the trade-in + credit + cash fully cover the total, so there
 *   is never any debt (paidAmount = total - tradeIn).
 * - CREDIT/INSTALLMENT/MIXED orders: trade-in and credit cover the first parts,
 *   an optional `upfrontPaid` cash covers the next part, and anything left
 *   becomes debt (unpaid).
 *
 * `paidAmount` still means money actually received (cash + under-account credit),
 * NOT the trade-in value; payment-status counts `tradeInTotal` separately.
 */
export function computeCreditSplit(
  total: number,
  remainingDebt: number,
  upfrontPaid: number,
  paymentMethod: string,
  tradeInPaid = 0,
): CreditSplit {
  const t = Math.max(0, total);
  const tradeIn = Math.min(Math.max(0, tradeInPaid), t);
  const afterTradeIn = t - tradeIn;
  const credit = availableCredit(remainingDebt);
  const creditUsed = Math.min(credit, afterTradeIn);

  if (paymentMethod === "CASH") {
    const cashUpfront = afterTradeIn - creditUsed;
    return { creditUsed, cashUpfront, paidAmount: creditUsed + cashUpfront, unpaid: 0 };
  }

  const cashUpfront = Math.min(Math.max(0, upfrontPaid), afterTradeIn - creditUsed);
  const paidAmount = creditUsed + cashUpfront;
  return { creditUsed, cashUpfront, paidAmount, unpaid: afterTradeIn - paidAmount };
}