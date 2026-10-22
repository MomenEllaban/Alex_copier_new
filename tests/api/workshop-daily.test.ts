import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    company: { findFirst: vi.fn() },
    workshopDailyBook: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    workshopTransaction: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    expenseCategory: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
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
  // Action guards delegate to the page guard: these tests decide who is
  // allowed, not which action, and the page answer is what they mean.
  requireAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyAction: (page: string) => mocks.requirePageAccess(page),
  requireRole: mocks.requireRole,
}));

import { GET as getDaily, POST as addTx } from "@/app/api/workshop-daily/route";
import { PUT as editTx, DELETE as deleteTx } from "@/app/api/workshop-daily/[id]/route";
import { POST as confirmTx } from "@/app/api/workshop-daily/[id]/confirm/route";
import { POST as rejectTx } from "@/app/api/workshop-daily/[id]/reject/route";
import { POST as closeDay } from "@/app/api/workshop-daily/close/route";
import { addDays, calcTotals, startOfDay, weekStart } from "@/lib/workshop-daily";

const staff = { id: "u_workshop", role: "WORKSHOP_MANAGER" };
const accountant = { id: "u_acc", role: "ACCOUNTANT" };
const company = { id: "company3", name: "شركة القطاعي" };

const jsonRequest = (body: unknown) =>
  new Request("http://localhost/api/workshop-daily", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const getRequest = () => new Request("http://localhost/api/workshop-daily");

const methodRequest = (method: string, body?: unknown) =>
  new Request("http://localhost/api/workshop-daily", {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const txParams = (id: string) => ({ params: Promise.resolve({ id }) });

const pendingTx = (overrides: Record<string, unknown> = {}) => ({
  id: "tx_1",
  companyId: "company3",
  createdBy: "u_workshop",
  status: "PENDING",
  categoryId: null,
  book: { status: "OPEN" },
  ...overrides,
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
    mocks.prisma.workshopDailyBook.count.mockResolvedValue(0);
    mocks.prisma.workshopDailyBook.findMany.mockResolvedValue([]);
    mocks.prisma.expenseCategory.findMany.mockResolvedValue([]);
    mocks.prisma.user.findMany.mockResolvedValue([]);
  });

  it("GET returns 500 when the Sectory company is missing", async () => {
    mocks.prisma.company.findFirst.mockResolvedValue(null);
    const res = await getDaily(getRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("WORKSHOP_COMPANY_NOT_FOUND");
  });

  it("GET returns the categories the workshop files its entries under", async () => {
    mocks.prisma.expenseCategory.findMany.mockResolvedValue([{ id: "cat_1", name: "كهرباء" }]);
    const res = await getDaily(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toEqual([{ id: "cat_1", name: "كهرباء" }]);
  });

  describe("the day log pages by the workshop week", () => {
    const today = startOfDay(new Date());
    const currentWeekStart = weekStart(today);

    const book = (id: string, bookDate: Date, status: string) => ({
      id,
      bookDate,
      status,
      closedAt: status === "CLOSED" ? bookDate : null,
      handoverAmount: status === "CLOSED" ? 100 : null,
      handoverTo: status === "CLOSED" ? "الخزينة الرئيسية" : null,
      transactions: [{ direction: "IN", amount: 100, status: "CONFIRMED" }],
    });

    const thisWeek = book("book_this", currentWeekStart, "CLOSED");
    const lastWeekOpen = book("book_open", addDays(currentWeekStart, -7), "OPEN");
    const olderWeek = book("book_old", addDays(currentWeekStart, -14), "CLOSED");

    beforeEach(() => {
      mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue(null);
      mocks.prisma.workshopDailyBook.findMany.mockImplementation(
        async (args: { select?: unknown; where?: { status?: string } }) => {
          // The list of every day's date, used to count the weeks.
          if (args?.select) return [thisWeek, lastWeekOpen, olderWeek].map((b) => ({ bookDate: b.bookDate }));
          // The days that are still open.
          if (args?.where?.status === "OPEN") return [lastWeekOpen];
          // The days of the requested week.
          return [thisWeek];
        },
      );
    });

    it("returns the days of the requested week", async () => {
      const res = await getDaily(new Request("http://localhost/api/workshop-daily?weekIndex=1"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.days.map((d: { id: string }) => d.id)).toEqual(["book_this"]);
      expect(body.weekIndex).toBe(1);
      expect(body.weeksTotal).toBe(3);
      expect(body.weekStart).toBe(currentWeekStart.toISOString());
    });

    it("keeps the day that was left open visible even in another week", async () => {
      const res = await getDaily(new Request("http://localhost/api/workshop-daily?weekIndex=1"));
      const body = await res.json();
      expect(body.openDays.map((d: { id: string }) => d.id)).toEqual(["book_open"]);
    });

    it("counts the weeks the log holds", async () => {
      const res = await getDaily(new Request("http://localhost/api/workshop-daily?weekIndex=1"));
      const body = await res.json();
      expect(body.daysTotal).toBe(3);
      expect(body.weeksTotal).toBe(3);
    });

    it("never asks for a week past the last one that holds days", async () => {
      const res = await getDaily(new Request("http://localhost/api/workshop-daily?weekIndex=99"));
      const body = await res.json();
      expect(body.weekIndex).toBe(3);
    });
  });

  it("POST validates amount and reason", async () => {
    const res = await addTx(jsonRequest({ direction: "OUT", amount: 0, reason: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("AMOUNT_INVALID");
    expect(mocks.prisma.workshopTransaction.create).not.toHaveBeenCalled();
  });

  it("POST files the entry under the category the user picked", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue(null);
    mocks.prisma.workshopDailyBook.create.mockResolvedValue({ id: "book_1", bookDate: new Date() });
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat_elec", companyId: "company3", name: "كهرباء" });
    mocks.prisma.workshopTransaction.create.mockResolvedValue({ id: "tx_1", status: "PENDING" });
    const res = await addTx(
      jsonRequest({ direction: "OUT", amount: 200, reason: "فاتورة كهرباء", categoryId: "cat_elec" }),
    );
    expect(res.status).toBe(201);
    const arg = mocks.prisma.workshopTransaction.create.mock.calls[0][0];
    expect(arg.data.categoryId).toBe("cat_elec");
    // The category must belong to the Sectory company
    const catArg = mocks.prisma.expenseCategory.findFirst.mock.calls[0][0];
    expect(catArg.where).toEqual({ id: "cat_elec", companyId: "company3" });
  });

  it("POST leaves an entry without a category uncategorised — no placeholder category", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue(null);
    mocks.prisma.workshopDailyBook.create.mockResolvedValue({ id: "book_1", bookDate: new Date() });
    mocks.prisma.workshopTransaction.create.mockResolvedValue({ id: "tx_1", status: "PENDING" });
    const res = await addTx(jsonRequest({ direction: "OUT", amount: 50, reason: "لمبة" }));
    expect(res.status).toBe(201);
    const txArg = mocks.prisma.workshopTransaction.create.mock.calls[0][0];
    expect(txArg.data.categoryId).toBeNull();
    expect(mocks.prisma.expenseCategory.create).not.toHaveBeenCalled();
  });

  it("POST rejects a category that does not belong to the workshop company", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue(null);
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue(null);
    const res = await addTx(
      jsonRequest({ direction: "OUT", amount: 50, reason: "لمبة", categoryId: "cat_other" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("CATEGORY_INVALID");
    expect(mocks.prisma.workshopTransaction.create).not.toHaveBeenCalled();
  });

  it("POST creates a pending entry and auto-opens the day", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue(null);
    mocks.prisma.workshopDailyBook.create.mockResolvedValue({ id: "book_1", bookDate: new Date() });
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

  it("POST books the entry on the day the user picked", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue(null);
    mocks.prisma.workshopDailyBook.create.mockResolvedValue({ id: "book_old", bookDate: new Date(2025, 0, 5) });
    mocks.prisma.workshopTransaction.create.mockResolvedValue({ id: "tx_1", status: "PENDING" });
    const res = await addTx(
      jsonRequest({ direction: "OUT", amount: 200, reason: "نسيت أضيفها", bookDate: "2025-01-05" }),
    );
    expect(res.status).toBe(201);
    const arg = mocks.prisma.workshopDailyBook.create.mock.calls[0][0];
    expect(arg.data.bookDate).toEqual(new Date(2025, 0, 5));
  });

  it("POST reopens a closed day so a back-dated entry can be confirmed", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue({
      id: "book_old",
      status: "CLOSED",
      bookDate: new Date(2025, 0, 5),
    });
    mocks.prisma.workshopDailyBook.update.mockResolvedValue({
      id: "book_old",
      status: "OPEN",
      bookDate: new Date(2025, 0, 5),
    });
    mocks.prisma.workshopTransaction.create.mockResolvedValue({ id: "tx_1", status: "PENDING" });
    const res = await addTx(
      jsonRequest({ direction: "OUT", amount: 200, reason: "نسيت أضيفها", bookDate: "2025-01-05" }),
    );
    expect(res.status).toBe(201);
    const updateArg = mocks.prisma.workshopDailyBook.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe("OPEN");
    const body = await res.json();
    expect(body.reopened).toBe(true);
  });

  it("POST refuses a future date", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    const key = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
    const res = await addTx(jsonRequest({ direction: "OUT", amount: 200, reason: "x", bookDate: key }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("FUTURE_DATE_NOT_ALLOWED");
  });

  it("POST rejects an unparseable date", async () => {
    const res = await addTx(jsonRequest({ direction: "OUT", amount: 200, reason: "x", bookDate: "05/01/2025" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("DATE_INVALID");
    expect(mocks.prisma.workshopTransaction.create).not.toHaveBeenCalled();
  });

  it("confirm posts OUT as a company expense under the chosen category", async () => {
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
    expect(expArg.data.categoryId).toBe("cat_1");
    const updArg = mocks.prisma.workshopTransaction.update.mock.calls[0][0];
    expect(updArg.data.status).toBe("CONFIRMED");
    expect(updArg.data.expenseId).toBe("exp_1");
  });

  it("confirm posts an uncategorised OUT entry without inventing a placeholder category", async () => {
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
    mocks.prisma.expense.create.mockResolvedValue({ id: "exp_2" });
    mocks.prisma.workshopTransaction.update.mockResolvedValue({ id: "tx_legacy", status: "CONFIRMED" });
    const res = await confirmTx(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "tx_legacy" }),
    });
    expect(res.status).toBe(200);
    const expArg = mocks.prisma.expense.create.mock.calls[0][0];
    expect(expArg.data.categoryId).toBeNull();
    expect(expArg.data.category).toBe("غير مصنف");
    expect(expArg.data.companyId).toBe("company3");
    expect(mocks.prisma.expenseCategory.create).not.toHaveBeenCalled();
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

  it("close can be aimed at one day from the day list", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue({
      id: "book_2",
      transactions: [{ direction: "IN", amount: 500, status: "CONFIRMED" }],
    });
    mocks.prisma.workshopDailyBook.update.mockResolvedValue({ id: "book_2", status: "CLOSED" });
    const res = await closeDay(jsonRequest({ handoverTo: "الخزينة الرئيسية", bookId: "book_2" }));
    expect(res.status).toBe(200);
    const findArg = mocks.prisma.workshopDailyBook.findFirst.mock.calls[0][0];
    expect(findArg.where).toMatchObject({ id: "book_2", status: "OPEN" });
    const arg = mocks.prisma.workshopDailyBook.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "book_2" });
    expect(arg.data.handoverAmount).toBe(500);
  });

  describe("edit and delete pending entries", () => {
    it("PUT edits a pending entry and files it under the chosen category", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx());
      mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat_elec", companyId: "company3", name: "كهرباء" });
      const res = await editTx(
        methodRequest("PUT", { direction: "OUT", amount: 350, reason: "مستلزمات محدثة", categoryId: "cat_elec" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(200);
      expect(mocks.prisma.workshopTransaction.updateMany).toHaveBeenCalledWith({
        where: { id: "tx_1", status: "PENDING", book: { status: "OPEN" } },
        data: {
          direction: "OUT",
          amount: 350,
          reason: "مستلزمات محدثة",
          categoryId: "cat_elec",
          revenueType: null,
          customerId: null,
        },
      });
    });

    it("PUT clears the category when the user removes it", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx({ categoryId: "cat_old" }));
      const res = await editTx(
        methodRequest("PUT", { direction: "OUT", amount: 350, reason: "تصحيح", categoryId: "" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(200);
      expect(mocks.prisma.workshopTransaction.updateMany).toHaveBeenCalledWith({
        where: { id: "tx_1", status: "PENDING", book: { status: "OPEN" } },
        data: expect.objectContaining({ categoryId: null }),
      });
    });

    it("PUT keeps the category when the payload does not mention one", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx({ categoryId: "cat_old" }));
      const res = await editTx(
        methodRequest("PUT", { direction: "OUT", amount: 350, reason: "تصحيح" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(200);
      expect(mocks.prisma.expenseCategory.findFirst).not.toHaveBeenCalled();
      expect(mocks.prisma.workshopTransaction.updateMany).toHaveBeenCalledWith({
        where: { id: "tx_1", status: "PENDING", book: { status: "OPEN" } },
        data: expect.objectContaining({ categoryId: "cat_old" }),
      });
    });

    it("PUT rejects a category that does not belong to the workshop company", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx());
      mocks.prisma.expenseCategory.findFirst.mockResolvedValue(null);
      const res = await editTx(
        methodRequest("PUT", { direction: "OUT", amount: 350, reason: "تصحيح", categoryId: "cat_other" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("CATEGORY_INVALID");
      expect(mocks.prisma.workshopTransaction.updateMany).not.toHaveBeenCalled();
    });

    it("PUT clears the category when switching an entry to IN", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx({ categoryId: "cat_old" }));
      const res = await editTx(
        methodRequest("PUT", { direction: "IN", amount: 100, reason: "تمويل", revenueType: "SERVICE_REVENUE" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(200);
      expect(mocks.prisma.expenseCategory.findFirst).not.toHaveBeenCalled();
      expect(mocks.prisma.workshopTransaction.updateMany).toHaveBeenCalledWith({
        where: { id: "tx_1", status: "PENDING", book: { status: "OPEN" } },
        data: {
          direction: "IN",
          amount: 100,
          reason: "تمويل",
          categoryId: null,
          revenueType: "SERVICE_REVENUE",
          customerId: null,
        },
      });
    });

    it("PUT requires a revenue type for IN entries", async () => {
      const res = await editTx(
        methodRequest("PUT", { direction: "IN", amount: 100, reason: "تمويل" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("REVENUE_TYPE_REQUIRED");
      expect(mocks.prisma.workshopTransaction.updateMany).not.toHaveBeenCalled();
    });

    it("PUT requires a customer for cash-collection entries", async () => {
      const res = await editTx(
        methodRequest("PUT", { direction: "IN", amount: 100, reason: "تحصيل", revenueType: "CASH_COLLECTION" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("CASH_COLLECTION_CUSTOMER_REQUIRED");
      expect(mocks.prisma.workshopTransaction.updateMany).not.toHaveBeenCalled();
    });

    it("PUT validates the amount and reason", async () => {
      const res = await editTx(
        methodRequest("PUT", { direction: "OUT", amount: 0, reason: "" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("AMOUNT_INVALID");
      expect(mocks.prisma.workshopTransaction.updateMany).not.toHaveBeenCalled();
    });

    it("PUT rejects entries that are not pending", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx({ status: "CONFIRMED" }));
      const res = await editTx(
        methodRequest("PUT", { direction: "OUT", amount: 10, reason: "x" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("ALREADY_HANDLED");
      expect(mocks.prisma.workshopTransaction.updateMany).not.toHaveBeenCalled();
    });

    it("PUT rejects entries on a closed book", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx({ book: { status: "CLOSED" } }));
      const res = await editTx(
        methodRequest("PUT", { direction: "OUT", amount: 10, reason: "x" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("BOOK_CLOSED");
    });

    it("PUT returns 404 for a missing entry", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(null);
      const res = await editTx(
        methodRequest("PUT", { direction: "OUT", amount: 10, reason: "x" }),
        txParams("tx_missing"),
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("WORKSHOP_TX_NOT_FOUND");
    });

    it("PUT forbids editing someone else's entry without a finance role", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx({ createdBy: "u_other" }));
      const res = await editTx(
        methodRequest("PUT", { direction: "OUT", amount: 10, reason: "x" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("MODIFY_FORBIDDEN");
      expect(mocks.prisma.workshopTransaction.updateMany).not.toHaveBeenCalled();
    });

    it("PUT lets a finance user edit any pending entry", async () => {
      mocks.requirePageAccess.mockResolvedValue(accountant);
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx({ createdBy: "u_other" }));
      mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat_elec", companyId: "company3", name: "كهرباء" });
      const res = await editTx(
        methodRequest("PUT", { direction: "OUT", amount: 10, reason: "تصحيح", categoryId: "cat_elec" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(200);
      expect(mocks.prisma.workshopTransaction.updateMany).toHaveBeenCalledOnce();
    });

    it("PUT reports a conflict when the entry is claimed before the write", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx());
      mocks.prisma.workshopTransaction.updateMany.mockResolvedValue({ count: 0 });
      const res = await editTx(
        methodRequest("PUT", { direction: "OUT", amount: 10, reason: "x" }),
        txParams("tx_1"),
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("ALREADY_HANDLED");
    });

    it("DELETE removes a pending entry the user created", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx());
      mocks.prisma.workshopTransaction.deleteMany.mockResolvedValue({ count: 1 });
      const res = await deleteTx(methodRequest("DELETE"), txParams("tx_1"));
      expect(res.status).toBe(200);
      expect(mocks.prisma.workshopTransaction.deleteMany).toHaveBeenCalledWith({
        where: { id: "tx_1", status: "PENDING", book: { status: "OPEN" } },
      });
    });

    it("DELETE forbids removing someone else's entry without a finance role", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx({ createdBy: "u_other" }));
      const res = await deleteTx(methodRequest("DELETE"), txParams("tx_1"));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("MODIFY_FORBIDDEN");
      expect(mocks.prisma.workshopTransaction.deleteMany).not.toHaveBeenCalled();
    });

    it("DELETE refuses confirmed entries", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(pendingTx({ status: "CONFIRMED" }));
      const res = await deleteTx(methodRequest("DELETE"), txParams("tx_1"));
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("ALREADY_HANDLED");
      expect(mocks.prisma.workshopTransaction.deleteMany).not.toHaveBeenCalled();
    });

    it("DELETE returns 404 for a missing entry", async () => {
      mocks.prisma.workshopTransaction.findUnique.mockResolvedValue(null);
      const res = await deleteTx(methodRequest("DELETE"), txParams("tx_missing"));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("WORKSHOP_TX_NOT_FOUND");
    });
  });
});
