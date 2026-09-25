import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { getEffectiveTotal, recalculatePaymentStatus } from "@/lib/payment-status";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePageAccess("customers");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const { id } = await params;
    const payments = await prisma.customerPayment.findMany({
      where: { customerId: id },
      orderBy: { paymentDate: "desc" },
      include: { company: { select: { id: true, name: true } } },
    });
    return NextResponse.json(payments);
  } catch {
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}

/**
 * Auto-distribute a payment amount across all of the customer's outstanding
 * (unpaid, non-cash) sales orders using FIFO by orderDate, regardless of the
 * company selected in the UI. This guarantees the payment always reduces the
 * customer's actual debt on the orders, so the owning company's financial
 * report reflects it immediately. Returns the primary company the payment
 * landed on (first order that absorbed it, or the provided company).
 */
async function distributeToOrders(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  customerId: string,
  preferredCompanyId: string | null,
  paymentAmount: number,
): Promise<{ applied: number; primaryCompanyId: string | null }> {
  const unpaidOrders = await tx.salesOrder.findMany({
    where: {
      customerId,
      paymentMethod: { not: "CASH" },
      paymentStatus: { notIn: ["PAID"] },
    },
    select: { id: true, total: true, paidAmount: true, companyId: true },
    orderBy: [{ orderDate: "asc" }, { createdAt: "asc" }],
  });

  let remaining = paymentAmount;
  let primaryCompanyId: string | null = preferredCompanyId;

  for (const order of unpaidOrders) {
    if (remaining <= 0) break;
    const effectiveTotal = await getEffectiveTotal(tx, order.id, order.total);
    const outstanding = effectiveTotal - order.paidAmount;
    if (outstanding <= 0) continue;

    const applied = Math.min(remaining, outstanding);
    remaining -= applied;

    await tx.salesOrder.update({
      where: { id: order.id },
      data: { paidAmount: { increment: applied } },
    });

    await recalculatePaymentStatus(tx, order.id);

    // Pick the company of the first order that absorbed the payment when the
    // user did not pick one, so the payment record can be attributed.
    if (!primaryCompanyId) primaryCompanyId = order.companyId;
  }

  return { applied: paymentAmount - remaining, primaryCompanyId };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("customers");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const { id } = await params;
    const body = await request.json();
    const { amount, paymentDate, notes, companyId } = body;

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "المبلغ يجب أن يكون أكبر من صفر", code: "INVALID_AMOUNT" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود", code: "NOT_FOUND" }, { status: 404 });
    }

    if (companyId) {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) {
        return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 404 });
      }
    }

    const paymentAmount = Number(amount);
    // No floor clamp: any payment beyond the outstanding debt becomes money
    // under the customer's account (رصيد تحت الحساب) instead of being lost.
    const newRemaining = customer.remainingDebt - paymentAmount;
    const payDate = paymentDate ? new Date(paymentDate) : new Date();

    const payment = await prisma.$transaction(async (tx) => {
      // 1. Auto-distribute the payment across the customer's outstanding orders
      //    (FIFO by date). This updates each order's paidAmount + paymentStatus
      //    so every owning company's financial report reflects it immediately.
      const { applied, primaryCompanyId } = await distributeToOrders(
        tx, id, companyId || null, paymentAmount,
      );
      // The company the payment is attributed to: the user's selection if given,
      // otherwise the first order that absorbed the payment.
      const resolvedCompanyId = companyId || primaryCompanyId;

      // 2. Update customer remaining debt
      await tx.customer.update({
        where: { id },
        data: {
          remainingDebt: newRemaining,
          lastPaymentDate: payDate,
        },
      });

      // 3. Update customer ledger for the resolved company
      if (resolvedCompanyId) {
        await tx.customerLedger.upsert({
          where: { customerId_companyId: { customerId: id, companyId: resolvedCompanyId } },
          update: { balance: { decrement: paymentAmount } },
          create: { customerId: id, companyId: resolvedCompanyId, balance: -paymentAmount },
        });
      }

      // 4. Record the payment attributed to the resolved company.
      const record = await tx.customerPayment.create({
        data: {
          customerId: id,
          companyId: resolvedCompanyId || null,
          amount: paymentAmount,
          paymentDate: payDate,
          notes: notes || null,
        },
      });

      // Expose how much was actually applied to orders for transparency
      (record as Record<string, unknown>)._distributedToOrders =
        applied < paymentAmount - 0.001;

      return record;
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("[customer-payments] POST failed:", error);
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
}
