import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth-helpers";

/**
 * POST /api/companies/[id]/reset-transactions
 *
 * Test-only helper (GENERAL_MANAGER) that deletes the operational financial
 * transactions of ONE company — sales orders, purchase orders, settlements,
 * expenses and returns — including their linked records (sales items,
 * installments, purchase invoices, returns).
 *
 * Because every page (sales, purchases, settlements, returns, expenses) and the
 * financial report read straight from the database, deleting here immediately
 * reflects everywhere. Used by the admin to zero a company's numbers for
 * re-testing. Never exposed outside the GM role.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Hard off-switch: this endpoint must never wipe production ledgers by
    // accident. Staying dark (404) also keeps it out of the production API.
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_DATA_RESET !== "1") {
      return NextResponse.json({ error: "غير متاح", code: "DISABLED" }, { status: 404 });
    }

    const admin = await requireRole("GENERAL_MANAGER");
    if (!admin) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const { id } = await params;
    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 404 });
    }

    const counts = await prisma.$transaction(async (tx) => {
      // Returns first (they reference sales orders, no cascade on those FKs).
      const returns = await tx.returnTransaction.deleteMany({ where: { companyId: id } });
      const settlements = await tx.settlement.deleteMany({ where: { companyId: id } });
      const expenses = await tx.expense.deleteMany({ where: { companyId: id } });
      // Purchase invoices before purchase orders (loose FK).
      const purchaseInvoices = await tx.purchaseInvoice.deleteMany({ where: { companyId: id } });
      // Purchase orders cascade their items.
      const purchases = await tx.purchaseOrder.deleteMany({ where: { companyId: id } });
      // Sales orders cascade their items and installments.
      const sales = await tx.salesOrder.deleteMany({ where: { companyId: id } });

      return {
        sales: sales.count,
        purchases: purchases.count,
        purchaseInvoices: purchaseInvoices.count,
        settlements: settlements.count,
        expenses: expenses.count,
        returns: returns.count,
      };
    });

    return NextResponse.json({ ok: true, company: { id: company.id, name: company.name }, counts });
  } catch (error) {
    console.error("[companies/reset-transactions] POST failed:", error);
    return NextResponse.json({ error: "فشل تصفير بيانات الشركة" }, { status: 500 });
  }
}