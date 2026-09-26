import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    purchaseOrder: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    company: { findUnique: vi.fn() },
    supplier: { findUnique: vi.fn() },
    product: { count: vi.fn() },
    warehouse: { findFirst: vi.fn(), create: vi.fn() },
    warehouseInventory: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), create: vi.fn() },
    stockMovement: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
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

import { POST } from "@/app/api/purchases/route";
import { PUT } from "@/app/api/purchases/[id]/route";

const gm = { id: "u1", role: "GENERAL_MANAGER" };
const jsonReq = (url: string, method: string, body: object) =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("purchases stock receive (Phase 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
    mocks.db.$transaction.mockImplementation(async (cb: (tx: typeof mocks.db) => Promise<unknown>) => cb(mocks.db));
    mocks.db.product.count.mockResolvedValue(1);
    mocks.db.company.findUnique.mockResolvedValue({ id: "c1" });
    mocks.db.supplier.findUnique.mockResolvedValue({ id: "s1", name: "مورد" });
    mocks.db.warehouse.findFirst.mockResolvedValue({ id: "w1", companyId: "c1", isMain: true });
  });

  it("POST with DRAFT status never touches inventory", async () => {
    mocks.db.purchaseOrder.create.mockResolvedValue({
      id: "po1",
      status: "DRAFT",
      companyId: "c1",
      items: [{ productId: "p1", quantity: 2 }],
    });

    const res = await POST(jsonReq("http://localhost/api/purchases", "POST", {
      companyId: "c1",
      supplierId: "s1",
      status: "DRAFT",
      items: [{ productId: "p1", quantity: 2, unitPrice: 50 }],
    }));

    expect(res.status).toBe(201);
    expect(mocks.db.warehouseInventory.upsert).not.toHaveBeenCalled();
    expect(mocks.db.stockMovement.create).not.toHaveBeenCalled();
  });

  it("POST with RECEIVED status stocks in with a real purchaseOrderId link", async () => {
    mocks.db.purchaseOrder.create.mockResolvedValue({
      id: "po1",
      status: "RECEIVED",
      companyId: "c1",
      items: [{ productId: "p1", quantity: 2 }],
    });

    const res = await POST(jsonReq("http://localhost/api/purchases", "POST", {
      companyId: "c1",
      supplierId: "s1",
      status: "RECEIVED",
      items: [{ productId: "p1", quantity: 2, unitPrice: 50 }],
    }));

    expect(res.status).toBe(201);
    const created = mocks.db.stockMovement.create.mock.calls[0][0];
    expect(created.data.movementType).toBe("PURCHASE_IN");
    expect(created.data.purchaseOrderId).toBe("po1");
    expect(created.data.quantity).toBe(2);
    const upserted = mocks.db.warehouseInventory.upsert.mock.calls[0][0];
    expect(upserted.update.quantity).toBe(2);
  });

  it("PUT CONFIRMED -> RECEIVED stocks in", async () => {
    mocks.db.purchaseOrder.findUnique.mockResolvedValue({
      id: "po1",
      companyId: "c1",
      status: "CONFIRMED",
      items: [{ productId: "p1", quantity: 2 }],
    });
    mocks.db.purchaseOrder.update.mockResolvedValue({
      id: "po1",
      status: "RECEIVED",
      companyId: "c1",
      items: [{ productId: "p1", quantity: 2 }],
    });

    const res = await PUT(
      jsonReq("http://localhost/api/purchases/po1", "PUT", { status: "RECEIVED" }),
      { params: Promise.resolve({ id: "po1" }) },
    );

    expect(res.status).toBe(200);
    const created = mocks.db.stockMovement.create.mock.calls[0][0];
    expect(created.data.movementType).toBe("PURCHASE_IN");
    expect(created.data.purchaseOrderId).toBe("po1");
  });

  it("PUT RECEIVED -> CONFIRMED reverses stock, never negative", async () => {
    mocks.db.purchaseOrder.findUnique.mockResolvedValue({
      id: "po1",
      companyId: "c1",
      status: "RECEIVED",
      items: [{ productId: "p1", quantity: 2 }],
    });
    mocks.db.purchaseOrder.update.mockResolvedValue({
      id: "po1",
      status: "CONFIRMED",
      companyId: "c1",
      items: [{ productId: "p1", quantity: 2 }],
    });
    mocks.db.stockMovement.findMany.mockResolvedValue([
      { warehouseId: "w1", productId: "p1", quantity: 2, movementType: "PURCHASE_IN" },
    ]);
    mocks.db.warehouseInventory.findUnique.mockResolvedValue({ quantity: 5 });

    const res = await PUT(
      jsonReq("http://localhost/api/purchases/po1", "PUT", { status: "CONFIRMED" }),
      { params: Promise.resolve({ id: "po1" }) },
    );

    expect(res.status).toBe(200);
    expect(mocks.db.warehouseInventory.update).toHaveBeenCalled();
    const update = mocks.db.warehouseInventory.update.mock.calls[0][0];
    expect(update.data.quantity).toBe(3);
    // reversed movement recorded as ADJUSTMENT, source movements removed
    const adj = mocks.db.stockMovement.create.mock.calls[0][0];
    expect(adj.data.movementType).toBe("ADJUSTMENT");
    expect(mocks.db.stockMovement.deleteMany).toHaveBeenCalled();
  });

  it("PUT un-receive refuses when stock would go negative (409)", async () => {
    mocks.db.purchaseOrder.findUnique.mockResolvedValue({
      id: "po1",
      companyId: "c1",
      status: "RECEIVED",
      items: [{ productId: "p1", quantity: 2 }],
    });
    mocks.db.stockMovement.findMany.mockResolvedValue([
      { warehouseId: "w1", productId: "p1", quantity: 2, movementType: "PURCHASE_IN" },
    ]);
    mocks.db.warehouseInventory.findUnique.mockResolvedValue({ quantity: 1 });

    const res = await PUT(
      jsonReq("http://localhost/api/purchases/po1", "PUT", { status: "CONFIRMED" }),
      { params: Promise.resolve({ id: "po1" }) },
    );

    expect(res.status).toBe(409);
  });

  it("PUT blocks editing items once the order is received (or being received)", async () => {
    mocks.db.purchaseOrder.findUnique.mockResolvedValue({
      id: "po1",
      companyId: "c1",
      status: "CONFIRMED",
      items: [{ productId: "p1", quantity: 2 }],
    });

    const res = await PUT(
      jsonReq("http://localhost/api/purchases/po1", "PUT", {
        status: "RECEIVED",
        items: [{ productId: "p1", quantity: 3, unitPrice: 50 }],
      }),
      { params: Promise.resolve({ id: "po1" }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("ITEMS_LOCKED_AFTER_RECEIVE");
  });
});