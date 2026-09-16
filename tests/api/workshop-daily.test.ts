import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    company: { findFirst: vi.fn() },
    workshopDailyBook: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    workshopTransaction: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    expenseCategory: { findUnique: vi.fn() },
    expense: { create: vi.fn() },
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
    vi.clearAllMocks();
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

  it("POST requires an expense category for OUT", async () => {
    const res = await addTx(jsonRequest({ direction: "OUT", amount: 200, reason: "مستلزمات" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("CATEGORY_REQUIRED");
  });

  it("POST creates a pending entry and auto-opens the day", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue(null);
    mocks.prisma.workshopDailyBook.create.mockResolvedValue({ id: "book_1", bookDate: new Date() });
    mocks.prisma.expenseCategory.findUnique.mockResolvedValue({ id: "cat_1", companyId: "company3", name: "مستلزمات" });
    mocks.prisma.workshopTransaction.create.mockResolvedValue({ id: "tx_1", status: "PENDING" });
    const res = await addTx(
      jsonRequest({ direction: "OUT", amount: 200, categoryId: "cat_1", reason: "شراء مستلزمات للورشة" }),
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
    mocks.prisma.expenseCategory.findUnique.mockResolvedValue({ id: "cat_1", companyId: "company3", name: "مستلزمات" });
    const res = await addTx(
      jsonRequest({ direction: "OUT", amount: 200, categoryId: "cat_1", reason: "x" }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("PREVIOUS_DAY_OPEN");
  });

  it("confirm posts OUT as a company expense", async () => {
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
      category: { id: "cat_1", name: "مستلزمات" },
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

  it("confirm does not post IN entries to expenses", async () => {
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
    expect(mocks.prisma.expense.create).not.toHaveBeenCalled();
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
