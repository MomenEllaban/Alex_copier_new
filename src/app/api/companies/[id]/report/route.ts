import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAnyPage } from "@/lib/auth-helpers";

interface MonthlyData {
  month: string;
  sales: number;
  purchases: number;
  expenses: number;
  settlements: number;
}

type DateFilter = {
  createdAt?: { gte?: Date; lte?: Date };
};

/**
 * Per-company financial report.
 *
 * All figures are grouped strictly by `companyId` so that every transaction
 * (sales, purchases, expenses, settlements, returns) rolls up to exactly one
 * company. Financial statements (income statement + cash position) are derived
 * live from these operational modules — not from a separate accounting table —
 * so a newly created sales/purchase invoice appears here automatically.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAnyPage("reports", "companies");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const { id } = await params;
    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true, name: true, nameAr: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // A user tied to a company may only read that company's report. The report
    // now exposes salaries, so reading another company's numbers is not a
    // harmless mistake.
    if (user.companyId && user.companyId !== id) {
      return NextResponse.json(
        { error: "هذا التقرير يخص شركة أخرى", code: "CROSS_COMPANY" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const from = fromParam ? new Date(`${fromParam}T00:00:00.000`) : null;
    // Make the end date inclusive of the full day — parse the day, then clamp
    // to its end (23:59:59.999). Without this, any transaction on the `to` day
    // AFTER local midnight UTC is wrongly excluded from the report.
    const to = toParam
      ? new Date(new Date(`${toParam}T00:00:00.000`).getTime() + 86_400_000 - 1)
      : null;

    const dateFilter: DateFilter = from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {};

    const orderDateFilter = from || to
      ? {
          orderDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {};

    const [salesOrders, purchaseOrders, expenses, settlements, returnTransactions] =
      await Promise.all([
        prisma.salesOrder.findMany({
          where: { companyId: id, ...orderDateFilter },
          include: {
            items: { include: { product: true } },
            customer: true,
          },
          orderBy: { orderDate: "desc" },
        }),
        prisma.purchaseOrder.findMany({
          where: { companyId: id, ...orderDateFilter },
          include: {
            items: { include: { product: true } },
            supplier: true,
          },
          orderBy: { orderDate: "desc" },
        }),
        prisma.expense.findMany({
          where: { companyId: id, ...dateFilter },
          orderBy: { date: "desc" },
        }),
        prisma.settlement.findMany({
          where: { companyId: id, ...dateFilter },
          include: {
            collector: { select: { id: true, name: true } },
            verifier: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.returnTransaction.findMany({
          where: { companyId: id, ...dateFilter },
          include: { product: true, customer: true, supplier: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    // ─────────────────────────────────────────────────────────
    // SALES
    // ─────────────────────────────────────────────────────────
    const totalSales = salesOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalSalesCount = salesOrders.length;
    const salesByPaymentMethod: Record<string, number> = {
      CASH: 0,
      CREDIT: 0,
      INSTALLMENT: 0,
      MIXED: 0,
    };
    for (const order of salesOrders) {
      salesByPaymentMethod[order.paymentMethod] =
        (salesByPaymentMethod[order.paymentMethod] || 0) + (order.total || 0);
    }

    // ─────────────────────────────────────────────────────────
    // LIVE PAID / DEBT
    // The authoritative source of "how much of company X's credit was paid" is
    // each SalesOrder.paidAmount, because orders are definitively company-linked
    // and every customer payment (from the customer page or per-invoice) updates
    // the matching order's paidAmount. Reading this live makes the report always
    // reflect the real money received as soon as a payment lands.
    // ─────────────────────────────────────────────────────────
    const creditOrders = salesOrders.filter((o) => o.paymentMethod !== "CASH");

    // Live-enrich each order's paid amount + payment status from paidAmount.
    const liveSalesOrders = salesOrders.map((o) =>
      o.paymentMethod === "CASH"
        ? { ...o, paidAmount: o.total, paymentStatus: "PAID" }
        : {
            ...o,
            paidAmount: o.paidAmount || 0,
            paymentStatus:
              (o.paidAmount || 0) >= (o.total || 0) && (o.total || 0) > 0
                ? "PAID"
                : (o.paidAmount || 0) > 0
                  ? "PARTIAL"
                  : "PENDING",
          },
    );

    // Cash actually received from sales (paid portion). For cash orders the
    // full total counts; for non-cash orders the live paidAmount.
    const cashFromSales =
      salesOrders.reduce(
        (sum, o) => sum + (o.paymentMethod === "CASH" ? o.total : o.paidAmount || 0),
        0,
      );

    // ─────────────────────────────────────────────────────────
    // CUSTOMER DEBT (المبالغ المستحقة من العملاء) — live
    // outstanding = credit sales − paidAmount, per customer, from orders
    // (which are the source of truth and always company-scoped).
    // ─────────────────────────────────────────────────────────
    const totalCustomerDebt = creditOrders.reduce(
      (sum, o) => sum + Math.max(0, (o.total || 0) - (o.paidAmount || 0)),
      0,
    );

    // Per-customer outstanding balance (sum of unpaid portions of credit orders)
    const creditByCustomer = new Map<string, { name: string; phone: string | null; balance: number }>();
    for (const order of creditOrders) {
      if (!order.customer) continue;
      const outstanding = Math.max(0, (order.total || 0) - (order.paidAmount || 0));
      if (outstanding <= 0) continue;
      const entry = creditByCustomer.get(order.customerId) ?? {
        name: order.customer.name || "—",
        phone: (order.customer as unknown as { phone?: string | null })?.phone ?? null,
        balance: 0,
      };
      entry.balance += outstanding;
      creditByCustomer.set(order.customerId, entry);
    }
    // Include customers who have an outstanding balance (> 0)
    const customerDebtDetails = [...creditByCustomer.entries()]
      .map(([customerId, info]) => ({
        customerId,
        customerName: info.name,
        phone: info.phone,
        balance: info.balance,
      }))
      .filter((d) => d.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    // ─────────────────────────────────────────────────────────
    // PURCHASES
    // ─────────────────────────────────────────────────────────
    const totalPurchases = purchaseOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalPurchasesCount = purchaseOrders.length;
    // Cash paid out for purchases: the total of received purchase orders
    // (purchases have no per-order payment tracking yet, so received = paid).
    const cashForPurchases = purchaseOrders
      .filter((o) => o.status === "RECEIVED")
      .reduce((sum, o) => sum + (o.total || 0), 0);

    // ─────────────────────────────────────────────────────────
    // EXPENSES
    // ─────────────────────────────────────────────────────────
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const expensesByCategory: Record<string, number> = {};
    for (const expense of expenses) {
      expensesByCategory[expense.category] =
        (expensesByCategory[expense.category] || 0) + (expense.amount || 0);
    }

    // ─────────────────────────────────────────────────────────
    // RETURNS (split sale vs purchase returns)
    // ─────────────────────────────────────────────────────────
    const salesReturns = returnTransactions
      .filter((r) => r.type === "SALE_RETURN")
      .reduce((sum, r) => sum + (r.total || 0), 0);
    const purchaseReturns = returnTransactions
      .filter((r) => r.type === "PURCHASE_RETURN")
      .reduce((sum, r) => sum + (r.total || 0), 0);
    const totalReturns = salesReturns + purchaseReturns;

    // ─────────────────────────────────────────────────────────
    // SETTLEMENTS
    // ADDITION = money coming in (positive), SUBTRACTION = money going out (negative)
    // ─────────────────────────────────────────────────────────
    const settlementSignedValue = (s: { amount: number; direction?: string }) =>
      s.direction === "SUBTRACTION" ? -(s.amount || 0) : (s.amount || 0);

    const totalSettlements = settlements
      .filter((s) => s.status === "VERIFIED")
      .reduce((sum, s) => sum + settlementSignedValue(s), 0);
    const totalSettlementsPending = settlements
      .filter((s) => s.status === "INITIAL")
      .reduce((sum, s) => sum + settlementSignedValue(s), 0);
    const settlementsCount = settlements.length;

    // Purchase-return refunds are auto-recorded as ADDITION settlements so the
    // cash comes back to the company (Settlements module + cash position). But a
    // refund of goods you bought is profit-neutral — the money-back cancels the
    // purchase cost, it is NOT extra income. So exclude those refund settlements
    // from the profit figure to avoid double-counting.
    const purchaseReturnSettlementTotal = settlements
      .filter((s) => s.status === "VERIFIED" && s.reason?.includes("مرتجع مشتريات"))
      .reduce((sum, s) => sum + settlementSignedValue(s), 0);
    const totalSettlementsForProfit = totalSettlements - purchaseReturnSettlementTotal;

    // ─────────────────────────────────────────────────────────
    // HR / PAYROLL
    // The payroll cost that hits the income statement is the employer's real
    // cost of the staff: gross pay + the employer's insurance share, minus the
    // money the company recovers from the employees (penalties, absences and
    // lateness are credited back against the payroll expense at lock time).
    // Only LOCKED runs are counted — a draft or an approved-but-unlocked run
    // has not been booked yet.
    // ─────────────────────────────────────────────────────────
    const periodDateFilter = from || to
      ? {
          endDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {};

    const employeeSelect = {
      id: true,
      code: true,
      fullName: true,
      fullNameAr: true,
      Department: { select: { name: true, nameAr: true } },
      JobTitle: { select: { title: true, titleAr: true } },
    } as const;

    const [
      payrollRuns,
      employeeAdvances,
      employeeLoans,
      employeeBonuses,
      employeePenalties,
      headcount,
    ] = await Promise.all([
      prisma.payrollRun.findMany({
        where: { companyId: id, Period: { companyId: id, ...periodDateFilter } },
        include: {
          Period: true,
          Items: { include: { Employee: { select: employeeSelect } } },
        },
        orderBy: [{ Period: { year: "asc" } }, { Period: { month: "asc" } }],
      }),
      prisma.employeeAdvance.findMany({
        where: { companyId: id, ...dateFilter },
        include: { Employee: { select: { id: true, code: true, fullName: true, fullNameAr: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.employeeLoan.findMany({
        where: { companyId: id, ...dateFilter },
        include: { Employee: { select: { id: true, code: true, fullName: true, fullNameAr: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.employeeBonus.findMany({
        where: { companyId: id, ...dateFilter },
        include: { Employee: { select: { id: true, code: true, fullName: true, fullNameAr: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.employeePenalty.findMany({
        where: { companyId: id, ...dateFilter },
        include: { Employee: { select: { id: true, code: true, fullName: true, fullNameAr: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.employee.count({ where: { companyId: id } }),
    ]);

    const lockedRuns = payrollRuns.filter((r) => r.status === "LOCKED");

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const employerCostOfRun = (r: {
      totalGross: number;
      totalCompanyInsurance: number;
      totalPenalties: number;
      totalAbsenceDeductions: number;
      totalLateDeductions: number;
    }) =>
      round2(
        (r.totalGross || 0) +
          (r.totalCompanyInsurance || 0) -
          (r.totalPenalties || 0) -
          (r.totalAbsenceDeductions || 0) -
          (r.totalLateDeductions || 0),
      );

    const payrollCost = round2(lockedRuns.reduce((sum, r) => sum + employerCostOfRun(r), 0));

    // Per-employee payroll roll-up across the locked runs in the range.
    const payrollByEmployee = new Map<
      string,
      {
        employeeId: string;
        code: string;
        name: string;
        nameAr: string | null;
        department: string | null;
        jobTitle: string | null;
        gross: number;
        deductions: number;
        net: number;
        employerCost: number;
        bonuses: number;
        penalties: number;
        advances: number;
        loans: number;
        runs: number;
      }
    >();

    for (const run of lockedRuns) {
      for (const item of run.Items) {
        const emp = item.Employee;
        const key = item.employeeId;
        const row = payrollByEmployee.get(key) ?? {
          employeeId: key,
          code: emp?.code ?? "—",
          name: emp?.fullName ?? "—",
          nameAr: emp?.fullNameAr ?? null,
          department: emp?.Department?.nameAr || emp?.Department?.name || null,
          jobTitle: emp?.JobTitle?.titleAr || emp?.JobTitle?.title || null,
          gross: 0,
          deductions: 0,
          net: 0,
          employerCost: 0,
          bonuses: 0,
          penalties: 0,
          advances: 0,
          loans: 0,
          runs: 0,
        };
        row.gross = round2(row.gross + (item.grossSalary || 0));
        row.deductions = round2(row.deductions + (item.totalDeductions || 0));
        row.net = round2(row.net + (item.netSalary || 0));
        row.employerCost = round2(
          row.employerCost +
            (item.grossSalary || 0) +
            (item.companyInsuranceAmount || 0) -
            (item.penaltiesAmount || 0) -
            (item.absenceAmount || 0) -
            (item.lateAmount || 0),
        );
        row.bonuses = round2(row.bonuses + (item.bonusesAmount || 0));
        row.penalties = round2(row.penalties + (item.penaltiesAmount || 0));
        row.advances = round2(row.advances + (item.advancesAmount || 0));
        row.loans = round2(row.loans + (item.loansAmount || 0));
        row.runs += 1;
        payrollByEmployee.set(key, row);
      }
    }

    const payrollEmployees = [...payrollByEmployee.values()].sort(
      (a, b) => b.employerCost - a.employerCost,
    );

    const payrollRunsSummary = payrollRuns.map((r) => ({
      id: r.id,
      month: r.Period.month,
      year: r.Period.year,
      status: r.status,
      employeeCount: r.employeeCount,
      totalGross: r.totalGross,
      totalDeductions: r.totalDeductions,
      totalNet: r.totalNet,
      totalCompanyInsurance: r.totalCompanyInsurance,
      totalBonuses: r.totalBonuses,
      totalPenalties: r.totalPenalties,
      totalAdvances: r.totalAdvances,
      totalLoanInstallments: r.totalLoanInstallments,
      totalTax: r.totalTax,
      employerCost: employerCostOfRun(r),
      totalPaid: r.totalPaid,
      disbursedAt: r.disbursedAt,
      disbursementMethod: r.disbursementMethod,
    }));

    const sumBy = <T extends Record<string, unknown>>(rows: T[], pick: (row: T) => number) =>
      round2(rows.reduce((sum, row) => sum + (pick(row) || 0), 0));

    const advancesTotal = sumBy(employeeAdvances, (a) => a.amount);
    const advancesPending = sumBy(
      employeeAdvances.filter((a) => a.status === "PENDING" || a.status === "APPROVED"),
      (a) => a.amount,
    );
    const loansTotal = sumBy(employeeLoans, (l) => l.totalAmount);
    const loansOutstanding = sumBy(
      employeeLoans.filter((l) => l.status === "APPROVED" || l.status === "DEDUCTING"),
      (l) => l.totalAmount,
    );
    const bonusesTotal = sumBy(employeeBonuses, (b) => b.amount);
    const penaltiesTotal = sumBy(employeePenalties, (p) => p.amount);

    // Money that actually left the company for staff, inside the range.
    const disbursedOn = (value: Date | null) => {
      if (!value) return false;
      if (from && value < from) return false;
      if (to && value > to) return false;
      return true;
    };

    const salariesPaid = round2(
      payrollRuns
        .filter((r) => disbursedOn(r.disbursedAt))
        .reduce((sum, r) => sum + (r.totalPaid || 0), 0),
    );
    const advancesDisbursed = round2(
      employeeAdvances
        .filter((a) => disbursedOn(a.disbursedAt))
        .reduce((sum, a) => sum + (a.amount || 0), 0),
    );
    const loansDisbursed = round2(
      employeeLoans
        .filter((l) => disbursedOn(l.disbursedAt))
        .reduce((sum, l) => sum + (l.totalAmount || 0), 0),
    );

    // ─────────────────────────────────────────────────────────
    // INCOME STATEMENT (قائمة الدخل)
    // revenue − cost of purchases − expenses − sales returns
    // + net settlements for profit (signed: ADDITION increases profit, SUBTRACTION reduces it)
    // − payroll cost (the employer's real cost of the staff)
    //
    // Purchase returns are NOT added separately here: returning goods reduces the
    // purchase order total (which lowers purchases cost) and refunds cash via the
    // settlement — the two cancel, keeping the purchase return profit-neutral.
    // ─────────────────────────────────────────────────────────
    const netProfit =
      totalSales -
      totalPurchases -
      totalExpenses -
      salesReturns +
      totalSettlementsForProfit -
      payrollCost;

    // ─────────────────────────────────────────────────────────
    // CASH POSITION (الموقف النقدي)
    // in: verified settlements + cash from sales (+ any payment); out: expenses + cash purchases
    // + the money that went out to the staff (salaries paid, advances and loans handed over)
    // ─────────────────────────────────────────────────────────
    const cashIn = totalSettlements + cashFromSales;
    const cashOut = totalExpenses + cashForPurchases + salariesPaid + advancesDisbursed + loansDisbursed;
    const netCash = cashIn - cashOut;

    // ─────────────────────────────────────────────────────────
    // MONTHLY BREAKDOWN
    // ─────────────────────────────────────────────────────────
    const monthlyDataMap: Record<string, MonthlyData> = {};

    if (!from && !to) {
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyDataMap[key] = { month: key, sales: 0, purchases: 0, expenses: 0, settlements: 0 };
      }
    }

    const bucket = (key: string): MonthlyData => {
      if (!monthlyDataMap[key]) {
        monthlyDataMap[key] = { month: key, sales: 0, purchases: 0, expenses: 0, settlements: 0 };
      }
      return monthlyDataMap[key];
    };
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    for (const order of salesOrders) bucket(monthKey(new Date(order.orderDate))).sales += order.total || 0;
    for (const order of purchaseOrders) bucket(monthKey(new Date(order.orderDate))).purchases += order.total || 0;
    for (const expense of expenses) bucket(monthKey(new Date(expense.date))).expenses += expense.amount || 0;
    for (const settlement of settlements) bucket(monthKey(new Date(settlement.createdAt))).settlements += settlementSignedValue(settlement);

    const monthlyData = Object.values(monthlyDataMap).sort((a, b) => a.month.localeCompare(b.month));

    return NextResponse.json({
      company,
      from: fromParam || null,
      to: toParam || null,
      sales: {
        total: totalSales,
        count: totalSalesCount,
        byPaymentMethod: salesByPaymentMethod,
        orders: liveSalesOrders,
      },
      purchases: {
        total: totalPurchases,
        count: totalPurchasesCount,
        orders: purchaseOrders,
      },
      expenses: {
        total: totalExpenses,
        byCategory: expensesByCategory,
        items: expenses,
      },
      returns: {
        total: totalReturns,
        salesReturns,
        purchaseReturns,
        items: returnTransactions,
      },
      settlements: {
        total: totalSettlements,
        pending: totalSettlementsPending,
        count: settlementsCount,
        items: settlements,
      },
      customerDebt: {
        total: totalCustomerDebt,
        details: customerDebtDetails,
      },
      incomeStatement: {
        salesRevenue: totalSales,
        purchasesCost: totalPurchases,
        salesReturns,
        purchaseReturns,
        expenses: totalExpenses,
        settlementsCollected: totalSettlementsForProfit,
        payrollCost,
        netProfit,
      },
      cashPosition: {
        cashIn,
        cashOut,
        netCash,
        settlementsVerified: totalSettlements,
        cashFromSales,
        expenses: totalExpenses,
        cashForPurchases,
        salariesPaid,
        advancesDisbursed,
        loansDisbursed,
      },
      hr: {
        headcount,
        payrollCost,
        totals: {
          gross: round2(lockedRuns.reduce((sum, r) => sum + (r.totalGross || 0), 0)),
          deductions: round2(lockedRuns.reduce((sum, r) => sum + (r.totalDeductions || 0), 0)),
          net: round2(lockedRuns.reduce((sum, r) => sum + (r.totalNet || 0), 0)),
          bonuses: round2(lockedRuns.reduce((sum, r) => sum + (r.totalBonuses || 0), 0)),
          penalties: round2(lockedRuns.reduce((sum, r) => sum + (r.totalPenalties || 0), 0)),
          advancesRecovered: round2(lockedRuns.reduce((sum, r) => sum + (r.totalAdvances || 0), 0)),
          loansRecovered: round2(lockedRuns.reduce((sum, r) => sum + (r.totalLoanInstallments || 0), 0)),
          companyInsurance: round2(lockedRuns.reduce((sum, r) => sum + (r.totalCompanyInsurance || 0), 0)),
          tax: round2(lockedRuns.reduce((sum, r) => sum + (r.totalTax || 0), 0)),
          employerCost: payrollCost,
        },
        runs: payrollRunsSummary,
        employees: payrollEmployees,
        advances: {
          total: advancesTotal,
          pending: advancesPending,
          disbursed: advancesDisbursed,
          count: employeeAdvances.length,
          items: employeeAdvances.map((a) => ({
            id: a.id,
            employeeId: a.employeeId,
            employeeName: a.Employee?.fullNameAr || a.Employee?.fullName || "—",
            amount: a.amount,
            status: a.status,
            requestDate: a.requestDate,
            disbursedAt: a.disbursedAt,
            reason: a.reason,
          })),
        },
        loans: {
          total: loansTotal,
          outstanding: loansOutstanding,
          disbursed: loansDisbursed,
          count: employeeLoans.length,
          items: employeeLoans.map((l) => ({
            id: l.id,
            employeeId: l.employeeId,
            employeeName: l.Employee?.fullNameAr || l.Employee?.fullName || "—",
            totalAmount: l.totalAmount,
            monthlyAmount: l.monthlyAmount,
            installmentCount: l.installmentCount,
            status: l.status,
            startDate: l.startDate,
            disbursedAt: l.disbursedAt,
            reason: l.reason,
          })),
        },
        bonuses: {
          total: bonusesTotal,
          count: employeeBonuses.length,
          items: employeeBonuses.map((b) => ({
            id: b.id,
            employeeId: b.employeeId,
            employeeName: b.Employee?.fullNameAr || b.Employee?.fullName || "—",
            title: b.title,
            amount: b.amount,
            status: b.status,
            targetMonth: b.targetMonth,
            targetYear: b.targetYear,
          })),
        },
        penalties: {
          total: penaltiesTotal,
          count: employeePenalties.length,
          items: employeePenalties.map((p) => ({
            id: p.id,
            employeeId: p.employeeId,
            employeeName: p.Employee?.fullNameAr || p.Employee?.fullName || "—",
            title: p.title,
            amount: p.amount,
            status: p.status,
            targetMonth: p.targetMonth,
            targetYear: p.targetYear,
            reason: p.reason,
          })),
        },
      },
      netProfit,
      monthlyData,
    });
  } catch (error) {
    console.error("[companies/report] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch company report" }, { status: 500 });
  }
}
