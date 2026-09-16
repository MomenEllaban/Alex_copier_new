import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth-helpers";

const FINANCE_ROLES = ["ACCOUNTANT", "GENERAL_MANAGER", "COMPANY_MANAGER"] as const;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRole(...FINANCE_ROLES);
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: "التأكيد للمحاسب أو المدير فقط", code: "CONFIRM_FORBIDDEN" },
        { status: authed ? 403 : 401 },
      );
    }
    const { id } = await params;

    return await prisma.$transaction(async (db) => {
      const tx = await db.workshopTransaction.findUnique({
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

      // Claim before posting: concurrent confirmations cannot create two expenses.
      // Any posting failure rolls back the claim and all related writes.
      const claimed = await db.workshopTransaction.updateMany({
        where: { id, status: "PENDING", book: { status: "OPEN" } },
        data: { status: "CONFIRMED", confirmedBy: actor.id, confirmedAt: new Date() },
      });
      if (claimed.count !== 1) {
        return NextResponse.json({ error: "هذه الحركة تم التعامل معها من قبل", code: "ALREADY_HANDLED" }, { status: 409 });
      }

      // IN stays in the workshop cashbox; its source does not automatically imply revenue.
      let expenseId: string | null = null;
      if (tx.direction === "OUT") {
        let category = tx.category;
        if (!category || category.companyId !== tx.companyId) {
          category = await db.expenseCategory.findFirst({
            where: { companyId: tx.companyId, name: "يومية الورشة" },
          });
          if (!category) {
            category = await db.expenseCategory.create({
              data: { name: "يومية الورشة", companyId: tx.companyId },
            });
          }
          await db.workshopTransaction.update({ where: { id }, data: { categoryId: category.id } });
        }
        const expense = await db.expense.create({
          data: {
            companyId: tx.companyId,
            categoryId: category.id,
            category: category.name,
            description: `[يومية الورشة] ${tx.reason}`,
            amount: tx.amount,
            paidBy: tx.createdBy,
            date: tx.book.bookDate,
          },
        });
        expenseId = expense.id;
      }

      const updated = await db.workshopTransaction.update({
        where: { id },
        data: { status: "CONFIRMED", confirmedBy: actor.id, expenseId },
        include: { category: { select: { id: true, name: true } } },
      });
      return NextResponse.json({ ...updated, postedToBooks: tx.direction === "OUT" });
    });
  } catch {
    return NextResponse.json({ error: "Failed to confirm transaction" }, { status: 500 });
  }
}
