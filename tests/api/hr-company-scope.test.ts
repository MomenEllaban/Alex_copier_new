import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Company scoping inside the HR module.
 *
 * Every employee belongs to one company, and so does every HR record. A
 * request that names one company and an employee (or a payroll run, an
 * advance) of another must be refused before anything is written.
 */

const mocks = vi.hoisted(() => {
  const db = {
    employee: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    payrollRun: { findUnique: vi.fn(), findMany: vi.fn() },
    employeeAdvance: { findUnique: vi.fn(), findMany: vi.fn() },
    employeeBonus: { findUnique: vi.fn(), findMany: vi.fn() },
    employeePenalty: { findUnique: vi.fn(), findMany: vi.fn() },
    employeeLoan: { findUnique: vi.fn(), findMany: vi.fn() },
    loanInstallment: { findUnique: vi.fn() },
  };
  return {
    requirePageAccess: vi.fn(),
    requireAction: vi.fn(),
    requireAuth: vi.fn(),
    requestAdvance: vi.fn(),
    approveAdvance: vi.fn(),
    disburseAdvance: vi.fn(),
    rejectAdvance: vi.fn(),
    createBonus: vi.fn(),
    approveBonus: vi.fn(),
    rejectBonus: vi.fn(),
    getBonuses: vi.fn(),
    createPenalty: vi.fn(),
    approvePenalty: vi.fn(),
    rejectPenalty: vi.fn(),
    getPenalties: vi.fn(),
    createLoan: vi.fn(),
    approveLoan: vi.fn(),
    disburseLoan: vi.fn(),
    rejectLoan: vi.fn(),
    postponeInstallment: vi.fn(),
    earlyPayoffInstallment: vi.fn(),
    earlyPayoffLoan: vi.fn(),
    getEmployeeLoanSummary: vi.fn(),
    disbursePayrollRun: vi.fn(),
    lockPayrollRun: vi.fn(),
    approvePayrollRun: vi.fn(),
    calculatePayrollRun: vi.fn(),
    db,
  };
});

vi.mock("@/lib/auth-helpers", () => ({
  requirePageAccess: mocks.requirePageAccess,
  requireAction: mocks.requireAction,
  requireAnyAction: mocks.requireAction,
  requireAuth: mocks.requireAuth,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/services/hr/loan-advance-service", () => ({
  requestAdvance: mocks.requestAdvance,
  approveAdvance: mocks.approveAdvance,
  disburseAdvance: mocks.disburseAdvance,
  rejectAdvance: mocks.rejectAdvance,
  createLoan: mocks.createLoan,
  approveLoan: mocks.approveLoan,
  disburseLoan: mocks.disburseLoan,
  rejectLoan: mocks.rejectLoan,
  postponeInstallment: mocks.postponeInstallment,
  earlyPayoffInstallment: mocks.earlyPayoffInstallment,
  earlyPayoffLoan: mocks.earlyPayoffLoan,
  getEmployeeLoanSummary: mocks.getEmployeeLoanSummary,
}));
vi.mock("@/lib/services/hr/bonus-penalty-service", () => ({
  createBonus: mocks.createBonus,
  approveBonus: mocks.approveBonus,
  rejectBonus: mocks.rejectBonus,
  getBonuses: mocks.getBonuses,
  createPenalty: mocks.createPenalty,
  approvePenalty: mocks.approvePenalty,
  rejectPenalty: mocks.rejectPenalty,
  getPenalties: mocks.getPenalties,
}));
vi.mock("@/lib/services/hr/payroll-service", () => ({
  calculatePayrollRun: mocks.calculatePayrollRun,
  approvePayrollRun: mocks.approvePayrollRun,
  lockPayrollRun: mocks.lockPayrollRun,
  disbursePayrollRun: mocks.disbursePayrollRun,
}));
vi.mock("@/lib/hr/hr-notifications", () => ({
  notifyPayrollReady: vi.fn(async () => {}),
  notifyPayrollApproved: vi.fn(async () => {}),
}));

import * as advances from "@/app/api/hr/advances/route";
import * as bonuses from "@/app/api/hr/bonuses/route";
import * as penalties from "@/app/api/hr/penalties/route";
import * as loans from "@/app/api/hr/loans/route";
import * as payroll from "@/app/api/hr/payroll/route";
import * as employeeById from "@/app/api/hr/employees/[id]/route";

const POST = (body: unknown) =>
  new Request("http://localhost/api/hr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const PATCH = (body: unknown) =>
  new Request("http://localhost/api/hr", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const ACTOR = { id: "u1", role: "HR_MANAGER", companyId: "c1" };

describe("HR API — company scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(ACTOR);
    mocks.requirePageAccess.mockResolvedValue(ACTOR);
    mocks.requireAction.mockResolvedValue(ACTOR);
    // The employee lookup the scope helpers use: "not in this company".
    mocks.db.employee.findFirst.mockResolvedValue(null);
  });

  it("refuses an advance for an employee of another company", async () => {
    const res = await advances.POST(
      POST({
        employeeId: "emp-other",
        amount: 1000,
        deductMonth: 8,
        deductYear: 2026,
        reason: "سلفة",
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("EMPLOYEE_NOT_IN_COMPANY");
    expect(mocks.requestAdvance).not.toHaveBeenCalled();
  });

  it("refuses a bonus for an employee of another company", async () => {
    const res = await bonuses.POST(
      POST({
        employeeId: "emp-other",
        title: "حافز",
        targetMonth: 8,
        targetYear: 2026,
        amount: 500,
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("EMPLOYEE_NOT_IN_COMPANY");
    expect(mocks.createBonus).not.toHaveBeenCalled();
  });

  it("refuses a penalty for an employee of another company", async () => {
    const res = await penalties.POST(
      POST({
        employeeId: "emp-other",
        title: "جزاء",
        targetMonth: 8,
        targetYear: 2026,
        amount: 500,
        reason: "تأخير",
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("EMPLOYEE_NOT_IN_COMPANY");
    expect(mocks.createPenalty).not.toHaveBeenCalled();
  });

  it("refuses a loan for an employee of another company", async () => {
    const res = await loans.POST(
      POST({
        employeeId: "emp-other",
        totalAmount: 10000,
        installmentCount: 10,
        startDate: "2026-08-01",
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("EMPLOYEE_NOT_IN_COMPANY");
    expect(mocks.createLoan).not.toHaveBeenCalled();
  });

  it("accepts a record that belongs to the actor's company", async () => {
    mocks.db.employee.findFirst.mockResolvedValue({
      id: "emp1",
      code: "E001",
      fullName: "Mona Ali",
      fullNameAr: "منى علي",
      companyId: "c1",
      baseSalary: 5000,
      status: "ACTIVE",
    });
    mocks.requestAdvance.mockResolvedValue({ id: "adv1" });

    const res = await advances.POST(
      POST({
        employeeId: "emp1",
        amount: 1000,
        deductMonth: 8,
        deductYear: 2026,
        reason: "سلفة",
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.requestAdvance).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "c1", employeeId: "emp1" }),
    );
  });

  it("refuses to read an employee of another company", async () => {
    mocks.db.employee.findUnique.mockResolvedValue({
      id: "emp-other",
      companyId: "c2",
      fullName: "Other",
    });

    const res = await employeeById.GET(
      new Request("http://localhost/api/hr/employees/emp-other"),
      params("emp-other"),
    );

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("CROSS_COMPANY");
  });

  it("refuses to update an employee of another company", async () => {
    mocks.db.employee.findUnique.mockResolvedValue({
      id: "emp-other",
      companyId: "c2",
      fullName: "Other",
    });

    const res = await employeeById.PUT(
      POST({ fullName: "Hacked" }),
      params("emp-other"),
    );

    expect(res.status).toBe(403);
    expect(mocks.db.employee.update).not.toHaveBeenCalled();
  });

  it("refuses to delete an employee of another company", async () => {
    mocks.db.employee.findUnique.mockResolvedValue({
      id: "emp-other",
      companyId: "c2",
      fullName: "Other",
    });

    const res = await employeeById.DELETE(
      new Request("http://localhost/api/hr/employees/emp-other", { method: "DELETE" }),
      params("emp-other"),
    );

    expect(res.status).toBe(403);
    expect(mocks.db.employee.delete).not.toHaveBeenCalled();
  });

  it("refuses to pay a payroll run of another company", async () => {
    mocks.db.payrollRun.findUnique.mockResolvedValue({
      id: "pr1",
      companyId: "c2",
      status: "LOCKED",
    });

    const res = await payroll.POST(POST({ action: "disburse", runId: "pr1" }));

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("CROSS_COMPANY");
    expect(mocks.disbursePayrollRun).not.toHaveBeenCalled();
  });

  it("refuses to lock a payroll run of another company", async () => {
    mocks.db.payrollRun.findUnique.mockResolvedValue({
      id: "pr1",
      companyId: "c2",
      status: "APPROVED",
    });

    const res = await payroll.POST(POST({ action: "lock", runId: "pr1" }));

    expect(res.status).toBe(403);
    expect(mocks.lockPayrollRun).not.toHaveBeenCalled();
  });

  it("refuses to act on an advance of another company", async () => {
    mocks.db.employeeAdvance.findUnique.mockResolvedValue({
      id: "adv1",
      companyId: "c2",
      amount: 1000,
      status: "PENDING",
    });

    const res = await advances.PATCH(PATCH({ id: "adv1", action: "approve" }));

    expect(res.status).toBe(403);
    expect(mocks.approveAdvance).not.toHaveBeenCalled();
  });

  it("lets a group-level user work on the company they name", async () => {
    const groupActor = { id: "u2", role: "GENERAL_MANAGER", companyId: null };
    mocks.requireAuth.mockResolvedValue(groupActor);
    mocks.requirePageAccess.mockResolvedValue(groupActor);
    mocks.requireAction.mockResolvedValue(groupActor);
    mocks.db.employee.findFirst.mockResolvedValue({
      id: "emp9",
      code: "E009",
      fullName: "Samy",
      fullNameAr: "سامي",
      companyId: "c9",
      baseSalary: 5000,
      status: "ACTIVE",
    });
    mocks.requestAdvance.mockResolvedValue({ id: "adv9" });

    const res = await advances.POST(
      POST({
        companyId: "c9",
        employeeId: "emp9",
        amount: 1000,
        deductMonth: 8,
        deductYear: 2026,
        reason: "سلفة",
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.requestAdvance).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "c9" }),
    );
  });
});
