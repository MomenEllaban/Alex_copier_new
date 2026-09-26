import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAction } from "@/lib/auth-helpers";
import { recalculatePaymentStatus } from "@/lib/payment-status";

/**
 * POST /api/sales/[id]/installments
 * Record payment for one or more installments.
 * Body: { installmentIds: string[], paidDate?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("sales", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const { id: orderId } = await params;
    const body = await request.json();
    const { installmentIds, paidDate } = body;

    if (!Array.isArray(installmentIds) || installmentIds.length === 0) {
      return NextResponse.json(
        { error: "اختر أقساطًا للدفع", code: "INSTALLMENT_IDS_REQUIRED" },
        { status: 400 }
      );
    }

    // Verify the order exists
    const order = await prisma.salesOrder.findUnique({
      where: { id: orderId },
      select: { id: true, paymentMethod: true },
    });

    if (!order) {
      return NextResponse.json(
        { error: "فاتورة البيع غير موجودة", code: "ORDER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const paymentDateTime = paidDate ? new Date(paidDate) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Mark installments as paid
      await tx.installment.updateMany({
        where: {
          id: { in: installmentIds },
          salesOrderId: orderId,
        },
        data: {
          status: "PAID",
          paidDate: paymentDateTime,
        },
      });

      // Calculate total amount of paid installments
      const paidInstallments = await tx.installment.findMany({
        where: {
          id: { in: installmentIds },
          salesOrderId: orderId,
        },
        select: { amount: true },
      });

      const paidAmount = paidInstallments.reduce((sum, inst) => sum + inst.amount, 0);

      // Fetch order for customer/company info
      const orderInfo = await tx.salesOrder.findUnique({
        where: { id: orderId },
        select: { customerId: true, companyId: true },
      });

      if (orderInfo) {
        // Decrement customer remaining debt
        const debtBefore = await tx.customer.findUnique({
          where: { id: orderInfo.customerId },
          select: { remainingDebt: true },
        });
        await tx.customer.update({
          where: { id: orderInfo.customerId },
          // No floor clamp: excess installment payment becomes credit under the
          // customer's account (رصيد تحت الحساب).
          data: { remainingDebt: (debtBefore?.remainingDebt ?? 0) - paidAmount },
        });

        // Update customer ledger
        await tx.customerLedger.upsert({
          where: { customerId_companyId: { customerId: orderInfo.customerId, companyId: orderInfo.companyId } },
          update: { balance: { decrement: paidAmount } },
          create: { customerId: orderInfo.customerId, companyId: orderInfo.companyId, balance: -paidAmount },
        });
      }

      // Increment paidAmount on the order
      await tx.salesOrder.update({
        where: { id: orderId },
        data: {
          paidAmount: { increment: paidAmount },
        },
      });

      // Recalculate payment status
      const newStatus = await recalculatePaymentStatus(tx, orderId);

      return { paidAmount, newStatus };
    });

    // Fetch updated order
    const updatedOrder = await prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        company: true,
        items: { include: { product: true, tradeInProduct: true } },
        installments: true,
      },
    });

    return NextResponse.json({
      message: "تم تسجيل الدفع بنجاح",
      paidAmount: result.paidAmount,
      paymentStatus: result.newStatus,
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Installment payment error:", error);
    return NextResponse.json(
      { error: "Failed to record installment payment" },
      { status: 500 }
    );
  }
}
