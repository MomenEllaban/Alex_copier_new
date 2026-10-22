import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAction } from "@/lib/auth-helpers";
import { calcTotals, decorateTransactions, getWorkshopCompany } from "@/lib/workshop-daily";

const TX_INCLUDE = {
  category: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
} as const;

/**
 * The entries of one day, for the day list: clicking a day shows what was
 * booked on it, incoming and outgoing alike.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireAction("workshopDaily", "view");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }
    const { id } = await params;

    const company = await getWorkshopCompany();
    if (!company) {
      return NextResponse.json({ error: "شركة القطاعى غير موجودة", code: "WORKSHOP_COMPANY_NOT_FOUND" }, { status: 500 });
    }

    const book = await prisma.workshopDailyBook.findFirst({
      where: { id, companyId: company.id },
      include: { transactions: { include: TX_INCLUDE, orderBy: { createdAt: "desc" } } },
    });
    if (!book) {
      return NextResponse.json({ error: "اليوم غير موجود", code: "BOOK_NOT_FOUND" }, { status: 404 });
    }

    const userIds = new Set<string>();
    userIds.add(book.openedBy);
    for (const t of book.transactions) {
      userIds.add(t.createdBy);
      if (t.confirmedBy) userIds.add(t.confirmedBy);
    }
    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true },
    });
    const userName = new Map(users.map((u) => [u.id, u.name]));

    return NextResponse.json({
      id: book.id,
      bookDate: book.bookDate,
      status: book.status,
      closedAt: book.closedAt,
      handoverAmount: book.handoverAmount,
      handoverTo: book.handoverTo,
      handoverNote: book.handoverNote,
      openedByName: userName.get(book.openedBy) ?? null,
      totals: calcTotals(book.transactions),
      transactions: decorateTransactions(book.transactions, userName),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch day details" }, { status: 500 });
  }
}
