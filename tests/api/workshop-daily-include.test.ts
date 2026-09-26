import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `WorkshopTransaction.createdBy` / `confirmedBy` are plain `String` columns, not
 * relations. Prisma rejects an `include` that names a scalar field, and it does
 * so at query time — so the route's catch-all turned it into a 500 and the
 * /workshop-daily page could not load. These tests pin the include shape so the
 * mistake cannot come back.
 */
const mocks = vi.hoisted(() => ({
  prisma: {
    company: { findFirst: vi.fn() },
    workshopDailyBook: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    workshopTransaction: { create: vi.fn() },
    user: { findMany: vi.fn() },
    expenseCategory: { findFirst: vi.fn() },
  },
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  // Action guards delegate to the page guard: these tests decide who is
  // allowed, not which action, and the page answer is what they mean.
  requireAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyAction: (page: string) => mocks.requirePageAccess(page),
}));

import { GET as getDailyBook, POST as addTransaction } from "@/app/api/workshop-daily/route";

const manager = { id: "gm_1", role: "GENERAL_MANAGER" };

/** Mirrors the real Prisma guard: `include` only accepts relation fields. */
function assertOnlyRelations(
  include: Record<string, unknown>,
  scalarFields: string[],
  model: string,
) {
  for (const field of Object.keys(include)) {
    if (scalarFields.includes(field)) {
      throw new Error(
        `Invalid scalar field \`${field}\` for include statement on model ${model}.`,
      );
    }
  }
}

const SCALARS = ["createdBy", "confirmedBy", "amount", "reason", "status", "bookId", "companyId"];

describe("workshop-daily include shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(manager);
    mocks.requirePageAccess.mockResolvedValue(manager);
    mocks.prisma.company.findFirst.mockResolvedValue({ id: "company3", name: "شركة القطاعي" });
    mocks.prisma.user.findMany.mockResolvedValue([]);
    mocks.prisma.workshopDailyBook.findMany.mockResolvedValue([]);
  });

  it("GET names no scalar field in the transaction include", async () => {
    const tx = { id: "t1", direction: "IN", amount: 10, status: "PENDING", createdBy: "gm_1", confirmedBy: null };
    mocks.prisma.workshopDailyBook.findFirst.mockResolvedValue({
      id: "b1",
      companyId: "company3",
      bookDate: new Date(),
      status: "OPEN",
      openedBy: "gm_1",
      transactions: [tx],
    });

    const res = await getDailyBook();
    expect(res.status).toBe(200);

    const arg = mocks.prisma.workshopDailyBook.findFirst.mock.calls[0][0] as {
      include: { transactions: { include: Record<string, unknown> } };
    };
    const include = arg.include.transactions.include;

    // Must not throw — this is what broke the page.
    expect(() => assertOnlyRelations(include, SCALARS, "WorkshopTransaction")).not.toThrow();
    expect(Object.keys(include).sort()).toEqual(["category", "customer"]);

    // createdBy stays a scalar id; the route maps it to a display name itself.
    const body = await res.json();
    expect(body.book.transactions[0].createdByName).toBeNull();
  });

  it("POST names no scalar field in the transaction include", async () => {
    mocks.prisma.workshopDailyBook.findFirst
      .mockResolvedValueOnce(null) // no open book yet
      .mockResolvedValueOnce({ id: "b1", companyId: "company3", bookDate: new Date(), openedBy: "gm_1" });
    mocks.prisma.workshopDailyBook.create.mockResolvedValue({
      id: "b1",
      companyId: "company3",
      bookDate: new Date(),
      openedBy: "gm_1",
    });
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat1", name: "يومية الورشة" });
    mocks.prisma.workshopTransaction.create.mockResolvedValue({ id: "t1", createdBy: "gm_1" });

    const req = new Request("http://localhost/api/workshop-daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "OUT", amount: 25, reason: "قطع غيار" }),
    });

    const res = await addTransaction(req);
    expect(res.status).toBe(201);

    const arg = mocks.prisma.workshopTransaction.create.mock.calls[0][0] as {
      include: Record<string, unknown>;
    };
    expect(() => assertOnlyRelations(arg.include, SCALARS, "WorkshopTransaction")).not.toThrow();
    expect(Object.keys(arg.include).sort()).toEqual(["category", "customer"]);
  });
});
