import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const user = await requirePageAccess("companies");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const companies = await prisma.company.findMany({
      orderBy: { createdAt: "desc" },
    });

    const companiesWithFinance = await Promise.all(
      companies.map(async (company) => {
        const [salesAgg, purchaseAgg, expenseAgg, salesReturnAgg, purchaseReturnAgg, settlementCount, salesCount, purchaseCount] = await Promise.all([
          prisma.salesOrder.aggregate({
            where: { companyId: company.id },
            _sum: { total: true },
          }),
          prisma.purchaseOrder.aggregate({
            where: { companyId: company.id },
            _sum: { total: true },
          }),
          prisma.expense.aggregate({
            where: { companyId: company.id },
            _sum: { amount: true },
          }),
          prisma.returnTransaction.aggregate({
            where: { companyId: company.id, type: "SALE_RETURN" },
            _sum: { total: true },
          }),
          prisma.returnTransaction.aggregate({
            where: { companyId: company.id, type: "PURCHASE_RETURN" },
            _sum: { total: true },
          }),
          prisma.settlement.count({
            where: { companyId: company.id },
          }),
          prisma.salesOrder.count({
            where: { companyId: company.id },
          }),
          prisma.purchaseOrder.count({
            where: { companyId: company.id },
          }),
        ]);

        const totalSales = salesAgg._sum?.total ?? 0;
        const totalPurchases = purchaseAgg._sum?.total ?? 0;
        const totalExpenses = expenseAgg._sum?.amount ?? 0;
        const salesReturns = salesReturnAgg._sum?.total ?? 0;
        const purchaseReturns = purchaseReturnAgg._sum?.total ?? 0;

        // Income-statement style net profit (consistent with the per-company
        // financial report): sales − purchases − expenses − sales returns + purchase returns.
        const netProfit = totalSales - totalPurchases - totalExpenses - salesReturns + purchaseReturns;

        return {
          ...company,
          totalSales,
          totalPurchases,
          totalExpenses,
          salesReturns,
          purchaseReturns,
          totalSettlements: settlementCount,
          netProfit,
          counts: {
            salesOrders: salesCount,
            purchaseOrders: purchaseCount,
          },
        };
      })
    );

    return NextResponse.json(companiesWithFinance);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {

    const actor = await requireAction("companies", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "اسم الشركة مطلوب", code: "NAME_REQUIRED" }, { status: 400 });
    }

    const optionalText = (value: unknown): string | null =>
      typeof value === "string" && value.trim() !== "" ? value.trim() : null;

    const company = await prisma.company.create({
      data: {
        name,
        nameAr: optionalText(body.nameAr),
        taxNumber: optionalText(body.taxNumber),
        tradeRegister: optionalText(body.tradeRegister),
        address: optionalText(body.address),
        phone: optionalText(body.phone),
        email: optionalText(body.email),
      },
    });
    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "اسم الشركة مستخدم بالفعل", code: "DUPLICATE_COMPANY_NAME" },
        { status: 409 },
      );
    }
    console.error("[companies] POST failed:", error);
    return NextResponse.json({ error: "Failed to create company", code: "CREATE_FAILED" }, { status: 500 });
  }
}
