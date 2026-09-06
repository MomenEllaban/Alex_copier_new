import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    returnTransaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    salesOrder: { findUnique: vi.fn() },
    purchaseOrder: { findUnique: vi.fn(), update: vi.fn() },
    warehouse: { findFirst: vi.fn() },
    warehouseInventory: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    stockMovement: { create: vi.fn() },
    customerLedger: { upsert: vi.fn() },
    customer: { findUnique: vi.fn(), update: vi.fn() },
    settlement: { create: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { db, requireAuth: vi.fn(), requirePageAccess: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
}));

import { POST } from "@/app/api/returns/route";
import { PUT } from "@/app/api/returns/[id]/route";

const gm = { id: "u1", role: "GENERAL_MANAGER" };
const jsonReq = (url: string, method: string, body: object) =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("returns negative-stock guards (Phase 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
    mocks.db.$transaction.mockImplementation(async (cb: (tx: typeof mocks.db) => Promise<unknown>) => cb(mocks.db));
    mocks.db.warehouse.findFirst.mockResolvedValue({ id: "w1", companyId: "c1", isMain: true });
  });

  it("POST purchase-return refuses to go below zero (409)", async () => {
    mocks.db.purchaseOrder.findUnique.mockResolvedValue({
      id: "po1",
      companyId: "c1",
      supplierId: "su1",
      total: 500,
      items: [{ id: "poi1", productId: "p1", quantity: 5, unitPrice: 10, product: { name: "قطعة" } }],
      supplier: { id: "su1", name: "مورد" },
      company: { id: "c1", name: "شركة" },
    });
    mocks.db.returnTransaction.findMany.mockResolvedValue([]);
    mocks.db.returnTransaction.create.mockResolvedValue({ id: "rt1" });
    mocks.db.purchaseOrder.update.mockResolvedValue({});
    mocks.db.settlement.create.mockResolvedValue({});
    // only 1 in stock while returning 5 -> must be rejected
    mocks.db.warehouseInventory.findUnique.mockResolvedValue({ quantity: 1 });

    const res = await POST(jsonReq("http://localhost/api/returns", "POST", {
      type: "PURCHASE_RETURN",
      purchaseOrderId: "po1",
      purchaseOrderItemId: "poi1",
      quantity: 5,
    }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("INSUFFICIENT_STOCK");
  });

  it("POST purchase-return proceeds when stock is sufficient", async () => {
    mocks.db.purchaseOrder.findUnique.mockResolvedValue({
      id: "po1",
      companyId: "c1",
      supplierId: "su1",
      total: 500,
      items: [{ id: "poi1", productId: "p1", quantity: 5, unitPrice: 10, product: { name: "قطعة" } }],
      supplier: { id: "su1", name: "مورد" },
      company: { id: "c1", name: "شركة" },
    });
    mocks.db.returnTransaction.findMany.mockResolvedValue([]);
    mocks.db.returnTransaction.create.mockResolvedValue({ id: "rt1" });
    mocks.db.returnTransaction.findUnique.mockResolvedValue({
      id: "rt1",
      company: { id: "co1", name: "شركة" },
      supplier: { id: "su1", name: "مورد" },
      product: { name: "قطعة" },
      warehouse: { id: "w1", name: "مستودع" },
      purchaseOrder: { id: "po1" },
      purchaseOrderItem: { id: "poi1", unitPrice: 10, quantity: 5 },
    });
    mocks.db.purchaseOrder.update.mockResolvedValue({});
    mocks.db.settlement.create.mockResolvedValue({});
    mocks.db.warehouseInventory.findUnique.mockResolvedValue({ quantity: 12 });

    const res = await POST(jsonReq("http://localhost/api/returns", "POST", {
      type: "PURCHASE_RETURN",
      purchaseOrderId: "po1",
      purchaseOrderItemId: "poi1",
      quantity: 5,
    }));

    expect(res.status).toBe(201);
    const invUpdate = mocks.db.warehouseInventory.update.mock.calls[0][0];
    expect(invUpdate.data.quantity).toBe(7);
  });

  it("PUT rejecting a sale-return refuses if stock cannot take it back out (409)", async () => {
    mocks.db.returnTransaction.findUnique.mockResolvedValue({
      id: "rt1",
      warehouseId: "w1",
      productId: "p1",
      quantity: 3,
      total: 30,
      type: "SALE_RETURN",
      status: "APPROVED",
      customerId: "c1",
      companyId: "co1",
      purchaseOrderId: null,
    });
    mocks.db.returnTransaction.update.mockResolvedValue({});
    mocks.db.warehouseInventory.findUnique.mockResolvedValue({ quantity: 1 });

    const res = await PUT(
      jsonReq("http://localhost/api/returns/rt1", "PUT", { status: "REJECTED" }),
      { params: Promise.resolve({ id: "rt1" }) },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("INSUFFICIENT_STOCK");
  });
});