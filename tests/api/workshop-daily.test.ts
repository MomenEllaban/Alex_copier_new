import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    company: { findFirst: vi.fn() },
    workshopDailyBook: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    workshopTransaction: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    expenseCategory: { findFirst: vi.fn(), create: vi.fn() },
    expense: { create: vi.fn(), findMany: vi.fn() },
    settlement: { create: vi.fn() },
    user: { findMany: vi.fn() },
  },
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  requireRole: mocks.requireRole,
}));

import { GET as getDaily, POST as addTx } from "@/app/api/workshop-daily/route";
import { POST as confirmTx } from "@/app/api/workshop-daily/[id]/confirm/route";
import { POST as rejectTx } from "@/app/api/workshop-daily/[id]/reject/route";
import { POST as closeDay } from "@/app/api/workshop-daily/close/route";
import { calcTotals } from "@/lib/workshop-daily";

const staff = { id: "u_workshop", role: "WORKSHOP_MANAGER" };
const accountant = { id: "u_acc", role: "ACCOUNTANT" };
const company = { id: "company3", name: "شركة القطاعي" };

const jsonRequest = (body: unknown) =>
  new Request("http://localhost/api/workshop-daily", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("workshop daily totals", () => {
  it("computes cashbox balance excluding rejected entries", () => {
    const totals = calcTotals([
      { direction: "IN", amount: 1000, status: "CONFIRMED" },
      { direction: "OUT", amount: 200, status: "CONFIRMED" },
      { direction: "OUT", amount: 150, status: "PENDING" },
      { direction: "OUT", amount: 9999, status: "REJECTED" },
    ]);
    expect(totals.inTotal).toBe(1000);
    expect(totals.outTotal).toBe(350);
    expect(totals.remaining).toBe(650);
    expect(totals.pendingCount).toBe(1);
    expect(totals.pendingAmount).toBe(150);
  });
});

describe("workshop daily API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.workshopTransaction.updateMany.mockResolvedValue({ count: 1 });
    mocks.requireAuth.mockResolvedValue(staff);
    mocks.requirePageAccess.mockResolvedValue(staff);
    mocks.requireRole.mockResolvedValue(null);
    mocks.prisma.company.findFirst.mockResolvedValue(company);
  });

  it("GET returns 500 when the Sectory company is missing", async () => {
    mocks.prisma.company.findFirst.mockResolvedValue(null);
    const res = await getDaily();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("WORKSHOP_COMPANY_NOT_FOUND");
  });

  it("POST validates amount and reason", async () => {
    const res = await addTx(jsonRequest({ direction: "OUT", amount: 0, reason: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("AMOUNT_INVALID");
    expect(mocks.prisma.workshopTransaction.create).not.toHaveBeenCalled();
  });

  it("POST auto-assigns the workshop expense category (no category needed in the form)", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue(null);
    mocks.prisma.workshopDailyBook.create.mockResolvedValue({ id: "book_1", bookDate: new Date() });
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat_ws", companyId: "company3", name: "يومية الورشة" });
    mocks.prisma.workshopTransaction.create.mockResolvedValue({ id: "tx_1", status: "PENDING" });
    const res = await addTx(jsonRequest({ direction: "OUT", amount: 200, reason: "شراء مستلزمات للورشة" }));
    expect(res.status).toBe(201);
    const arg = mocks.prisma.workshopTransaction.create.mock.calls[0][0];
    expect(arg.data.categoryId).toBe("cat_ws");
    expect(arg.data.amount).toBe(200);
    // The workshop category must belong to the Sectory company
    const catArg = mocks.prisma.expenseCategory.findFirst.mock.calls[0][0];
    expect(catArg.where).toEqual({ companyId: "company3", name: "يومية الورشة" });
  });

  it("POST creates the workshop category on first use", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue({ id: "book_1", bookDate: new Date() });
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue(null);
    mocks.prisma.expenseCategory.create.mockResolvedValue({ id: "cat_new", companyId: "company3", name: "يومية الورشة" });
    mocks.prisma.workshopTransaction.create.mockResolvedValue({ id: "tx_1", status: "PENDING" });
    const res = await addTx(jsonRequest({ direction: "OUT", amount: 50, reason: "لمبة" }));
    expect(res.status).toBe(201);
    const catArg = mocks.prisma.expenseCategory.create.mock.calls[0][0];
    expect(catArg.data.name).toBe("يومية الورشة");
    expect(catArg.data.companyId).toBe("company3");
    const txArg = mocks.prisma.workshopTransaction.create.mock.calls[0][0];
    expect(txArg.data.categoryId).toBe("cat_new");
  });

  it("POST creates a pending entry and auto-opens the day", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue(null);
    mocks.prisma.workshopDailyBook.create.mockResolvedValue({ id: "book_1", bookDate: new Date() });
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat_ws", companyId: "company3", name: "يومية الورشة" });
    mocks.prisma.workshopTransaction.create.mockResolvedValue({ id: "tx_1", status: "PENDING" });
    const res = await addTx(
      jsonRequest({ direction: "OUT", amount: 200, reason: "شراء مستلزمات للورشة" }),
    );
    expect(res.status).toBe(201);
    expect(mocks.prisma.workshopDailyBook.create).toHaveBeenCalledOnce();
    const arg = mocks.prisma.workshopTransaction.create.mock.calls[0][0];
    expect(arg.data.status).toBeUndefined();
    expect(arg.data.amount).toBe(200);
  });

  it("POST blocks new entries when a previous day is still open", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue({ id: "book_old", bookDate: yesterday });
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat_ws", companyId: "company3", name: "يومية الورشة" });
    const res = await addTx(
      jsonRequest({ direction: "OUT", amount: 200, reason: "x" }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("PREVIOUS_DAY_OPEN");
  });

  it("confirm posts OUT as a company expense under the workshop category", async () => {
    mocks.requireRole.mockResolvedValue(accountant);
    mocks.prisma.workshopTransaction.findUnique.mockResolvedValue({
      id: "tx_1",
      status: "PENDING",
      direction: "OUT",
      amount: 200,
      reason: "مستلزمات",
      companyId: "company3",
      createdBy: "u_workshop",
      categoryId: "cat_1",
      category: { id: "cat_1", name: "مستلزمات", companyId: "company3" },
      book: { id: "book_1", status: "OPEN" },
    });
    mocks.prisma.expense.create.mockResolvedValue({ id: "exp_1" });
    mocks.prisma.workshopTransaction.update.mockResolvedValue({ id: "tx_1", status: "CONFIRMED" });
    const res = await confirmTx(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "tx_1" }),
    });
    expect(res.status).toBe(200);
    const expArg = mocks.prisma.expense.create.mock.calls[0][0];
    expect(expArg.data.companyId).toBe("company3");
    expect(expArg.data.amount).toBe(200);
    expect(expArg.data.category).toBe("مستلزمات");
    const updArg = mocks.prisma.workshopTransaction.update.mock.calls[0][0];
    expect(updArg.data.status).toBe("CONFIRMED");
    expect(updArg.data.expenseId).toBe("exp_1");
  });

  it("confirm creates the workshop category for legacy OUT entries missing one", async () => {
    mocks.requireRole.mockResolvedValue(accountant);
    mocks.prisma.workshopTransaction.findUnique.mockResolvedValue({
      id: "tx_legacy",
      status: "PENDING",
      direction: "OUT",
      amount: 75,
      reason: "بند قديم",
      companyId: "company3",
      createdBy: "u_workshop",
      categoryId: null,
      category: null,
      book: { id: "book_1", status: "OPEN" },
    });
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat_ws", companyId: "company3", name: "يومية الورشة" });
    mocks.prisma.expense.create.mockResolvedValue({ id: "exp_2" });
    mocks.prisma.workshopTransaction.update.mockResolvedValue({ id: "tx_legacy", status: "CONFIRMED" });
    const res = await confirmTx(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "tx_legacy" }),
    });
    expect(res.status).toBe(200);
    const expArg = mocks.prisma.expense.create.mock.calls[0][0];
    expect(expArg.data.categoryId).toBe("cat_ws");
    expect(expArg.data.category).toBe("يومية الورشة");
    expect(expArg.data.companyId).toBe("company3");
  });

  it("confirm posts IN only to the cashbox (no expense, no settlement)", async () => {
    mocks.requireRole.mockResolvedValue(accountant);
    mocks.prisma.workshopTransaction.findUnique.mockResolvedValue({
      id: "tx_2",
      status: "PENDING",
      direction: "IN",
      amount: 1000,
      reason: "تمويل",
      companyId: "company3",
      createdBy: "u_workshop",
      categoryId: null,
      category: null,
      book: { id: "book_1", status: "OPEN" },
    });
    mocks.prisma.workshopTransaction.update.mockResolvedValue({ id: "tx_2", status: "CONFIRMED" });
    const res = await confirmTx(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "tx_2" }),
    });
    expect(res.status).toBe(200);
    // IN must NOT create an expense or a settlement — it stays inside the daily cashbox
    expect(mocks.prisma.expense.create).not.toHaveBeenCalled();
    expect(mocks.prisma.settlement.create).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.postedToBooks).toBe(false);
  });

  it.each(["CONFIRMED", "REJECTED"])("does not post an already %s entry", async (status) => {
    mocks.requireRole.mockResolvedValue(accountant);
    mocks.prisma.workshopTransaction.findUnique.mockResolvedValue({ status });
    const res = await confirmTx(jsonRequest({}), { params: Promise.resolve({ id: "tx_1" }) });
    expect(res.status).toBe(409);
    expect(mocks.prisma.expense.create).not.toHaveBeenCalled();
    expect(mocks.prisma.workshopTransaction.updateMany).not.toHaveBeenCalled();
  });

  it("does not post when another request already claimed the entry", async () => {
    mocks.requireRole.mockResolvedValue(accountant);
    mocks.prisma.workshopTransaction.findUnique.mockResolvedValue({ status: "PENDING", book: { status: "OPEN" } });
    mocks.prisma.workshopTransaction.updateMany.mockResolvedValue({ count: 0 });
    const res = await confirmTx(jsonRequest({}), { params: Promise.resolve({ id: "tx_1" }) });
    expect(res.status).toBe(409);
    expect(mocks.prisma.expense.create).not.toHaveBeenCalled();
    expect(mocks.prisma.workshopTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: "tx_1", status: "PENDING", book: { status: "OPEN" } },
      data: { status: "CONFIRMED", confirmedBy: accountant.id, confirmedAt: expect.any(Date) },
    });
  });

  it("confirm is forbidden for workshop staff", async () => {
    mocks.requireRole.mockResolvedValue(null);
    const res = await confirmTx(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "tx_1" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("CONFIRM_FORBIDDEN");
  });

  it("reject requires a reason", async () => {
    mocks.requireRole.mockResolvedValue(accountant);
    mocks.prisma.workshopTransaction.findUnique.mockResolvedValue({
      id: "tx_1",
      status: "PENDING",
      book: { id: "book_1", status: "OPEN" },
    });
    const res = await rejectTx(jsonRequest({}), { params: Promise.resolve({ id: "tx_1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("REJECT_REASON_REQUIRED");
  });

  it("close is blocked while pending entries exist", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue({
      id: "book_1",
      transactions: [
        { direction: "IN", amount: 1000, status: "CONFIRMED" },
        { direction: "OUT", amount: 200, status: "PENDING" },
      ],
    });
    const res = await closeDay(jsonRequest({ handoverTo: "الخزينة الرئيسية" }), );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("PENDING_EXIST");
    expect(mocks.prisma.workshopDailyBook.update).not.toHaveBeenCalled();
  });

  it("close hands over the remaining balance", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue({
      id: "book_1",
      transactions: [
        { direction: "IN", amount: 1000, status: "CONFIRMED" },
        { direction: "OUT", amount: 200, status: "CONFIRMED" },
      ],
    });
    mocks.prisma.workshopDailyBook.update.mockResolvedValue({ id: "book_1", status: "CLOSED" });
    const res = await closeDay(jsonRequest({ handoverTo: "الخزينة الرئيسية" }));
    expect(res.status).toBe(200);
    const arg = mocks.prisma.workshopDailyBook.update.mock.calls[0][0];
    expect(arg.data.status).toBe("CLOSED");
    expect(arg.data.handoverAmount).toBe(800);
    expect(arg.data.handoverTo).toBe("الخزينة الرئيسية");
  });
});
