import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    company: { findUnique: vi.fn() },
    supplier: { findUnique: vi.fn() },
    product: { count: vi.fn(), update: vi.fn() },
    warehouse: { findFirst: vi.fn(), create: vi.fn() },
    warehouseInventory: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    stockMovement: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    purchaseOrder: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  };
  return { db, requireAuth: vi.fn(), requirePageAccess: vi.fn(), requireAction: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  requireAction: mocks.requireAction,
}));

import { POST as createPurchase } from "@/app/api/purchases/route";
import { PUT as updatePurchase, DELETE as deletePurchase } from "@/app/api/purchases/[id]/route";

const gm = { id: "u1", role: "GENERAL_MANAGER" };
const jsonReq = (url: string, method: string, body?: object) =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

describe("purchase order stock integration flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
    mocks.requireAction.mockResolvedValue(gm);
    mocks.db.$transaction.mockImplementation(async (cb: (tx: typeof mocks.db) => Promise<unknown>) => cb(mocks.db));
    mocks.db.company.findUnique.mockResolvedValue({ id: "co1", name: "Company 1" });
    mocks.db.supplier.findUnique.mockResolvedValue({ id: "sup1", name: "Supplier 1" });
    mocks.db.product.count.mockResolvedValue(1);
    mocks.db.warehouse.findFirst.mockResolvedValue({ id: "wh_main_co1", companyId: "co1", isMain: true });
  });

  it("POST /api/purchases with RECEIVED immediately posts stock and updates purchase price", async () => {
    const createdPo = {
      id: "po1",
      companyId: "co1",
      supplierId: "sup1",
      status: "RECEIVED",
      total: 500,
      items: [{ productId: "p1", quantity: 5, unitPrice: 100 }],
    };
    mocks.db.purchaseOrder.create.mockResolvedValue(createdPo);
    mocks.db.warehouseInventory.findUnique.mockResolvedValue({ quantity: 10 });

    const payload = {
      companyId: "co1",
      supplierId: "sup1",
      status: "RECEIVED",
      orderDate: "2026-10-03",
      items: [{ productId: "p1", quantity: 5, unitPrice: 100 }],
    };

    const res = await createPurchase(jsonReq("http://localhost/api/purchases", "POST", payload));
    expect(res.status).toBe(201);

    // Verify warehouse lookup for the company's main warehouse
    expect(mocks.db.warehouse.findFirst).toHaveBeenCalledWith({
      where: { companyId: "co1", isMain: true },
      orderBy: { createdAt: "asc" },
    });

    // Verify stock is upserted with new total (10 existing + 5 received = 15)
    expect(mocks.db.warehouseInventory.upsert).toHaveBeenCalledWith({
      where: { warehouseId_productId: { warehouseId: "wh_main_co1", productId: "p1" } },
      update: { quantity: 15 },
      create: { warehouseId: "wh_main_co1", productId: "p1", quantity: 5 },
    });

    // Verify movement is created with PURCHASE_IN
    expect(mocks.db.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        warehouseId: "wh_main_co1",
        productId: "p1",
        quantity: 5,
        movementType: "PURCHASE_IN",
        purchaseOrderId: "po1",
      }),
    });

    // Verify product purchasePrice is updated to 100
    expect(mocks.db.product.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { purchasePrice: 100 },
    });
  });

  it("PUT /api/purchases/[id] transitioning from CONFIRMED to RECEIVED receives items into stock", async () => {
    mocks.db.purchaseOrder.findUnique
      .mockResolvedValueOnce({
        id: "po_confirmed",
        companyId: "co1",
        status: "CONFIRMED",
        items: [{ productId: "p1", quantity: 3 }],
      })
      .mockResolvedValueOnce({
        items: [{ productId: "p1", quantity: 7, unitPrice: 120 }],
      });

    mocks.db.purchaseOrder.update.mockResolvedValue({
      id: "po_confirmed",
      companyId: "co1",
      status: "RECEIVED",
    });
    mocks.db.warehouseInventory.findUnique.mockResolvedValue({ quantity: 2 });

    const updatePayload = {
      status: "RECEIVED",
      items: [{ productId: "p1", quantity: 7, unitPrice: 120 }],
    };

    const res = await updatePurchase(
      jsonReq("http://localhost/api/purchases/po_confirmed", "PUT", updatePayload),
      { params: Promise.resolve({ id: "po_confirmed" }) }
    );

    expect(res.status).toBe(200);

    // Verify stock is incremented by 7 (2 existing + 7 = 9)
    expect(mocks.db.warehouseInventory.upsert).toHaveBeenCalledWith({
      where: { warehouseId_productId: { warehouseId: "wh_main_co1", productId: "p1" } },
      update: { quantity: 9 },
      create: { warehouseId: "wh_main_co1", productId: "p1", quantity: 7 },
    });

    expect(mocks.db.product.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { purchasePrice: 120 },
    });
  });

  it("DELETE /api/purchases/[id] on a RECEIVED order reverses the stock cleanly", async () => {
    mocks.db.purchaseOrder.findUnique.mockResolvedValue({
      id: "po_to_delete",
      status: "RECEIVED",
    });
    mocks.db.stockMovement.findMany.mockResolvedValue([
      { warehouseId: "wh_main_co1", productId: "p1", quantity: 5, movementType: "PURCHASE_IN" },
    ]);
    mocks.db.warehouseInventory.findUnique.mockResolvedValue({ quantity: 8 });

    const res = await deletePurchase(
      jsonReq("http://localhost/api/purchases/po_to_delete", "DELETE"),
      { params: Promise.resolve({ id: "po_to_delete" }) }
    );

    expect(res.status).toBe(200);

    // Verify stock was decremented from 8 to 3 (8 - 5 = 3)
    expect(mocks.db.warehouseInventory.update).toHaveBeenCalledWith({
      where: { warehouseId_productId: { warehouseId: "wh_main_co1", productId: "p1" } },
      data: { quantity: 3 },
    });

    // Verify ADJUSTMENT reversal movement created
    expect(mocks.db.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        warehouseId: "wh_main_co1",
        productId: "p1",
        quantity: 5,
        movementType: "ADJUSTMENT",
        purchaseOrderId: "po_to_delete",
      }),
    });

    // Verify the original order is deleted
    expect(mocks.db.purchaseOrder.delete).toHaveBeenCalledWith({
      where: { id: "po_to_delete" },
    });
  });
});
