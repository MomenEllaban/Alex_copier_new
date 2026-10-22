import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The HR part of the company report.
 *
 * Two things have to hold: the payroll shows up in the income statement as a
 * cost of the staff, and the money that actually left the company (paid
 * salaries) shows up in the cash position.
 */

const mocks = vi.hoisted(() => {
  const db = {
    company: { findUnique: vi.fn() },
    salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
    purchaseOrder: { findMany: vi.fn().mockResolvedValue([]) },
    expense: { findMany: vi.fn().mockResolvedValue([]) },
    settlement: { findMany: vi.fn().mockResolvedValue([]) },
    returnTransaction: { findMany: vi.fn().mockResolvedValue([]) },
    payrollRun: { findMany: vi.fn().mockResolvedValue([]) },
    employeeAdvance: { findMany: vi.fn().mockResolvedValue([]) },
    employeeLoan: { findMany: vi.fn().mockResolvedValue([]) },
    employeeBonus: { findMany: vi.fn().mockResolvedValue([]) },
    employeePenalty: { findMany: vi.fn().mockResolvedValue([]) },
    employee: { count: vi.fn().mockResolvedValue(0) },
  };
  return { requireAuth: vi.fn(), db };
});

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: vi.fn(async () => mocks.requireAuth()),
  requireAction: vi.fn(async () => mocks.requireAuth()),
  requireAnyAction: vi.fn(async () => mocks.requireAuth()),
  requireAnyPage: vi.fn(async () => mocks.requireAuth()),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));

import { GET } from "@/app/api/companies/[id]/report/route";

const company = { id: "c1", name: "alex-copier", nameAr: "اليكس كوبير" };

const payrollItem = (overrides: Record<string, unknown> = {}) => ({
  id: "pi1",
  payrollRunId: "pr1",
  employeeId: "emp1",
  basicSalary: 8000,
  allowancesAmount: 1000,
  bonusesAmount: 1000,
  overtimeAmount: 0,
  absenceAmount: 0,
  lateAmount: 0,
  penaltiesAmount: 0,
  advancesAmount: 0,
  loansAmount: 0,
  employeeInsuranceAmount: 500,
  companyInsuranceAmount: 500,
  taxAmount: 500,
  totalEarnings: 10000,
  totalDeductions: 1500,
  grossSalary: 10000,
  netSalary: 8500,
  workedDays: 30,
  absentDays: 0,
  lateDays: 0,
  overtimeHours: 0,
  flag: "NONE",
  notes: null,
  createdAt: new Date("2026-08-01"),
  updatedAt: new Date("2026-08-01"),
  Employee: {
    id: "emp1",
    code: "E001",
    fullName: "Mona Ali",
    fullNameAr: "منى علي",
    Department: { name: "Sales", nameAr: "المبيعات" },
    JobTitle: { title: "Engineer", titleAr: "مهندس" },
  },
  ...overrides,
});

const payrollRun = (overrides: Record<string, unknown> = {}) => ({
  id: "pr1",
  periodId: "per1",
  companyId: "c1",
  status: "LOCKED",
  totalGross: 10000,
  totalDeductions: 1500,
  totalNet: 8500,
  totalBasic: 8000,
  totalAllowances: 1000,
  totalBonuses: 1000,
  totalOvertime: 0,
  totalAbsenceDeductions: 0,
  totalLateDeductions: 0,
  totalPenalties: 0,
  totalAdvances: 0,
  totalLoanInstallments: 0,
  totalEmployeeInsurance: 500,
  totalCompanyInsurance: 500,
  totalTax: 500,
  employeeCount: 1,
  calculatedAt: new Date("2026-08-01"),
  calculatedBy: "u1",
  approvedBy: "u1",
  approvedAt: new Date("2026-08-02"),
  lockedBy: "u1",
  lockedAt: new Date("2026-08-03"),
  journalEntryId: "je1",
  totalPaid: 0,
  disbursedAt: null,
  disbursedBy: null,
  disbursementMethod: null,
  treasuryAccountId: null,
  disbursementJournalEntryId: null,
  notes: null,
  createdAt: new Date("2026-08-01"),
  updatedAt: new Date("2026-08-03"),
  Period: {
    id: "per1",
    month: 8,
    year: 2026,
    startDate: new Date("2026-08-01"),
    endDate: new Date("2026-08-31"),
    companyId: "c1",
  },
  Items: [payrollItem()],
  ...overrides,
});

const req = (query = "") => new Request(`http://localhost/api/companies/c1/report${query}`);

describe("GET /api/companies/[id]/report - HR section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "u1", role: "GENERAL_MANAGER" });
    mocks.db.company.findUnique.mockResolvedValue(company);
    mocks.db.salesOrder.findMany.mockResolvedValue([]);
    mocks.db.purchaseOrder.findMany.mockResolvedValue([]);
    mocks.db.expense.findMany.mockResolvedValue([]);
    mocks.db.settlement.findMany.mockResolvedValue([]);
    mocks.db.returnTransaction.findMany.mockResolvedValue([]);
    mocks.db.payrollRun.findMany.mockResolvedValue([]);
    mocks.db.employeeAdvance.findMany.mockResolvedValue([]);
    mocks.db.employeeLoan.findMany.mockResolvedValue([]);
    mocks.db.employeeBonus.findMany.mockResolvedValue([]);
    mocks.db.employeePenalty.findMany.mockResolvedValue([]);
    mocks.db.employee.count.mockResolvedValue(3);
  });

  it("refuses to read another company's report", async () => {
    mocks.requireAuth.mockResolvedValue({ id: "u1", role: "COMPANY_MANAGER", companyId: "c2" });

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("CROSS_COMPANY");
  });

  it("books the employer's payroll cost in the income statement", async () => {
    // 10,000 gross + 500 company insurance - 300 penalties - 200 absence - 100 late
    mocks.db.payrollRun.findMany.mockResolvedValue([
      payrollRun({
        totalPenalties: 300,
        totalAbsenceDeductions: 200,
        totalLateDeductions: 100,
      }),
    ]);
    mocks.db.salesOrder.findMany.mockResolvedValue([
      {
        id: "o1",
        companyId: "c1",
        customerId: "custA",
        status: "CONFIRMED",
        total: 50000,
        discount: 0,
        paymentMethod: "CASH",
        paidAmount: 50000,
        orderDate: new Date("2026-08-10T10:00:00.000Z"),
        createdAt: new Date("2026-08-10T10:00:00.000Z"),
        items: [],
        customer: { id: "custA", name: "عميل" },
      },
    ]);

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    const body = await res.json();

    expect(body.hr.payrollCost).toBe(9900);
    expect(body.incomeStatement.payrollCost).toBe(9900);
    // 50,000 sales - 9,900 payroll cost
    expect(body.incomeStatement.netProfit).toBe(40100);
    expect(body.hr.headcount).toBe(3);
  });

  it("ignores a payroll run that is not locked yet", async () => {
    mocks.db.payrollRun.findMany.mockResolvedValue([payrollRun({ status: "APPROVED" })]);

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    const body = await res.json();

    expect(body.hr.payrollCost).toBe(0);
    expect(body.incomeStatement.netProfit).toBe(0);
  });

  it("shows the paid salaries in the cash position", async () => {
    mocks.db.payrollRun.findMany.mockResolvedValue([
      payrollRun({
        totalPaid: 8500,
        disbursedAt: new Date("2026-08-05T10:00:00.000Z"),
        disbursementMethod: "CASH",
      }),
    ]);

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    const body = await res.json();

    expect(body.cashPosition.salariesPaid).toBe(8500);
    expect(body.cashPosition.cashOut).toBe(8500);
    expect(body.cashPosition.netCash).toBe(-8500);
  });

  it("leaves a run that was not paid out of the cash position", async () => {
    mocks.db.payrollRun.findMany.mockResolvedValue([payrollRun({ totalPaid: 0, disbursedAt: null })]);

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    const body = await res.json();

    expect(body.cashPosition.salariesPaid).toBe(0);
    expect(body.cashPosition.cashOut).toBe(0);
  });

  it("rolls the payroll up per employee", async () => {
    mocks.db.payrollRun.findMany.mockResolvedValue([payrollRun()]);

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    const body = await res.json();

    expect(body.hr.employees).toHaveLength(1);
    expect(body.hr.employees[0]).toMatchObject({
      code: "E001",
      name: "Mona Ali",
      nameAr: "منى علي",
      department: "المبيعات",
      gross: 10000,
      deductions: 1500,
      net: 8500,
      runs: 1,
    });
    expect(body.hr.employees[0].employerCost).toBe(10500);
    expect(body.hr.runs[0]).toMatchObject({ month: 8, year: 2026, status: "LOCKED" });
  });

  it("adds the advances and loans that were handed over to the cash outflow", async () => {
    mocks.db.employeeAdvance.findMany.mockResolvedValue([
      {
        id: "adv1",
        companyId: "c1",
        employeeId: "emp1",
        amount: 3000,
        status: "DEDUCTING",
        requestDate: new Date("2026-08-02"),
        reason: "سلفة",
        disbursedAt: new Date("2026-08-03"),
        createdAt: new Date("2026-08-02"),
        Employee: { id: "emp1", code: "E001", fullName: "Mona Ali", fullNameAr: "منى علي" },
      },
    ]);
    mocks.db.employeeLoan.findMany.mockResolvedValue([
      {
        id: "loan1",
        companyId: "c1",
        employeeId: "emp1",
        totalAmount: 12000,
        monthlyAmount: 1000,
        installmentCount: 12,
        status: "DEDUCTING",
        startDate: new Date("2026-08-01"),
        reason: "قرض",
        disbursedAt: new Date("2026-08-04"),
        createdAt: new Date("2026-08-01"),
        Employee: { id: "emp1", code: "E001", fullName: "Mona Ali", fullNameAr: "منى علي" },
      },
    ]);

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    const body = await res.json();

    expect(body.hr.advances.total).toBe(3000);
    expect(body.hr.advances.disbursed).toBe(3000);
    expect(body.hr.loans.total).toBe(12000);
    expect(body.hr.loans.outstanding).toBe(12000);
    expect(body.cashPosition.advancesDisbursed).toBe(3000);
    expect(body.cashPosition.loansDisbursed).toBe(12000);
    expect(body.cashPosition.cashOut).toBe(15000);
  });
});
