import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Paying the employees of a locked payroll run.
 *
 * Locking books the accrual; the disbursement is the second entry that moves
 * the money out of the treasury. Only the net amount is paid — the insurance,
 * the tax, the advances and the loan recovery stay open as liabilities.
 */

const mocks = vi.hoisted(() => {
  const tx = {
    journalEntry: { create: vi.fn() },
    payrollRun: { update: vi.fn() },
    approvalLog: { create: vi.fn() },
  };
  const db = {
    payrollRun: { findUnique: vi.fn() },
    account: { findFirst: vi.fn(), findMany: vi.fn() },
    journalEntry: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { db, tx, validatePayrollAccountMapping: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/services/hr/hr-settings-service", () => ({
  validatePayrollAccountMapping: mocks.validatePayrollAccountMapping,
}));

import { disbursePayrollRun } from "@/lib/services/hr/payroll-service";

const lockedRun = {
  id: "pr1",
  companyId: "c1",
  status: "LOCKED",
  totalGross: 10000,
  totalDeductions: 1500,
  totalNet: 8500,
  totalCompanyInsurance: 500,
  disbursedAt: null,
  Period: { id: "per1", month: 8, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31") },
};

const accountIds = {
  payrollExpense: "acc-payroll",
  salariesPayable: "acc-salaries",
  treasury: "acc-treasury",
  advances: "acc-advances",
  loans: "acc-loans",
  socialInsurance: "acc-insurance",
  taxAuthority: "acc-tax",
};

describe("disbursePayrollRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePayrollAccountMapping.mockResolvedValue({
      isValid: true,
      missingAccounts: [],
      accountIds,
    });
    mocks.db.payrollRun.findUnique.mockResolvedValue(lockedRun);
    mocks.db.account.findFirst.mockResolvedValue({ id: "acc-treasury", name: "البنك" });
    mocks.tx.journalEntry.create.mockResolvedValue({ id: "je1" });
    mocks.tx.payrollRun.update.mockResolvedValue({ ...lockedRun, totalPaid: 8500 });
    mocks.tx.approvalLog.create.mockResolvedValue({ id: "log1" });
  });

  it("refuses a run that is not locked", async () => {
    mocks.db.payrollRun.findUnique.mockResolvedValue({ ...lockedRun, status: "APPROVED" });

    await expect(disbursePayrollRun({ runId: "pr1", actorId: "u1" })).rejects.toThrow();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a run that was already paid", async () => {
    mocks.db.payrollRun.findUnique.mockResolvedValue({
      ...lockedRun,
      disbursedAt: new Date("2026-08-10"),
    });

    await expect(disbursePayrollRun({ runId: "pr1", actorId: "u1" })).rejects.toThrow();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses when the payroll accounts are not mapped", async () => {
    mocks.validatePayrollAccountMapping.mockResolvedValue({
      isValid: false,
      missingAccounts: ["حساب الخزينة / البنك"],
      accountIds: {},
    });

    await expect(disbursePayrollRun({ runId: "pr1", actorId: "u1" })).rejects.toThrow();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a treasury account that belongs to another company", async () => {
    mocks.db.account.findFirst.mockResolvedValue(null);

    await expect(disbursePayrollRun({ runId: "pr1", actorId: "u1" })).rejects.toThrow();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.db.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc-treasury", companyId: "c1", isActive: true },
      }),
    );
  });

  it("pays the net amount: debit salaries payable, credit the treasury", async () => {
    await disbursePayrollRun({ runId: "pr1", actorId: "u1" });

    const entry = mocks.tx.journalEntry.create.mock.calls[0][0].data;
    expect(entry.companyId).toBe("c1");
    expect(entry.referenceType).toBe("PayrollDisbursement");
    expect(entry.referenceId).toBe("pr1");
    expect(entry.entryNumber).toContain("JV-PAYOUT-2026-08");

    const items = entry.items.create;
    expect(items).toHaveLength(2);
    const debit = items.find((i: { debit: number }) => i.debit > 0);
    const credit = items.find((i: { credit: number }) => i.credit > 0);
    expect(debit).toMatchObject({ accountId: "acc-salaries", debit: 8500, credit: 0 });
    expect(credit).toMatchObject({ accountId: "acc-treasury", debit: 0, credit: 8500 });
    // The entry has to balance.
    expect(debit.debit).toBe(credit.credit);
  });

  it("marks the run as paid and writes the approval trail", async () => {
    await disbursePayrollRun({ runId: "pr1", actorId: "u1" });

    const update = mocks.tx.payrollRun.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "pr1" });
    expect(update.data.totalPaid).toBe(8500);
    expect(update.data.disbursedBy).toBe("u1");
    expect(update.data.treasuryAccountId).toBe("acc-treasury");
    expect(update.data.disbursementJournalEntryId).toBe("je1");
    expect(update.data.disbursedAt).toBeInstanceOf(Date);

    const log = mocks.tx.approvalLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ userId: "u1", action: "DISBURSE", entityType: "PayrollRun", entityId: "pr1" });
  });
});
