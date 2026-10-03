import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    company: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn(), update: vi.fn() },
    engineer: { findUnique: vi.fn() },
    product: { count: vi.fn() },
    warehouse: { findFirst: vi.fn() },
    salesOrder: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    warehouseInventory: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    stockMovement: { create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    salesOrderItem: { create: vi.fn(), deleteMany: vi.fn() },
    customerLedger: { upsert: vi.fn() },
    customerPayment: { create: vi.fn(), deleteMany: vi.fn() },
    installment: { deleteMany: vi.fn() },
    productArchive: {},
    returnTransaction: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  };
  return { db, requireAuth: vi.fn(), requirePageAccess: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  // Action guards delegate to the page guard: these tests decide who is
  // allowed, not which action, and the page answer is what they mean.
  requireAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyAction: (page: string) => mocks.requirePageAccess(page),
}));

import { POST } from "@/app/api/sales/route";

const gm = { id: "u1", role: "GENERAL_MANAGER" };
const jsonReq = (url: string, method: string, body: object) =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const order = (quantity: number) => ({
  companyId: "co1",
  customerId: "c1",
  orderType: "SPARE_PART_SALE",
  paymentMethod: "CASH",
  orderDate: "2026-09-01",
  items: [{ productId: "p1", quantity, unitPrice: 100 }],
});

describe("sales stock is scoped to the selling company's main warehouse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
    mocks.db.$transaction.mockImplementation(async (cb: (tx: typeof mocks.db) => Promise<unknown>) => cb(mocks.db));
    mocks.db.company.findUnique.mockResolvedValue({ id: "co1" });
    mocks.db.customer.findUnique.mockResolvedValue({ id: "c1", remainingDebt: 0 });
    mocks.db.product.count.mockResolvedValue(1);
    mocks.db.warehouse.findFirst.mockResolvedValue({ id: "w_main_co1" });
    mocks.db.salesOrder.create.mockResolvedValue({ id: "o1" });
    mocks.db.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: "o1", total: 200, paidAmount: 200, tradeInTotal: 0, paymentMethod: "CASH", installments: [] });
    // The route echoes the order back, so it has to be JSON-safe.
    mocks.db.salesOrder.findUnique.mockResolvedValue({ id: "o1", total: 200, paidAmount: 200, paymentStatus: "PAID" });
    mocks.db.salesOrder.update.mockResolvedValue({ id: "o1" });
  });

  it("reads availability from the company's OWN main warehouse row", async () => {
    mocks.db.warehouseInventory.findUnique.mockResolvedValue({ quantity: 4 });

    const res = await POST(jsonReq("http://localhost/api/sales", "POST", order(2)));

    expect(res.status).toBe(201);
    // The lookup must be keyed by the main warehouse returned above — reading
    // any other row is how "available" and "deducted" drift apart.
    const lookup = mocks.db.warehouseInventory.findUnique.mock.calls[0][0];
    expect(lookup.where.warehouseId_productId.warehouseId).toBe("w_main_co1");
    const update = mocks.db.warehouseInventory.update.mock.calls[0][0];
    expect(update.where.warehouseId_productId.warehouseId).toBe("w_main_co1");
    expect(update.data.quantity).toBe(2);
  });

  it("rejects with 409 INSUFFICIENT_STOCK when the company alone lacks the qty", async () => {
    // Company A has 1 left while other companies hold plenty. Selling must
    // still fail — a cross-company total would let this through and oversell.
    mocks.db.warehouseInventory.findUnique.mockResolvedValue({ quantity: 1 });

    const res = await POST(jsonReq("http://localhost/api/sales", "POST", order(5)));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("INSUFFICIENT_STOCK");
    expect(mocks.db.warehouseInventory.update).not.toHaveBeenCalled();
  });

  it("rejects with 409 when the company has no row for the product at all", async () => {
    mocks.db.warehouseInventory.findUnique.mockResolvedValue(null);

    const res = await POST(jsonReq("http://localhost/api/sales", "POST", order(1)));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("INSUFFICIENT_STOCK");
  });
});