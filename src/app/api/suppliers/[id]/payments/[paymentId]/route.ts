import { withApiErrors } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAction } from "@/lib/auth-helpers";
import { traceError } from "@/lib/prisma-errors";

function authFailure(authed: unknown) {
  return NextResponse.json(
    { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
    { status: authed ? 403 : 401 },
  );
}

function purchasePaymentStatus(paidAmount: number, total: number): "PENDING" | "PARTIAL" | "PAID" {
  if (total > 0 && paidAmount >= total) return "PAID";
  if (paidAmount > 0) return "PARTIAL";
  return "PENDING";
}

async function loadPayment(paymentId: string, supplierId: string) {
  const payment = await prisma.supplierPayment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      supplierId: true,
      companyId: true,
      purchaseOrderId: true,
      amount: true,
      paymentDate: true,
      paymentMethod: true,
      docNumber: true,
      notes: true,
      purchaseOrder: { select: { id: true, total: true } },
    },
  });
  return payment && payment.supplierId === supplierId ? payment : null;
}

async function PUT__raw(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const actor = await requireAction("suppliers", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return authFailure(authed);
    }

    const { id, paymentId } = await params;
    const body = await request.json();
    const { amount, paymentDate, paymentMethod, docNumber, notes, companyId } = body;

    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return NextResponse.json(
        { error: "المبلغ يجب أن يكون أكبر من صفر", code: "INVALID_AMOUNT" },
        { status: 400 },
      );
    }

    const payment = await loadPayment(paymentId, id);
    if (!payment) {
      return NextResponse.json(
        { error: "الدفعة غير موجودة", code: "PAYMENT_NOT_FOUND" },
        { status: 404 },
      );
    }

    const purchaseTotal = Math.max(0, Number(payment.purchaseOrder?.total) || 0);
    if (payment.purchaseOrderId && paymentAmount > purchaseTotal + 0.001) {
      return NextResponse.json(
        {
          error: "المبلغ أكبر من إجمالي فاتورة الشراء المرتبطة",
          code: "EXCEEDS_INVOICE_TOTAL",
        },
        { status: 400 },
      );
    }

    const newCompanyId =
      companyId === undefined ? payment.companyId : companyId ? String(companyId) : null;
    if (newCompanyId && newCompanyId !== payment.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: newCompanyId },
        select: { id: true },
      });
      if (!company) {
        return NextResponse.json(
          { error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" },
          { status: 404 },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.supplierPayment.update({
        where: { id: paymentId },
        data: {
          amount: paymentAmount,
          paymentDate: paymentDate ? new Date(paymentDate) : payment.paymentDate,
          paymentMethod:
            typeof paymentMethod === "string" && paymentMethod.trim()
              ? paymentMethod.trim()
              : payment.paymentMethod,
          docNumber:
            docNumber === undefined
              ? payment.docNumber
              : typeof docNumber === "string" && docNumber.trim()
                ? docNumber.trim()
                : null,
          notes:
            notes === undefined
              ? payment.notes
              : typeof notes === "string" && notes.trim()
                ? notes.trim()
                : null,
          companyId: newCompanyId,
        },
        include: { company: { select: { id: true, name: true } } },
      });

      if (payment.purchaseOrderId) {
        await tx.purchaseOrder.update({
          where: { id: payment.purchaseOrderId },
          data: {
            paidAmount: paymentAmount,
            paymentStatus: purchasePaymentStatus(paymentAmount, purchaseTotal),
          },
        });
      }

      return record;
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update supplier payment" },
      { status: traceError("[supplier-payments:PUT] failed", error) },
    );
  }
}

async function DELETE__raw(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const actor = await requireAction("suppliers", "delete");
    if (!actor) {
      const authed = await requireAuth();
      return authFailure(authed);
    }

    const { id, paymentId } = await params;
    const payment = await loadPayment(paymentId, id);
    if (!payment) {
      return NextResponse.json(
        { error: "الدفعة غير موجودة", code: "PAYMENT_NOT_FOUND" },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.supplierPayment.delete({ where: { id: paymentId } });

      if (payment.purchaseOrderId) {
        await tx.purchaseOrder.update({
          where: { id: payment.purchaseOrderId },
          data: { paidAmount: 0, paymentStatus: "PENDING" },
        });
      }
    });

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json(
        { error: "الدفعة غير موجودة", code: "PAYMENT_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Failed to delete supplier payment" },
      { status: traceError("[supplier-payments:DELETE] failed", error) },
    );
  }
}

export const PUT = withApiErrors(PUT__raw);
export const DELETE = withApiErrors(DELETE__raw);
