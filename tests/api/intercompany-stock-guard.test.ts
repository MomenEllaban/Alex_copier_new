import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    company: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn(), update: vi.fn() },
    engineer: { findUnique: vi.fn() },
    product: { count: vi.fn() },
    warehouse: { findMany: vi.fn() },
    salesOrder: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    interCompanyInvoice: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    warehouseInventory: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    stockMovement: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    salesOrderItem: { create: vi.fn(), deleteMany: vi.fn() },
    customerLedger: { upsert: vi.fn() },
    customerPayment: { create: vi.fn(), deleteMany: vi.fn() },
    returnTransaction: { findMany: vi.fn() },
    journalEntry: { create: vi.fn(), deleteMany: vi.fn() },
    installment: { deleteMany: vi.fn() },
    account: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  return { db, requireAuth: vi.fn(), requirePageAccess: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
}));

import { POST } from "@/app/api/sales/intercompany/route";
import { PUT } from "@/app/api/sales/intercompany/[id]/route";

const gm = { id: "u1", role: "GENERAL_MANAGER" };
const jsonReq = (url: string, method: string, body: object) =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const baseBody = {
  fromCompanyId: "f1",
  toCompanyId: "t2",
  customerId: "c1",
  orderType: "SPARE_PART_SALE",
  paymentMethod: "CASH",
  items: [{ productId: "p1", quantity: 2, internalPrice: 40, customerPrice: 100 }],
};

describe("intercompany target-side stock guard (Phase 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
    mocks.db.company.findUnique.mockResolvedValue({ id: "x" });
    mocks.db.customer.findUnique.mockResolvedValue({ id: "c1", remainingDebt: 0 });
    mocks.db.product.count.mockResolvedValue(1);
    mocks.db.salesOrder.findUniqueOrThrow.mockResolvedValue({
      id: "o1",
      total: 100,
      paidAmount: 100,
      tradeInTotal: 0,
      paymentMethod: "CASH",
      installments: [],
    });
    mocks.db.returnTransaction.findMany.mockResolvedValue([]);
    mocks.db.account.findFirst.mockResolvedValue({ id: "acc" });
    mocks.db.$transaction.mockImplementation(async (cb: (tx: typeof mocks.db) => Promise<unknown>) => cb(mocks.db));
  });

  it("POST rolls back with 409 when the target warehouse cannot cover the sale", async () => {
    mocks.db.warehouse.findMany.mockResolvedValue([
      { id: "src", companyId: "f1", isMain: true },
      { id: "tgt", companyId: "t2", isMain: true },
    ]);
    mocks.db.salesOrder.create.mockResolvedValue({ id: "o1" });
    mocks.db.interCompanyInvoice.create.mockResolvedValue({ id: "ic1", invoiceNumber: "IC-1" });
    mocks.db.warehouseInventory.findUnique
      .mockResolvedValueOnce({ quantity: 10 }) // source stock check (enough)
      .mockResolvedValueOnce(null); // target read in the drain loop -> insufficient
    mocks.db.warehouseInventory.update.mockResolvedValue({});
    mocks.db.warehouseInventory.create.mockResolvedValue({});
    mocks.db.stockMovement.create.mockResolvedValue({});
    mocks.db.salesOrderItem.create.mockResolvedValue({});

    const res = await POST(jsonReq("http://localhost/api/sales/intercompany", "POST", baseBody));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("INSUFFICIENT_STOCK");
    // the transaction aborted before billing/payment writes
    expect(mocks.db.customerPayment.create).not.toHaveBeenCalled();
  });

  it("POST succeeds when both sides have enough stock", async () => {
    mocks.db.warehouse.findMany.mockResolvedValue([
      { id: "src", companyId: "f1", isMain: true },
      { id: "tgt", companyId: "t2", isMain: true },
    ]);
    mocks.db.salesOrder.create.mockResolvedValue({ id: "o1" });
    mocks.db.interCompanyInvoice.create.mockResolvedValue({ id: "ic1", invoiceNumber: "IC-1" });
    mocks.db.warehouseInventory.findUnique
      .mockResolvedValueOnce({ quantity: 10 }) // source
      .mockResolvedValueOnce(null) // target: create row
      .mockResolvedValueOnce({ quantity: 2 }); // target drain: enough
    mocks.db.warehouseInventory.update.mockResolvedValue({});
    mocks.db.warehouseInventory.create.mockResolvedValue({});
    mocks.db.stockMovement.create.mockResolvedValue({});
    mocks.db.salesOrderItem.create.mockResolvedValue({});
    mocks.db.salesOrder.findUnique.mockResolvedValue({ id: "o1", items: [] });

    const res = await POST(jsonReq("http://localhost/api/sales/intercompany", "POST", baseBody));

    expect(res.status).toBe(201);
  });

  it("PUT reverts to a clean state in one transaction window", async () => {
    mocks.db.salesOrder.findUnique.mockResolvedValue({
      id: "o1",
      customerId: "c1",
      companyId: "t2",
      paymentMethod: "CASH",
      total: 100,
      paidAmount: 100,
      creditUsed: 0,
      items: [],
      installments: [],
    });
    mocks.db.interCompanyInvoice.findFirst.mockResolvedValue({ id: "ic1", total: 80 });
    mocks.db.warehouse.findMany.mockResolvedValue([
      { id: "src", companyId: "f1", isMain: true },
      { id: "tgt", companyId: "t2", isMain: true },
    ]);
    mocks.db.stockMovement.findMany.mockResolvedValue([]);
    mocks.db.warehouseInventory.findUnique
      .mockResolvedValueOnce({ quantity: 10 }) // source check
      .mockResolvedValueOnce({ quantity: 0 }) // target drain check
      .mockResolvedValueOnce({ quantity: 2 }); // target drain decrement path
    mocks.db.warehouseInventory.update.mockResolvedValue({});
    mocks.db.warehouseInventory.create.mockResolvedValue({});
    mocks.db.stockMovement.create.mockResolvedValue({});
    mocks.db.salesOrderItem.create.mockResolvedValue({});
    mocks.db.salesOrder.update.mockResolvedValue({});
    mocks.db.journalEntry.deleteMany.mockResolvedValue({});
    mocks.db.customerPayment.deleteMany.mockResolvedValue({});
    mocks.db.account.findFirst.mockResolvedValue({ id: "acc" });

    const res = await PUT(
      jsonReq("http://localhost/api/sales/intercompany/o1", "PUT", baseBody),
      { params: Promise.resolve({ id: "o1" }) },
    );

    expect(res.status).toBe(200);
  });
});