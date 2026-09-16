import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth-helpers";

const FINANCE_ROLES = ["ACCOUNTANT", "GENERAL_MANAGER", "COMPANY_MANAGER"] as const;

async function guardFinance() {
  const actor = await requireRole(...FINANCE_ROLES);
  if (actor) return { actor };
  const authed = await requireAuth();
  return {
    actor: null,
    response: NextResponse.json(
      { error: "التأكيد للمحاسب أو المدير فقط", code: "CONFIRM_FORBIDDEN" },
      { status: authed ? 403 : 401 },
    ),
  };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { actor, response } = await guardFinance();
    if (!actor && response) return response;
    const actorId = (actor as { id?: string }).id ?? "";
    const { id } = await params;

    const tx = await prisma.workshopTransaction.findUnique({
      where: { id },
      include: { book: true, category: true },
    });
    if (!tx) {
      return NextResponse.json({ error: "الحركة غير موجودة", code: "NOT_FOUND" }, { status: 404 });
    }
    if (tx.status !== "PENDING") {
      return NextResponse.json({ error: "هذه الحركة تم التعامل معها من قبل", code: "ALREADY_HANDLED" }, { status: 409 });
    }
    if (tx.book.status !== "OPEN") {
      return NextResponse.json({ error: "اليوم مقفول — لا يمكن التأكيد", code: "BOOK_CLOSED" }, { status: 409 });
    }

    // Only OUT (صادر) posts to the company books as an expense.
    // IN (وارد) only tops up the cashbox once confirmed.
    let expenseId: string | null = null;
    if (tx.direction === "OUT") {
      if (!tx.categoryId || !tx.category) {
        return NextResponse.json({ error: "بند المصروفات مطلوب للتأكيد", code: "CATEGORY_REQUIRED" }, { status: 400 });
      }
      const expense = await prisma.expense.create({
        data: {
          companyId: tx.companyId,
          categoryId: tx.categoryId,
          category: tx.category.name,
          description: `[يومية الورشة] ${tx.reason}`,
          amount: tx.amount,
          paidBy: tx.createdBy,
          date: new Date(),
        },
      });
      expenseId = expense.id;
    }

    const updated = await prisma.workshopTransaction.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedBy: actorId, confirmedAt: new Date(), expenseId },
      include: { category: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ ...updated, postedToBooks: tx.direction === "OUT" });
  } catch {
    return NextResponse.json({ error: "Failed to confirm transaction" }, { status: 500 });
  }
}
