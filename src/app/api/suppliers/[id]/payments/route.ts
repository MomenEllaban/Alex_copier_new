import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePageAccess("suppliers");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const { id } = await params;
    const payments = await prisma.supplierPayment.findMany({
      where: { supplierId: id },
      orderBy: { paymentDate: "desc" },
      include: { company: { select: { id: true, name: true } } },
    });
    return NextResponse.json(payments);
  } catch (error) {
    console.error("[supplier-payments] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch supplier payments" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("suppliers", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const { id } = await params;
    const body = await request.json();
    const { amount, paymentDate, paymentMethod, docNumber, notes, companyId } = body;

    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0 || isNaN(paymentAmount)) {
      return NextResponse.json(
        { error: "المبلغ يجب أن يكون أكبر من صفر", code: "INVALID_AMOUNT" },
        { status: 400 }
      );
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!supplier) {
      return NextResponse.json({ error: "المورد غير موجود", code: "NOT_FOUND" }, { status: 404 });
    }

    const resolvedCompanyId = companyId || supplier.companyId;
    const payDate = paymentDate ? new Date(paymentDate) : new Date();

    const payment = await prisma.supplierPayment.create({
      data: {
        supplierId: id,
        companyId: resolvedCompanyId || null,
        amount: paymentAmount,
        paymentDate: payDate,
        paymentMethod: typeof paymentMethod === "string" ? paymentMethod.trim() : "CASH",
        docNumber: typeof docNumber === "string" ? docNumber.trim() : null,
        notes: typeof notes === "string" ? notes.trim() : null,
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("[supplier-payments] POST failed:", error);
    return NextResponse.json({ error: "Failed to record supplier payment" }, { status: 500 });
  }
}
