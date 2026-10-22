import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    company: { findFirst: vi.fn() },
    expenseCategory: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    workshopTransaction: { count: vi.fn() },
    expense: { count: vi.fn() },
    workshopDailyBook: { findFirst: vi.fn() },
    user: { findMany: vi.fn() },
  },
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  requireAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyAction: (page: string) => mocks.requirePageAccess(page),
}));

import { GET as listCategories, POST as createCategory } from "@/app/api/workshop-daily/categories/route";
import { PUT as updateCategory, DELETE as deleteCategory } from "@/app/api/workshop-daily/categories/[id]/route";
import { GET as getDay } from "@/app/api/workshop-daily/books/[id]/route";

const manager = { id: "u_1", role: "WORKSHOP_MANAGER" };
const company = { id: "company3", name: "شركة القطاعي" };

const jsonRequest = (body: unknown) =>
  new Request("http://localhost/api/workshop-daily/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("workshop daily categories API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAuth.mockResolvedValue(manager);
    mocks.requirePageAccess.mockResolvedValue(manager);
    mocks.prisma.company.findFirst.mockResolvedValue(company);
    mocks.prisma.expenseCategory.findMany.mockResolvedValue([]);
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue(null);
    mocks.prisma.workshopTransaction.count.mockResolvedValue(0);
    mocks.prisma.expense.count.mockResolvedValue(0);
  });

  it("GET returns the company categories", async () => {
    mocks.prisma.expenseCategory.findMany.mockResolvedValue([{ id: "cat_1", name: "كهرباء" }]);
    const res = await listCategories();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: "cat_1", name: "كهرباء" }]);
    const arg = mocks.prisma.expenseCategory.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ companyId: "company3" });
  });

  it("POST creates a category for the workshop company", async () => {
    mocks.prisma.expenseCategory.create.mockResolvedValue({ id: "cat_1", name: "مياه" });
    const res = await createCategory(jsonRequest({ name: "  مياه  " }));
    expect(res.status).toBe(201);
    const arg = mocks.prisma.expenseCategory.create.mock.calls[0][0];
    expect(arg.data).toEqual({ name: "مياه", companyId: "company3" });
  });

  it("POST rejects an empty name", async () => {
    const res = await createCategory(jsonRequest({ name: "   " }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("CATEGORY_NAME_REQUIRED");
    expect(mocks.prisma.expenseCategory.create).not.toHaveBeenCalled();
  });

  it("POST refuses a duplicate name", async () => {
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat_1" });
    const res = await createCategory(jsonRequest({ name: "مياه" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("CATEGORY_EXISTS");
    expect(mocks.prisma.expenseCategory.create).not.toHaveBeenCalled();
  });

  it("PUT renames a category", async () => {
    mocks.prisma.expenseCategory.findFirst
      .mockResolvedValueOnce({ id: "cat_1" })
      .mockResolvedValueOnce(null);
    mocks.prisma.expenseCategory.update.mockResolvedValue({ id: "cat_1", name: "مياه وصرف" });
    const res = await updateCategory(jsonRequest({ name: "مياه وصرف" }), idParams("cat_1"));
    expect(res.status).toBe(200);
    const arg = mocks.prisma.expenseCategory.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "cat_1" });
    expect(arg.data).toEqual({ name: "مياه وصرف" });
  });

  it("PUT returns 404 for a category of another company", async () => {
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue(null);
    const res = await updateCategory(jsonRequest({ name: "مياه" }), idParams("cat_1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("CATEGORY_NOT_FOUND");
    expect(mocks.prisma.expenseCategory.update).not.toHaveBeenCalled();
  });

  it("DELETE removes a category that is not used", async () => {
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat_1" });
    mocks.prisma.expenseCategory.delete.mockResolvedValue({ id: "cat_1" });
    const res = await deleteCategory(
      new Request("http://localhost/x", { method: "DELETE" }),
      idParams("cat_1"),
    );
    expect(res.status).toBe(200);
    expect(mocks.prisma.expenseCategory.delete).toHaveBeenCalledWith({ where: { id: "cat_1" } });
  });

  it("DELETE refuses a category that entries are filed under", async () => {
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat_1" });
    mocks.prisma.workshopTransaction.count.mockResolvedValue(3);
    const res = await deleteCategory(
      new Request("http://localhost/x", { method: "DELETE" }),
      idParams("cat_1"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("CATEGORY_IN_USE");
    expect(mocks.prisma.expenseCategory.delete).not.toHaveBeenCalled();
  });

  it("DELETE refuses a category that expenses are filed under", async () => {
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat_1" });
    mocks.prisma.expense.count.mockResolvedValue(1);
    const res = await deleteCategory(
      new Request("http://localhost/x", { method: "DELETE" }),
      idParams("cat_1"),
    );
    expect(res.status).toBe(409);
    expect(mocks.prisma.expenseCategory.delete).not.toHaveBeenCalled();
  });
});

describe("workshop daily day details API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAuth.mockResolvedValue(manager);
    mocks.requirePageAccess.mockResolvedValue(manager);
    mocks.prisma.company.findFirst.mockResolvedValue(company);
    mocks.prisma.user.findMany.mockResolvedValue([]);
  });

  it("returns the movements of the day with their totals", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue({
      id: "b_1",
      companyId: "company3",
      bookDate: new Date(2025, 0, 5),
      status: "CLOSED",
      closedAt: new Date(2025, 0, 5, 18),
      handoverAmount: 300,
      handoverTo: "الخزينة الرئيسية",
      handoverNote: null,
      openedBy: "u_1",
      transactions: [
        {
          id: "t_1",
          direction: "IN",
          amount: 500,
          status: "CONFIRMED",
          reason: "تحصيل",
          createdBy: "u_1",
          confirmedBy: null,
          category: null,
          customer: null,
        },
        {
          id: "t_2",
          direction: "OUT",
          amount: 200,
          status: "CONFIRMED",
          reason: "قطع غيار",
          createdBy: "u_1",
          confirmedBy: "u_2",
          category: { id: "cat_1", name: "قطع غيار" },
          customer: null,
        },
      ],
    });
    const res = await getDay(new Request("http://localhost/x"), idParams("b_1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals.inTotal).toBe(500);
    expect(body.totals.outTotal).toBe(200);
    expect(body.totals.remaining).toBe(300);
    expect(body.transactions).toHaveLength(2);
    expect(body.transactions[1].category.name).toBe("قطع غيار");
  });

  it("returns 404 for a day that is not the workshop's", async () => {
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue(null);
    const res = await getDay(new Request("http://localhost/x"), idParams("b_1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("BOOK_NOT_FOUND");
  });
});
