import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { calcTotals, dayKey, getWorkshopCompany, startOfDay } from "@/lib/workshop-daily";

const TX_INCLUDE = {
  category: { select: { id: true, name: true } },
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

    const categories = await prisma.expenseCategory.findMany({
      where: { companyId: company.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      company,
      categories,
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
    const categoryId = typeof body.categoryId === "string" && body.categoryId !== "" ? body.categoryId : null;

    if (!direction) {
      return NextResponse.json({ error: "نوع الحركة مطلوب (وارد أو صادر)", code: "DIRECTION_REQUIRED" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "المبلغ يجب أن يكون رقمًا أكبر من صفر", code: "AMOUNT_INVALID" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "البيان مطلوب", code: "REASON_REQUIRED" }, { status: 400 });
    }

    let categoryName: string | null = null;
    if (categoryId) {
      const category = await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
      if (!category || category.companyId !== company.id) {
        return NextResponse.json({ error: "بند المصروفات غير موجود لشركة القطاعى", code: "CATEGORY_NOT_FOUND" }, { status: 400 });
      }
      categoryName = category.name;
    } else if (direction === "OUT") {
      return NextResponse.json({ error: "بند المصروفات مطلوب للصادر", code: "CATEGORY_REQUIRED" }, { status: 400 });
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
        categoryId,
        reason,
        createdBy: actorId,
      },
      include: TX_INCLUDE,
    });

    return NextResponse.json(
      { ...tx, categoryName, bookDate: book.bookDate, pendingHint: true },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Failed to add transaction" }, { status: 500 });
  }
}
