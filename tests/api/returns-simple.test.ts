import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    company: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    supplier: { findUnique: vi.fn(), findMany: vi.fn() },
    product: { findMany: vi.fn() },
    warehouse: { findFirst: vi.fn() },
    warehouseInventory: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    stockMovement: { create: vi.fn() },
    account: { findFirst: vi.fn(), update: vi.fn() },
    settlement: { create: vi.fn(), deleteMany: vi.fn() },
    customerLedger: { upsert: vi.fn() },
    supplierPayment: { create: vi.fn(), deleteMany: vi.fn() },
    returnTransaction: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    salesOrder: { findUnique: vi.fn() },
    purchaseOrder: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  return { db, requirePageAccess: vi.fn(), requireAuth: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  requireAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyAction: (page: string) => mocks.requirePageAccess(page),
}));

import { POST } from "@/app/api/returns/route";
import { PUT, DELETE } from "@/app/api/returns/[id]/route";
import { GET as options } from "@/app/api/returns/options/route";

const actor = { id: "u1", role: "ACCOUNTANT" };
const jsonReq = (url: string, method: string, body: object) =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("simplified returns", () => {
  let created: { id: string }[];

  beforeEach(() => {
    vi.clearAllMocks();
    created = [];
    mocks.requirePageAccess.mockResolvedValue(actor);
    mocks.requireAuth.mockResolvedValue(actor);
    mocks.db.$transaction.mockImplementation(async (cb: (tx: typeof mocks.db) => Promise<unknown>) => cb(mocks.db));

    mocks.db.company.findUnique.mockResolvedValue({ id: "c1" });
    mocks.db.customer.findUnique.mockResolvedValue({ id: "cu1", remainingDebt: 200 });
    mocks.db.supplier.findUnique.mockResolvedValue({ id: "su1", companyId: "c1" });
    mocks.db.product.findMany.mockResolvedValue([{ id: "p1" }]);
    mocks.db.warehouse.findFirst.mockResolvedValue({ id: "w1" });
    mocks.db.warehouseInventory.findUnique.mockResolvedValue({ quantity: 10 });
    mocks.db.account.findFirst.mockResolvedValue({ id: "acc1" });
    mocks.db.returnTransaction.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `rt${created.length + 1}`, ...data };
      created.push({ id: row.id });
      return row;
    });
    mocks.db.returnTransaction.findMany.mockImplementation(
      async ({ where }: { where: { id: { in: string[] } } }) =>
        created.filter((row) => where.id.in.includes(row.id))
    );
    mocks.db.returnTransaction.update.mockResolvedValue({ id: "rt9" });
  });

  it("posts a sale return to stock, cash, customer debt and a subtraction settlement", async () => {
    const res = await POST(
      jsonReq("http://localhost/api/returns", "POST", {
        companyId: "c1",
        type: "SALE_RETURN",
        customerId: "cu1",
        items: [{ productId: "p1", quantity: 2, unitPrice: 50 }],
        reason: "مرتجع عميل",
      })
    );

    expect(res.status).toBe(201);
    expect(mocks.db.warehouseInventory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { quantity: { increment: 2 } } })
    );
    expect(mocks.db.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ movementType: "SALE_RETURN_IN" }) })
    );
    expect(mocks.db.account.update).toHaveBeenCalledWith({
      where: { id: "acc1" },
      data: { balance: { decrement: 100 } },
    });
    expect(mocks.db.settlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ settlementNumber: "RET-rt1", direction: "SUBTRACTION", status: "VERIFIED" }),
      })
    );
    expect(mocks.db.customerLedger.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { balance: { decrement: 100 } } })
    );
    expect(mocks.db.customer.update).toHaveBeenCalledWith({
      where: { id: "cu1" },
      data: { remainingDebt: 100 },
    });
  });

  it("posts a purchase return out of stock, into cash and against the supplier payable", async () => {
    const res = await POST(
      jsonReq("http://localhost/api/returns", "POST", {
        companyId: "c1",
        type: "PURCHASE_RETURN",
        supplierId: "su1",
        items: [{ productId: "p1", quantity: 3, unitPrice: 20 }],
      })
    );

    expect(res.status).toBe(201);
    expect(mocks.db.warehouseInventory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 7 } })
    );
    expect(mocks.db.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ movementType: "PURCHASE_RETURN_OUT" }) })
    );
    expect(mocks.db.account.update).toHaveBeenCalledWith({
      where: { id: "acc1" },
      data: { balance: { increment: 60 } },
    });
    expect(mocks.db.supplierPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ docNumber: "RET-rt1", amount: 60 }) })
    );
    expect(mocks.db.settlement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: "ADDITION" }) })
    );
  });

  it("refuses a purchase return that would take stock below zero", async () => {
    mocks.db.warehouseInventory.findUnique.mockResolvedValue({ quantity: 1 });

    const res = await POST(
      jsonReq("http://localhost/api/returns", "POST", {
        companyId: "c1",
        type: "PURCHASE_RETURN",
        supplierId: "su1",
        items: [{ productId: "p1", quantity: 5, unitPrice: 20 }],
      })
    );

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INSUFFICIENT_STOCK");
    expect(mocks.db.account.update).not.toHaveBeenCalled();
    expect(mocks.db.settlement.create).not.toHaveBeenCalled();
  });

  it("posts a pending simple return when it is approved", async () => {
    mocks.db.returnTransaction.findUnique.mockResolvedValue({
      id: "rt9",
      companyId: "c1",
      type: "SALE_RETURN",
      customerId: "cu1",
      supplierId: null,
      productId: "p1",
      quantity: 1,
      total: 25,
      status: "PENDING",
      warehouseId: null,
      salesOrderId: null,
      purchaseOrderId: null,
    });

    const res = await PUT(
      jsonReq("http://localhost/api/returns/rt9", "PUT", { status: "APPROVED" }),
      { params: Promise.resolve({ id: "rt9" }) }
    );

    expect(res.status).toBe(200);
    expect(mocks.db.returnTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", warehouseId: "w1" }) })
    );
    expect(mocks.db.settlement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ settlementNumber: "RET-rt9" }) })
    );
  });

  it("reverses a simple purchase return when it is deleted", async () => {
    mocks.db.returnTransaction.findUnique.mockResolvedValue({
      id: "rt9",
      companyId: "c1",
      type: "PURCHASE_RETURN",
      customerId: null,
      supplierId: "su1",
      productId: "p1",
      quantity: 2,
      total: 40,
      status: "APPROVED",
      warehouseId: "w1",
      salesOrderId: null,
      purchaseOrderId: null,
    });

    const res = await DELETE(new Request("http://localhost/api/returns/rt9", { method: "DELETE" }), {
      params: Promise.resolve({ id: "rt9" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.db.warehouseInventory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { quantity: { increment: 2 } } })
    );
    expect(mocks.db.settlement.deleteMany).toHaveBeenCalledWith({ where: { settlementNumber: "RET-rt9" } });
    expect(mocks.db.supplierPayment.deleteMany).toHaveBeenCalledWith({ where: { docNumber: "RET-rt9" } });
    expect(mocks.db.returnTransaction.delete).toHaveBeenCalledWith({ where: { id: "rt9" } });
  });

  it("loads company-scoped options with a summed stock figure", async () => {
    mocks.db.customer.findMany.mockResolvedValue([{ id: "cu1", name: "Client", companyName: "Acme" }]);
    mocks.db.supplier.findMany.mockResolvedValue([{ id: "su1", name: "Supplier" }]);
    mocks.db.product.findMany.mockResolvedValue([
      { id: "p1", name: "Toner", sku: "T1", inventoryItems: [{ quantity: 4 }, { quantity: 6 }] },
    ]);

    const res = await options(new Request("http://localhost/api/returns/options?companyId=c1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customers).toHaveLength(1);
    expect(body.suppliers).toHaveLength(1);
    expect(body.products[0].stock).toBe(10);
  });
});
