import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAction, type ActionKey } from "@/lib/auth-helpers";
import {
  calcTotals,
  dayKey,
  decorateTransactions,
  endOfDay,
  getWorkshopCompany,
  parseDayInput,
  startOfDay,
  addDays,
  weekIndexOf,
  weekStart,
  WEEK_DAYS,
} from "@/lib/workshop-daily";

// `createdBy`/`confirmedBy` are scalar user-id columns, not relations, so they
// cannot appear here — include only accepts relation fields. The caller maps
// those ids to names with `userName` below.
const TX_INCLUDE = {
  category: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
} as const;

/** A day in the log: its totals, and whether it is still open. */
function dayRow(book: {
  id: string;
  bookDate: Date;
  status: string;
  closedAt: Date | null;
  handoverAmount: number | null;
  handoverTo: string | null;
  transactions: Array<{ direction: "IN" | "OUT"; amount: number; status: string }>;
}) {
  return {
    id: book.id,
    bookDate: book.bookDate,
    status: book.status,
    closedAt: book.closedAt,
    handoverAmount: book.handoverAmount,
    handoverTo: book.handoverTo,
    totals: calcTotals(book.transactions),
  };
}

/** GET passes "view" and POST passes "add", so the verb's action is a parameter. */
async function guard(action: ActionKey) {
  const actor = await requireAction("workshopDaily", action);
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

export async function GET(request: Request) {
  try {
    const { actor, response } = await guard("view");
    if (!actor && response) return response;

    const company = await getWorkshopCompany();
    if (!company) {
      return NextResponse.json({ error: "شركة القطاعى غير موجودة", code: "WORKSHOP_COMPANY_NOT_FOUND" }, { status: 500 });
    }

    const today = startOfDay(new Date());

    // The open day the page works on: today's book when it exists, otherwise
    // the most recent open book from before today (the "you forgot to close
    // yesterday" case, which the page warns about).
    const book = await prisma.workshopDailyBook.findFirst({
      where: { companyId: company.id, status: "OPEN", bookDate: { lte: today } },
      include: { transactions: { include: TX_INCLUDE, orderBy: { createdAt: "desc" } } },
      orderBy: { bookDate: "desc" },
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

    // ── سجل الأيام: باجينيشن بالأسبوع (السبت → الخميس) ────────────────────
    // The log pages by the workshop week, not by a fixed number of days: week
    // 1 is the week of today and every older week follows it.
    const currentWeekStart = weekStart(today);
    const params = new URL(request.url).searchParams;
    const askedWeek = Math.max(1, Number(params.get("weekIndex")) || 1);

    const allBookDates = await prisma.workshopDailyBook.findMany({
      where: { companyId: company.id },
      select: { bookDate: true },
    });
    const weeksTotal = allBookDates.reduce(
      (max, b) => Math.max(max, weekIndexOf(b.bookDate, currentWeekStart)),
      1,
    );
    const weekIndex = Math.min(askedWeek, weeksTotal);
    const targetWeekStart = addDays(currentWeekStart, -(weekIndex - 1) * WEEK_DAYS);
    // The week block runs to the Friday that closes it; the label stops at the
    // Thursday, the last working day of the week.
    const targetWeekEnd = addDays(targetWeekStart, WEEK_DAYS);
    const weekLabelEnd = addDays(targetWeekStart, WEEK_DAYS - 2);

    const [weekDays, openDays, categories] = await Promise.all([
      prisma.workshopDailyBook.findMany({
        where: { companyId: company.id, bookDate: { gte: targetWeekStart, lt: targetWeekEnd } },
        include: { transactions: { select: { direction: true, amount: true, status: true } } },
        orderBy: { bookDate: "desc" },
      }),
      // Every day that is still open, so a day left behind by a forgotten close
      // can be closed from the page instead of hiding in the log.
      prisma.workshopDailyBook.findMany({
        where: { companyId: company.id, status: "OPEN" },
        include: { transactions: { select: { direction: true, amount: true, status: true } } },
        orderBy: { bookDate: "desc" },
      }),
      prisma.expenseCategory.findMany({
        where: { companyId: company.id },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      company,
      book: book
        ? {
            ...book,
            openedByName: userName.get(book.openedBy) ?? null,
            isOldDay: dayKey(book.bookDate) !== dayKey(today),
            totals: calcTotals(book.transactions),
            transactions: decorateTransactions(book.transactions, userName),
          }
        : null,
      days: weekDays.map(dayRow),
      daysTotal: allBookDates.length,
      weekIndex,
      weeksTotal,
      weekStart: targetWeekStart.toISOString(),
      weekEnd: weekLabelEnd.toISOString(),
      openDays: openDays.map(dayRow),
      categories,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch workshop daily book" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { actor, response } = await guard("add");
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

    // ═══════════════════════════════════════════════════════════
    // تصنيف الحركة (صادر فقط) — اختياري
    // A movement may be filed under one of the workshop's own categories
    // (transfers, electricity, water…). Nothing is filed under a placeholder:
    // an entry with no category stays uncategorised until the user files it.
    // ═══════════════════════════════════════════════════════════
    const rawCategoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
    if (rawCategoryId && direction !== "OUT") {
      return NextResponse.json(
        { error: "التصنيف يُحدد فقط لحركات الصادر", code: "CATEGORY_NOT_ALLOWED_ON_IN" },
        { status: 400 },
      );
    }
    let categoryId: string | null = null;
    if (rawCategoryId) {
      const category = await prisma.expenseCategory.findFirst({
        where: { id: rawCategoryId, companyId: company.id },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json(
          { error: "التصنيف غير موجود أو لا يخص شركة القطاعى", code: "CATEGORY_INVALID" },
          { status: 400 },
        );
      }
      categoryId = category.id;
    }

    // ═══════════════════════════════════════════════════════════
    // تاريخ الحركة — افتراضياً اليوم، ويمكن تعديله لإضافة حركة في يوم سابق
    // A movement can be booked on a past day: the book of that day is reopened
    // so the day can be closed again with the right totals.
    // ═══════════════════════════════════════════════════════════
    const today = startOfDay(new Date());
    let targetDate = today;
    if (body.bookDate !== undefined && body.bookDate !== null && body.bookDate !== "") {
      const parsed = parseDayInput(body.bookDate);
      if (!parsed) {
        return NextResponse.json({ error: "تاريخ الحركة غير صالح", code: "DATE_INVALID" }, { status: 400 });
      }
      if (parsed.getTime() > today.getTime()) {
        return NextResponse.json(
          { error: "لا يمكن إضافة حركة بتاريخ مستقبلي", code: "FUTURE_DATE_NOT_ALLOWED" },
          { status: 400 },
        );
      }
      targetDate = parsed;
    }

    let book = await prisma.workshopDailyBook.findFirst({
      where: { companyId: company.id, bookDate: { gte: targetDate, lt: endOfDay(targetDate) } },
      orderBy: { createdAt: "desc" },
    });
    let reopened = false;
    if (book && book.status === "CLOSED") {
      // The day was closed before this entry existed: reopen it so the entry can
      // be confirmed and the day closed again with the right numbers.
      book = await prisma.workshopDailyBook.update({
        where: { id: book.id },
        data: {
          status: "OPEN",
          closedAt: null,
          closedBy: null,
          handoverAmount: null,
          handoverTo: null,
          handoverNote: null,
          actualBalance: null,
          variance: 0,
          varianceType: null,
          varianceNote: null,
        },
      });
      reopened = true;
    }
    if (!book) {
      book = await prisma.workshopDailyBook.create({
        data: { companyId: company.id, bookDate: targetDate, openedBy: actorId },
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
        categoryId,
        reason,
        createdBy: actorId,
      },
      include: TX_INCLUDE,
    });

    return NextResponse.json(
      { ...tx, bookDate: book.bookDate, pendingHint: true, reopened },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Failed to add transaction" }, { status: 500 });
  }
}
