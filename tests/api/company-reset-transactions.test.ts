import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    company: { findUnique: vi.fn() },
    returnTransaction: { deleteMany: vi.fn() },
    settlement: { deleteMany: vi.fn() },
    expense: { deleteMany: vi.fn() },
    purchaseInvoice: { deleteMany: vi.fn() },
    purchaseOrder: { deleteMany: vi.fn() },
    salesOrder: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { requireRole: vi.fn(), requireAuth: vi.fn(), db };
});

vi.mock("@/lib/auth-helpers", () => ({
  requireRole: mocks.requireRole,
  requireAuth: mocks.requireAuth,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));

import { POST } from "@/app/api/companies/[id]/reset-transactions/route";

const req = () => new Request("http://localhost/api/companies/c1/reset-transactions", { method: "POST" });

describe("POST /api/companies/[id]/reset-transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // The tests below exercise the endpoint on a non-production environment,
    // where the guard lets it through.
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ENABLE_DATA_RESET", "");
    mocks.requireRole.mockResolvedValue({ id: "u1", role: "GENERAL_MANAGER" });
    mocks.db.company.findUnique.mockResolvedValue({ id: "c1", name: "اليكس كوبير" });
    mocks.db.$transaction.mockImplementation(async (cb: (tx: typeof mocks.db) => Promise<unknown>) =>
      cb(mocks.db),
    );
    mocks.db.returnTransaction.deleteMany.mockResolvedValue({ count: 2 });
    mocks.db.settlement.deleteMany.mockResolvedValue({ count: 3 });
    mocks.db.expense.deleteMany.mockResolvedValue({ count: 4 });
    mocks.db.purchaseInvoice.deleteMany.mockResolvedValue({ count: 5 });
    mocks.db.purchaseOrder.deleteMany.mockResolvedValue({ count: 6 });
    mocks.db.salesOrder.deleteMany.mockResolvedValue({ count: 7 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("production off-switch", () => {
    it("returns 404 in production without touching the database", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ENABLE_DATA_RESET", "");

      const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });

      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe("DISABLED");
      expect(mocks.db.company.findUnique).not.toHaveBeenCalled();
      expect(mocks.db.$transaction).not.toHaveBeenCalled();
    });

    it("stays disabled in production when the opt-in is anything but exactly 1", async () => {
      vi.stubEnv("NODE_ENV", "production");

      for (const value of ["", "0", "true", "yes", " 1"]) {
        vi.stubEnv("ENABLE_DATA_RESET", value);
        expect((await POST(req(), { params: Promise.resolve({ id: "c1" }) })).status).toBe(404);
      }
      expect(mocks.db.$transaction).not.toHaveBeenCalled();
    });

    it("allows the wipe in production only with ENABLE_DATA_RESET=1", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ENABLE_DATA_RESET", "1");

      const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });

      expect(res.status).toBe(200);
      expect(mocks.db.$transaction).toHaveBeenCalled();
    });

    it("stays enabled outside production without the opt-in", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("ENABLE_DATA_RESET", "");

      expect((await POST(req(), { params: Promise.resolve({ id: "c1" }) })).status).toBe(200);
    });
  });

  it("rejects non-general-managers with 403", async () => {
    mocks.requireRole.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue({ id: "u1", role: "ACCOUNTANT" });

    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when the company does not exist", async () => {
    mocks.db.company.findUnique.mockResolvedValue(null);

    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(404);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("deletes only that company's transactions and returns counts", async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.company).toEqual({ id: "c1", name: "اليكس كوبير" });
    expect(body.counts).toEqual({
      sales: 7,
      purchases: 6,
      purchaseInvoices: 5,
      settlements: 3,
      expenses: 4,
      returns: 2,
    });

    // Every delete is scoped to the company.
    for (const model of [
      "returnTransaction",
      "settlement",
      "expense",
      "purchaseInvoice",
      "purchaseOrder",
      "salesOrder",
    ] as const) {
      expect(mocks.db[model].deleteMany).toHaveBeenCalledWith({ where: { companyId: "c1" } });
    }
  });

  it("deletes returns before sales orders and invoices before purchase orders", async () => {
    const order: string[] = [];
    mocks.db.returnTransaction.deleteMany.mockImplementation(() => {
      order.push("returns");
      return Promise.resolve({ count: 0 });
    });
    mocks.db.purchaseInvoice.deleteMany.mockImplementation(() => {
      order.push("invoices");
      return Promise.resolve({ count: 0 });
    });
    mocks.db.purchaseOrder.deleteMany.mockImplementation(() => {
      order.push("purchases");
      return Promise.resolve({ count: 0 });
    });
    mocks.db.salesOrder.deleteMany.mockImplementation(() => {
      order.push("sales");
      return Promise.resolve({ count: 0 });
    });

    await POST(req(), { params: Promise.resolve({ id: "c1" }) });

    expect(order.indexOf("returns")).toBeLessThan(order.indexOf("sales"));
    expect(order.indexOf("invoices")).toBeLessThan(order.indexOf("purchases"));
  });

  it("maps database failures to a 500 error", async () => {
    mocks.db.$transaction.mockRejectedValue(new Error("connection refused"));

    const res = await POST(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(500);
  });
});