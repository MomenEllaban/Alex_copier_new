import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { calcTotals, getWorkshopCompany } from "@/lib/workshop-daily";

export async function POST(request: Request) {
  try {
    const actor = await requirePageAccess("workshopDaily");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }
    const actorId = (actor as { id?: string }).id ?? "";

    const company = await getWorkshopCompany();
    if (!company) {
      return NextResponse.json({ error: "شركة القطاعى غير موجودة", code: "WORKSHOP_COMPANY_NOT_FOUND" }, { status: 500 });
    }

    const book = await prisma.workshopDailyBook.findFirst({
      where: { companyId: company.id, status: "OPEN" },
      include: { transactions: true },
    });
    if (!book) {
      return NextResponse.json({ error: "لا يوجد يوم مفتوح", code: "NO_OPEN_DAY" }, { status: 404 });
    }

    const pending = book.transactions.filter((t) => t.status === "PENDING");
    if (pending.length > 0) {
      return NextResponse.json(
        { error: `يوجد ${pending.length} حركات معلقة — أكّدها أو ارفضها أولاً`, code: "PENDING_EXIST", pendingCount: pending.length },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const handoverTo = typeof body.handoverTo === "string" ? body.handoverTo.trim() : "";
    const handoverNote = typeof body.handoverNote === "string" ? body.handoverNote.trim() : "";
    if (!handoverTo) {
      return NextResponse.json({ error: "جهة التسليم مطلوبة", code: "HANDOVER_TO_REQUIRED" }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 11c - تقفيل الخزنة اليومي مع الجرد الفعلي والمسوِّغ الإجباري
    //  • bookBalance  = رصيد الدفاتر (مجموع وارد - صادر بعد التأكيدات)
    //  • actualBalance= الرصيد الفعلي (جرد أمين الخزنة)
    //  • variance     = actualBalance - bookBalance (عجز سالب / زيادة موجب)
    //  • عند وجود عجز أو زيادة يجب إرفاق مسوِّغ إجباري (varianceNote)
    //                              (عجز مطابق العدد 0 = لا مسوِّغ مطلوب)
    // ═══════════════════════════════════════════════════════════════
    const totals = calcTotals(book.transactions);
    const bookBalance = totals.remaining;
    const rawActual = Number(body.actualBalance);
    const actualBalance = Number.isFinite(rawActual) ? rawActual : bookBalance; // افتراض التطابق إن لم يُرسل جرد
    const variance = Math.round((actualBalance - bookBalance) * 100) / 100;
    const varianceType =
      Math.abs(variance) < 0.005 ? "MATCH" : variance > 0 ? "SURPLUS" : "DEFICIT";
    const varianceNoteRaw = typeof body.varianceNote === "string" ? body.varianceNote.trim() : "";
    if (varianceType !== "MATCH" && !varianceNoteRaw) {
      return NextResponse.json(
        { error: "عند وجود عجز أو زيادة يجب توضيح المسوِّغ/سبب الفرق", code: "VARIANCE_NOTE_REQUIRED" },
        { status: 400 },
      );
    }

    // الرصيد الافتتاحي ليوم الغد = رصيد هذا اليوم؛ يُقرأ لأجل التقارير المتراكمة بالفعل هنا
    const closed = await prisma.workshopDailyBook.update({
      where: { id: book.id },
      data: {
        status: "CLOSED",
        closedBy: actorId,
        closedAt: new Date(),
        bookBalance,
        actualBalance,
        variance,
        varianceType,
        varianceNote: varianceType === "MATCH" ? null : varianceNoteRaw,
        handoverAmount: bookBalance,
        handoverTo,
        handoverNote: handoverNote || null,
      },
    });

    return NextResponse.json({
      ...closed,
      totals: { ...totals, bookBalance, actualBalance, variance, varianceType },
      openingBalanceForNextDay: bookBalance,
    });
  } catch {
    return NextResponse.json({ error: "Failed to close day" }, { status: 500 });
  }
}
