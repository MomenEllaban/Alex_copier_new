import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    company: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn(), update: vi.fn() },
    engineer: { findUnique: vi.fn() },
    product: { count: vi.fn() },
    warehouse: { findFirst: vi.fn() },
    salesOrder: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    warehouseInventory: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    stockMovement: { create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    salesOrderItem: { create: vi.fn(), deleteMany: vi.fn() },
    customerLedger: { upsert: vi.fn() },
    customerPayment: { create: vi.fn(), deleteMany: vi.fn() },
    installment: { deleteMany: vi.fn() },
    productArchive: {},
    $transaction: vi.fn(),
  };
  return { db, requireAuth: vi.fn(), requirePageAccess: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
}));

import { POST } from "@/app/api/sales/route";
import { PUT } from "@/app/api/sales/[id]/route";

const gm = { id: "u1", role: "GENERAL_MANAGER" };
const jsonReq = (url: string, method: string, body: object) =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("sales refuse without a main warehouse (Phase 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
    mocks.db.company.findUnique.mockResolvedValue({ id: "co1" });
    mocks.db.customer.findUnique.mockResolvedValue({ id: "c1", remainingDebt: 0 });
    mocks.db.product.count.mockResolvedValue(1);
    mocks.db.warehouse.findFirst.mockResolvedValue(null);
  });

  it("POST returns 400 NO_MAIN_WAREHOUSE and never opens a transaction", async () => {
    const res = await POST(jsonReq("http://localhost/api/sales", "POST", {
      companyId: "co1",
      customerId: "c1",
      orderType: "SPARE_PART_SALE",
      paymentMethod: "CASH",
      orderDate: "2026-09-01",
      items: [{ productId: "p1", quantity: 1, unitPrice: 100 }],
    }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("NO_MAIN_WAREHOUSE");
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.db.salesOrder.create).not.toHaveBeenCalled();
  });

  it("PUT returns 400 NO_MAIN_WAREHOUSE when the company has no main warehouse", async () => {
    mocks.db.salesOrder.findUnique.mockResolvedValue({
      id: "o1",
      customerId: "c1",
      companyId: "co1",
      paymentMethod: "CASH",
      total: 0,
      paidAmount: 0,
      creditUsed: 0,
      tradeInTotal: 0,
      orderDate: "2026-09-01",
      items: [],
      installments: [],
      returns: [],
    });

    const res = await PUT(
      jsonReq("http://localhost/api/sales/o1", "PUT", {
        companyId: "co1",
        customerId: "c1",
        orderType: "SPARE_PART_SALE",
        paymentMethod: "CASH",
        items: [{ productId: "p1", quantity: 1, unitPrice: 100 }],
      }),
      { params: Promise.resolve({ id: "o1" }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("NO_MAIN_WAREHOUSE");
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});