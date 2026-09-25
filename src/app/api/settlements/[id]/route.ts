import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { notifySettlementVerified } from "@/lib/notifications";
import { traceError } from "@/lib/prisma-errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePageAccess("settlements");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const { id } = await params;
    const settlement = await prisma.settlement.findUnique({
      where: { id },
      include: {
        company: true,
        customer: true,
        engineer: true,
        collector: true,
        verifier: true,
      },
    });

    if (!settlement) {
      return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
    }

    return NextResponse.json(settlement);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch settlement" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verification is a finance/management action on the settlements page.
    const actor = await requirePageAccess("settlements");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" }, { status: authed ? 403 : 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.settlement.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "التسوية غير موجودة", code: "SETTLEMENT_NOT_FOUND" }, { status: 404 });
    }

    if (body.status === "VERIFIED") {
      if (!["GENERAL_MANAGER", "ACCOUNTANT", "COMPANY_MANAGER"].includes((actor as { role?: string }).role ?? "")) {
        return NextResponse.json({ error: "لا تملك صلاحية التحقق من التسويات", code: "FORBIDDEN" }, { status: 403 });
      }
      // Two-step rule: the collector cannot verify his own collection.
      if (existing.collectedBy === actor.id) {
        return NextResponse.json(
          { error: "لا يمكنك التحقق من تسوية قمت أنت بتحصيلها", code: "SELF_VERIFICATION_NOT_ALLOWED" },
          { status: 403 },
        );
      }
      if (existing.status === "VERIFIED") {
        return NextResponse.json({ error: "التسوية تم التحقق منها بالفعل", code: "ALREADY_VERIFIED" }, { status: 409 });
      }
    } else if (body.status && body.status !== "INITIAL") {
      return NextResponse.json({ error: "حالة غير صالحة", code: "INVALID_STATUS" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if ("status" in body) data.status = body.status;
    if ("reason" in body && !body.status) data.reason = body.reason;
    if (body.status === "VERIFIED") data.verifiedBy = actor.id;
    if ("direction" in body) {
      if (body.direction !== "ADDITION" && body.direction !== "SUBTRACTION") {
        return NextResponse.json({ error: "اتجاه غير صالح", code: "INVALID_DIRECTION" }, { status: 400 });
      }
      data.direction = body.direction;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات للتحديث", code: "NO_CHANGES" }, { status: 400 });
    }

    const verifyingNow = body.status === "VERIFIED" && existing.status !== "VERIFIED";

    const settlement = await prisma.$transaction(async (tx) => {
      const updated = await tx.settlement.update({
        where: { id },
        data,
        include: {
          company: true,
          customer: true,
          engineer: true,
          collector: true,
          verifier: true,
        },
      });

      // Post the settlement to the customer's balance the moment it is verified:
      // ADDITION = money collected (reduces their debt; any excess becomes money
      // under their account = رصيد تحت الحساب). SUBTRACTION = money given to the
      // customer (increases their debt).
      if (verifyingNow && updated.customerId) {
        const effect = updated.direction === "SUBTRACTION" ? updated.amount : -updated.amount;
        const debtBefore = await tx.customer.findUnique({
          where: { id: updated.customerId },
          select: { remainingDebt: true },
        });
        await tx.customer.update({
          where: { id: updated.customerId },
          data: { remainingDebt: (debtBefore?.remainingDebt ?? 0) + effect },
        });
        await tx.customerLedger.upsert({
          where: { customerId_companyId: { customerId: updated.customerId, companyId: updated.companyId } },
          update: { balance: { increment: effect } },
          create: { customerId: updated.customerId, companyId: updated.companyId, balance: effect },
        });
      }

      return updated;
    });

    if (settlement.status === "VERIFIED" && existing.status !== "VERIFIED") {
      void notifySettlementVerified({
        settlementId: settlement.id,
        settlementNumber: settlement.settlementNumber,
        collectedByUserId: settlement.collectedBy,
        verifierId: actor.id,
      }).catch(() => undefined);
    }

    return NextResponse.json(settlement);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update settlement" }, { status: traceError("[settlements:PUT] update failed", error) });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("settlements");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;
    const existing = await prisma.settlement.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
    if (existing.status === "VERIFIED") {
      return NextResponse.json({ error: "Cannot delete verified settlement" }, { status: 400 });
    }
    await prisma.settlement.delete({ where: { id } });
    return NextResponse.json({ message: "Deleted" });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
