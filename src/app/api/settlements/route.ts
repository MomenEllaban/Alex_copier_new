import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { notifySettlementPendingVerification } from "@/lib/notifications";
import { sanitizePaymentMethod } from "@/lib/payment-method";
import { traceError } from "@/lib/prisma-errors";

export async function GET() {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const settlements = await prisma.settlement.findMany({
      include: {
        company: true,
        customer: true,
        engineer: true,
        collector: true,
        verifier: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(settlements);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch settlements" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePageAccess("settlements");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" }, { status: authed ? 403 : 401 });
    }

    const body = await request.json();

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "المبلغ يجب أن يكون رقمًا أكبر من صفر", code: "AMOUNT_INVALID" }, { status: 400 });
    }
    if (!body.companyId || !body.reason || String(body.reason).trim() === "") {
      return NextResponse.json({ error: "الشركة والسبب مطلوبان", code: "SETTLEMENT_FIELDS_REQUIRED" }, { status: 400 });
    }
    const paymentMethod = sanitizePaymentMethod(body.paymentMethod);
    if (!paymentMethod) {
      return NextResponse.json({ error: "طريقة الدفع غير صالحة (كاش أو أجل فقط)", code: "PAYMENT_METHOD_INVALID" }, { status: 400 });
    }

    const direction = body.direction === "SUBTRACTION" ? "SUBTRACTION" : "ADDITION";
    if (body.direction && !["ADDITION", "SUBTRACTION"].includes(body.direction)) {
      return NextResponse.json({ error: "اتجاه التسوية غير صالح", code: "DIRECTION_INVALID" }, { status: 400 });
    }

    // The collector is whoever is creating the record unless stated otherwise.
    const collectedBy: string =
      typeof body.collectedBy === "string" && body.collectedBy !== "" ? body.collectedBy : actor.id;
    const collectorExists = await prisma.user.findUnique({ where: { id: collectedBy }, select: { id: true, name: true } });
    if (!collectorExists) {
      return NextResponse.json({ error: "المستخدم المُحصِّل غير موجود", code: "USER_NOT_FOUND" }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { id: body.companyId }, select: { id: true } });
    if (!company) {
      return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 400 });
    }
    if (body.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: body.customerId }, select: { id: true } });
      if (!customer) {
        return NextResponse.json({ error: "العميل غير موجود", code: "CUSTOMER_NOT_FOUND" }, { status: 400 });
      }
    }
    if (body.engineerId) {
      const engineer = await prisma.engineer.findUnique({ where: { id: body.engineerId }, select: { id: true } });
      if (!engineer) {
        return NextResponse.json({ error: "المهندس غير موجود", code: "ENGINEER_NOT_FOUND" }, { status: 400 });
      }
    }

    const settlementNumber = `STL-${Date.now()}`;

    const settlement = await prisma.settlement.create({
      data: {
        companyId: body.companyId,
        customerId: body.customerId || null,
        engineerId: body.engineerId || null,
        amount,
        paymentMethod,
        reason: body.reason,
        direction,
        status: "INITIAL",
        collectedBy,
        settlementNumber,
      },
      include: {
        company: true,
        customer: true,
        engineer: true,
        collector: true,
      },
    });

    // Business event: finance must review every new field collection.
    void notifySettlementPendingVerification({
      settlementId: settlement.id,
      settlementNumber: settlement.settlementNumber,
      amount: settlement.amount,
      collectorName: settlement.collector?.name ?? collectorExists.name,
      actorId: actor.id,
    }).catch(() => undefined);

    return NextResponse.json(settlement, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create settlement" }, { status: traceError("[settlements:POST] create failed", error) });
  }
}
