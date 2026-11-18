import { withApiErrors } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAction } from "@/lib/auth-helpers";
import {
  applyCustomerPaymentDelta,
  isLockedCustomerPayment,
  linkedOrderIdFromNotes,
  PaymentSyncError,
} from "@/lib/customer-payment-sync";
import { traceError } from "@/lib/prisma-errors";
import { ownEngineerId } from "@/lib/engineer-scope";

async function denyForeignCustomer(
  actor: { id?: string; role?: string } | null | undefined,
  customerId: string,
) {
  if ((actor as { role?: string })?.role !== "ENGINEER") return null;
  const mine = await ownEngineerId((actor as { id?: string })?.id);
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { engineerId: true },
  });
  if (!mine || customer?.engineerId !== mine) {
    return NextResponse.json(
      { error: "هذا العميل غير مسند إليك", code: "CUSTOMER_NOT_ASSIGNED" },
      { status: 403 },
    );
  }
  return null;
}

function authFailure(authed: unknown) {
  return NextResponse.json(
    { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
    { status: authed ? 403 : 401 },
  );
}

function syncFailure(error: unknown) {
  if (error instanceof PaymentSyncError) {
    return NextResponse.json(
      {
        error:
          error.code === "EXCEEDS_ORDER_LIMIT"
            ? "المبلغ أكبر من المتبقي على الفاتورة المرتبطة"
            : "تعذر تحديث الدفعة",
        code: error.code,
      },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: "Failed to update payment" },
    { status: traceError("[customer-payments:PUT] failed", error) },
  );
}

async function loadPayment(paymentId: string, customerId: string) {
  const payment = await prisma.customerPayment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      customerId: true,
      companyId: true,
      amount: true,
      paymentDate: true,
      notes: true,
    },
  });
  return payment && payment.customerId === customerId ? payment : null;
}

async function PUT__raw(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const actor = await requireAction("customers", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return authFailure(authed);
    }

    const { id, paymentId } = await params;
    const denied = await denyForeignCustomer(actor, id);
    if (denied) return denied;
    const body = await request.json();
    const { amount, paymentDate, notes, companyId } = body;

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
    if (isLockedCustomerPayment(payment.notes)) {
      return NextResponse.json(
        {
          error: "دفعة ناتجة عن رصيد تحت الحساب — تُدار من الفاتورة ولا يمكن تعديلها",
          code: "PAYMENT_LOCKED",
        },
        { status: 409 },
      );
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json(
        { error: "العميل غير موجود", code: "CUSTOMER_NOT_FOUND" },
        { status: 404 },
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

    const oldAmount = Number(payment.amount);
    const delta = paymentAmount - oldAmount;
    const newDate = paymentDate ? new Date(paymentDate) : payment.paymentDate;
    const newNotes =
      notes === undefined
        ? payment.notes
        : typeof notes === "string" && notes.trim()
          ? notes.trim()
          : null;
    const linkedOrderId = linkedOrderIdFromNotes(payment.notes);

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.customerPayment.update({
        where: { id: paymentId },
        data: {
          amount: paymentAmount,
          paymentDate: newDate,
          notes: newNotes,
          companyId: newCompanyId,
        },
        include: { company: { select: { id: true, name: true } } },
      });

      if (Math.abs(delta) > 0.001) {
        await tx.customer.update({
          where: { id },
          data: { remainingDebt: { increment: -delta } },
        });

        if (payment.companyId && newCompanyId === payment.companyId) {
          await tx.customerLedger.upsert({
            where: {
              customerId_companyId: { customerId: id, companyId: payment.companyId },
            },
            update: { balance: { decrement: delta } },
            create: { customerId: id, companyId: payment.companyId, balance: -delta },
          });
        } else {
          if (payment.companyId) {
            await tx.customerLedger.upsert({
              where: {
                customerId_companyId: { customerId: id, companyId: payment.companyId },
              },
              update: { balance: { increment: oldAmount } },
              create: { customerId: id, companyId: payment.companyId, balance: oldAmount },
            });
          }
          if (newCompanyId) {
            await tx.customerLedger.upsert({
              where: { customerId_companyId: { customerId: id, companyId: newCompanyId } },
              update: { balance: { decrement: paymentAmount } },
              create: {
                customerId: id,
                companyId: newCompanyId,
                balance: -paymentAmount,
              },
            });
          }
        }

        await applyCustomerPaymentDelta(tx, id, delta, linkedOrderId);
      }

      const latest = await tx.customerPayment.findFirst({
        where: { customerId: id },
        orderBy: { paymentDate: "desc" },
        select: { paymentDate: true },
      });
      await tx.customer.update({
        where: { id },
        data: { lastPaymentDate: latest?.paymentDate ?? null },
      });

      return record;
    });

    return NextResponse.json(updated);
  } catch (error) {
    return syncFailure(error);
  }
}

async function DELETE__raw(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const actor = await requireAction("customers", "delete");
    if (!actor) {
      const authed = await requireAuth();
      return authFailure(authed);
    }

    const { id, paymentId } = await params;
    const denied = await denyForeignCustomer(actor, id);
    if (denied) return denied;
    const payment = await loadPayment(paymentId, id);
    if (!payment) {
      return NextResponse.json(
        { error: "الدفعة غير موجودة", code: "PAYMENT_NOT_FOUND" },
        { status: 404 },
      );
    }
    if (isLockedCustomerPayment(payment.notes)) {
      return NextResponse.json(
        {
          error: "دفعة ناتجة عن رصيد تحت الحساب — تُدار من الفاتورة ولا يمكن حذفها",
          code: "PAYMENT_LOCKED",
        },
        { status: 409 },
      );
    }

    const amount = Number(payment.amount);
    const linkedOrderId = linkedOrderIdFromNotes(payment.notes);

    await prisma.$transaction(async (tx) => {
      await tx.customerPayment.delete({ where: { id: paymentId } });

      await tx.customer.update({
        where: { id },
        data: { remainingDebt: { increment: amount } },
      });

      if (payment.companyId) {
        await tx.customerLedger.upsert({
          where: {
            customerId_companyId: { customerId: id, companyId: payment.companyId },
          },
          update: { balance: { increment: amount } },
          create: { customerId: id, companyId: payment.companyId, balance: amount },
        });
      }

      await applyCustomerPaymentDelta(tx, id, -amount, linkedOrderId);

      const latest = await tx.customerPayment.findFirst({
        where: { customerId: id },
        orderBy: { paymentDate: "desc" },
        select: { paymentDate: true },
      });
      await tx.customer.update({
        where: { id },
        data: { lastPaymentDate: latest?.paymentDate ?? null },
      });
    });

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    if (error instanceof PaymentSyncError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json(
        { error: "الدفعة غير موجودة", code: "PAYMENT_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Failed to delete payment" },
      { status: traceError("[customer-payments:DELETE] failed", error) },
    );
  }
}

export const PUT = withApiErrors(PUT__raw);
export const DELETE = withApiErrors(DELETE__raw);
