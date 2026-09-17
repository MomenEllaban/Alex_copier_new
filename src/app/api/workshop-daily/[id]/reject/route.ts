import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth-helpers";

const FINANCE_ROLES = ["ACCOUNTANT", "GENERAL_MANAGER", "COMPANY_MANAGER"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRole(...FINANCE_ROLES);
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: "الرفض للمحاسب أو المدير فقط", code: "REJECT_FORBIDDEN" },
        { status: authed ? 403 : 401 },
      );
    }
    const actorId = (actor as { id?: string }).id ?? "";
    const { id } = await params;

    const tx = await prisma.workshopTransaction.findUnique({
      where: { id },
      include: { book: true },
    });
    if (!tx) {
      return NextResponse.json({ error: "الحركة غير موجودة", code: "WORKSHOP_TX_NOT_FOUND" }, { status: 404 });
    }
    if (tx.status !== "PENDING") {
      return NextResponse.json({ error: "هذه الحركة تم التعامل معها من قبل", code: "ALREADY_HANDLED" }, { status: 409 });
    }
    if (tx.book.status !== "OPEN") {
      return NextResponse.json({ error: "اليوم مقفول — لا يمكن الرفض", code: "BOOK_CLOSED" }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const rejectReason = typeof body.rejectReason === "string" ? body.rejectReason.trim() : "";
    if (!rejectReason) {
      return NextResponse.json({ error: "سبب الرفض مطلوب", code: "REJECT_REASON_REQUIRED" }, { status: 400 });
    }

    const updated = await prisma.workshopTransaction.update({
      where: { id },
      data: { status: "REJECTED", confirmedBy: actorId, confirmedAt: new Date(), rejectReason },
      include: { category: { select: { id: true, name: true } } },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to reject transaction" }, { status: 500 });
  }
}
