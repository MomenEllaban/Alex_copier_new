import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth-helpers";

/**
 * POST /api/dev/reset-transactions
 *
 * Test-only helper (GENERAL_MANAGER) that deletes ALL operational financial
 * transactions across every company — sales orders, purchase orders,
 * settlements, expenses and returns — including their linked records
 * (sales items, installments, purchase invoices, returns).
 *
 * Used by the admin to wipe test data so the financial report can be
 * re-verified from a clean slate. Never exposed outside the GM role.
 */
export async function POST() {
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

    const counts = await prisma.$transaction(async (tx) => {
      // Returns first (they reference sales orders, no cascade on those FKs).
      const returns = await tx.returnTransaction.deleteMany({});
      const settlements = await tx.settlement.deleteMany({});
      const expenses = await tx.expense.deleteMany({});
      // Purchase invoices before purchase orders (loose FK).
      const purchaseInvoices = await tx.purchaseInvoice.deleteMany({});
      // Purchase orders cascade their items.
      const purchases = await tx.purchaseOrder.deleteMany({});
      // Sales orders cascade their items and installments.
      const sales = await tx.salesOrder.deleteMany({});

      return {
        sales: sales.count,
        purchases: purchases.count,
        purchaseInvoices: purchaseInvoices.count,
        settlements: settlements.count,
        expenses: expenses.count,
        returns: returns.count,
      };
    });

    return NextResponse.json({ ok: true, counts });
  } catch (error) {
    console.error("[dev/reset-transactions] POST failed:", error);
    return NextResponse.json({ error: "فشل مسح البيانات" }, { status: 500 });
  }
}