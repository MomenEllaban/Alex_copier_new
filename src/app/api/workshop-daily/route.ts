import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { calcTotals, dayKey, getWorkshopCompany, startOfDay } from "@/lib/workshop-daily";

const WORKSHOP_CATEGORY_NAME = "يومية الورشة";

// `createdBy`/`confirmedBy` are scalar user-id columns, not relations, so they
// cannot appear here — include only accepts relation fields. The caller maps
// those ids to names with `userName` below.
const TX_INCLUDE = {
  category: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
} as const;

async function guard() {
  const actor = await requirePageAccess("workshopDaily");
  if (actor) return { actor };
  const authed = await requireAuth();
  return {
    actor: null,
    response: NextResponse.json(
      { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
      { status: authed ? 403 : 401 },
    ),
  };
}

export async function GET() {
  try {
    const { actor, response } = await guard();
    if (!actor && response) return response;

    const company = await getWorkshopCompany();
    if (!company) {
      return NextResponse.json({ error: "شركة القطاعى غير موجودة", code: "WORKSHOP_COMPANY_NOT_FOUND" }, { status: 500 });
    }

    const book = await prisma.workshopDailyBook.findFirst({
      where: { companyId: company.id, status: "OPEN" },
      include: { transactions: { include: TX_INCLUDE, orderBy: { createdAt: "desc" } } },
    });

    const userIds = new Set<string>();
    if (book) {
      userIds.add(book.openedBy);
      for (const t of book.transactions) {
        userIds.add(t.createdBy);
        if (t.confirmedBy) userIds.add(t.confirmedBy);
      }
    }
    const users = userIds.size
      ? await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
      : [];
    const userName = new Map(users.map((u) => [u.id, u.name]));

    const closedBooks = await prisma.workshopDailyBook.findMany({
      where: { companyId: company.id, status: "CLOSED" },
      include: { transactions: { select: { direction: true, amount: true, status: true } } },
      orderBy: { bookDate: "desc" },
      take: 10,
    });

    return NextResponse.json({
      company,
      book: book
        ? {
            ...book,
            openedByName: userName.get(book.openedBy) ?? null,
            isOldDay: dayKey(book.bookDate) !== dayKey(new Date()),
            totals: calcTotals(book.transactions),
            transactions: book.transactions.map((t) => ({
              ...t,
              createdByName: userName.get(t.createdBy) ?? null,
              confirmedByName: t.confirmedBy ? (userName.get(t.confirmedBy) ?? null) : null,
              customerName: t.customer?.name ?? null,
            })),
          }
        : null,
      closedBooks: closedBooks.map((b) => ({
        id: b.id,
        bookDate: b.bookDate,
        closedAt: b.closedAt,
        handoverAmount: b.handoverAmount,
        handoverTo: b.handoverTo,
        totals: calcTotals(b.transactions),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch workshop daily book" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { actor, response } = await guard();
    if (!actor && response) return response;
    const actorId = (actor as { id?: string }).id ?? "";

    const company = await getWorkshopCompany();
    if (!company) {
      return NextResponse.json({ error: "شركة القطاعى غير موجودة", code: "WORKSHOP_COMPANY_NOT_FOUND" }, { status: 500 });
    }

    const body = await request.json();
    const direction = body.direction === "IN" ? "IN" : body.direction === "OUT" ? "OUT" : null;
    const amount = Number(body.amount);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!direction) {
      return NextResponse.json({ error: "نوع الحركة مطلوب (وارد أو صادر)", code: "DIRECTION_REQUIRED" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "المبلغ يجب أن يكون رقمًا أكبر من صفر", code: "AMOUNT_INVALID" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "البيان مطلوب", code: "REASON_REQUIRED" }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 11b - إلزامية تصنيف الوارد (لا يمكن حفظ وارد بدون تصنيف)
    // الحركة الواردة (IN) يجب أن تُصنَّف: خدمة ورشة / تحصيل نقدية / إيرادات اخرى
    // — وذلك ليُرحَّل بشكل تلقائي للحساب المحاسبي الصحيح حسب النوع
    // ═══════════════════════════════════════════════════════════
    const revenueType =
      direction === "OUT"
        ? null
        : body.revenueType === "SERVICE_REVENUE"
          ? "SERVICE_REVENUE"
          : body.revenueType === "CASH_COLLECTION"
            ? "CASH_COLLECTION"
            : body.revenueType === "OTHER_INCOME"
              ? "OTHER_INCOME"
              : null     ;
    if (direction === "IN" && !revenueType) {
      return NextResponse.json(
        { error: "تصنيف الوارد مطلوب (خدمة ورشة / تحصيل نقدية / إيرادات أخرى)", code: "REVENUE_TYPE_REQUIRED" },
        { status: 400 },
      );
    }
    if (direction === "OUT" && revenueType) {
      return NextResponse.json(
        { error: "تصنيف الوارد يُحدد فقط لحركات الوارد", code: "REVENUE_TYPE_NOT_ALLOWED_ON_OUT" },
        { status: 400 },
      );
    }
    const customerId = typeof body.customerId === "string" && body.customerId.trim() !== "" ? body.customerId.trim() : null;
    if (revenueType === "CASH_COLLECTION" && !customerId) {
      return NextResponse.json(
        { error: "حركة تحصيل نقدية تتطلب اختيار العميل المرتبط بالمديونية", code: "CASH_COLLECTION_CUSTOMER_REQUIRED" },
        { status: 400 },
      );
    }

    // The workshop daily form no longer asks for an expense category.
    // OUT entries are auto-assigned to the workshop's own category so the
    // accountant can confirm without extra input.
    let category = direction === "OUT" ? await prisma.expenseCategory.findFirst({
      where: { companyId: company.id, name: WORKSHOP_CATEGORY_NAME },
    }) : null;
    if (direction === "OUT" && !category) {
      category = await prisma.expenseCategory.create({
        data: { name: WORKSHOP_CATEGORY_NAME, companyId: company.id },
      });
    }

    let book = await prisma.workshopDailyBook.findFirst({
      where: { companyId: company.id, status: "OPEN" },
    });
    if (book && dayKey(book.bookDate) !== dayKey(new Date())) {
      return NextResponse.json(
        { error: "يوجد يوم مفتوح بتاريخ سابق — اقفل اليوم السابق أولاً", code: "PREVIOUS_DAY_OPEN" },
        { status: 409 },
      );
    }
    if (!book) {
      book = await prisma.workshopDailyBook.create({
        data: { companyId: company.id, bookDate: startOfDay(new Date()), openedBy: actorId },
      });
    }

    const tx = await prisma.workshopTransaction.create({
      data: {
        bookId: book.id,
        companyId: company.id,
        direction,
        amount,
        revenueType,
        customerId,
        categoryId: category?.id ?? null,
        reason,
        createdBy: actorId,
      },
      include: TX_INCLUDE,
    });

    return NextResponse.json(
      { ...tx, bookDate: book.bookDate, pendingHint: true },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Failed to add transaction" }, { status: 500 });
  }
}
