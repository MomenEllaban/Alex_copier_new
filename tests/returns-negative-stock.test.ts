import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sales returns against an invoice that left stock negative.
 *
 * A sale return puts units back. If the invoice went negative, returning some of
 * those units is how the deficit starts to close (-3 + 3 = 0), so the path must
 * keep working and must keep being an increment. What it must NOT do is refuse
 * the return because the balance is negative, or take the balance further down.
 * The cap on a return stays the invoice line (quantity already sold minus
 * quantity already returned) — never the stock balance.
 */

const WAREHOUSE = { id: "wh-1" };
const COMPANY = "c1";
const CUSTOMER = "cust-1";
const ORDER = "so-1";
const ITEM = "it-1";

const store = {
  inventory: [] as Array<{ warehouseId: string; productId: string; quantity: number }>,
  movements: [] as Array<Record<string, any>>,
  returns: [] as Array<Record<string, any>>,
};

function reset(balance: number, alreadyReturned = 0) {
  store.inventory = [{ warehouseId: WAREHOUSE.id, productId: "p1", quantity: balance }];
  store.movements = [];
  store.returns = [{ quantity: alreadyReturned, status: "APPROVED" }];
}

const balance = () => store.inventory.find((r) => r.productId === "p1")?.quantity;

const salesOrder = {
  id: ORDER,
  companyId: COMPANY,
  customerId: CUSTOMER,
  items: [{ id: ITEM, productId: "p1", quantity: 8, unitPrice: 100, product: { name: "منتج p1" } }],
  company: { id: COMPANY },
  customer: { id: CUSTOMER },
};

async function withTx(fn: (tx: unknown) => unknown) {
  const work = {
    inventory: store.inventory.map((r) => ({ ...r })),
    movements: [...store.movements],
    returns: [...store.returns],
  };
  const result = await fn({
    returnTransaction: {
      create: async ({ data }: any) => {
        const row = { id: `ret-${work.returns.length}`, ...data };
        work.returns.push(row);
        return row;
      },
      // The payment-status helper re-reads returns to net the invoice total.
      findMany: async () => [],
    },
    warehouseInventory: {
      findUnique: async ({ where }: any) =>
        work.inventory.find(
          (r) => r.productId === where.warehouseId_productId.productId && r.warehouseId === where.warehouseId_productId.warehouseId,
        ) ?? null,
      upsert: async ({ where, update, create }: any) => {
        const existingRow = work.inventory.find(
          (r) => r.productId === where.warehouseId_productId.productId && r.warehouseId === where.warehouseId_productId.warehouseId,
        );
        if (existingRow) {
          existingRow.quantity += update.quantity.increment;
          return existingRow;
        }
        const row = { ...create };
        work.inventory.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = work.inventory.find((r) => r.productId === where.warehouseId_productId.productId);
        if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
        row.quantity = data.quantity;
        return row;
      },
    },
    stockMovement: {
      create: async ({ data }: any) => {
        work.movements.push(data);
        return data;
      },
    },
    customerLedger: { upsert: async () => ({}) },
    customer: { findUnique: async () => ({ remainingDebt: 0 }), update: async () => ({}) },
    salesOrder: {
      update: async () => ({}),
      findUniqueOrThrow: async () => ({ total: 800, paidAmount: 800, tradeInTotal: 0, paymentMethod: "CASH", installments: [] }),
    },
  });
  Object.assign(store, work);
  return result;
}

const prismaMock = {
  salesOrder: { findUnique: async () => salesOrder },
  warehouse: { findFirst: async () => WAREHOUSE },
  // Already-accepted returns on the line, which is what caps a new return.
  returnTransaction: {
    findMany: async () => store.returns.map((r) => ({ quantity: r.quantity, status: r.status })),
    findUnique: async () => ({ id: "ret-1" }),
  },
  $transaction: withTx,
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: async () => ({ id: "u1", companyId: COMPANY }),
  requirePageAccess: async () => ({ id: "u1", companyId: COMPANY }),
  requireAction: async () => ({ id: "u1", companyId: COMPANY }),
}));

const { POST } = await import("@/app/api/returns/route");

const returnGoods = (quantity: number) =>
  POST(
    new Request("http://localhost/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "SALE_RETURN", salesOrderId: ORDER, salesOrderItemId: ITEM, quantity }),
    }),
  );

describe("POST /api/returns — sales return against a negative balance", () => {
  beforeEach(() => reset(-3));

  it("is accepted and closes the deficit instead of being refused for it", async () => {
    const res = await returnGoods(3);
    expect(res.status).toBe(201);
    // The return is an increment, so it walks the balance back up to zero
    // instead of driving it further down.
    expect(balance()).toBe(0);
    expect(store.movements).toEqual([
      expect.objectContaining({ movementType: "SALE_RETURN_IN", productId: "p1", quantity: 3, warehouseId: WAREHOUSE.id }),
    ]);
  });

  it("leaves the rest of the deficit in place when only part is returned", async () => {
    const res = await returnGoods(1);
    expect(res.status).toBe(201);
    expect(balance()).toBe(-2);
  });

  it("still caps the return by what was invoiced, not by the balance", async () => {
    // 8 sold, 5 already returned => 3 may still come back, even though the
    // balance is -3 and there is no stock to speak of.
    reset(-3, 5);
    const res = await returnGoods(4);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("EXCEEDED_RETURNABLE_QUANTITY");
    expect(balance()).toBe(-3);
    expect(store.movements).toHaveLength(0);
  });

  it("works on an ordinary positive balance unchanged", async () => {
    reset(12);
    const res = await returnGoods(2);
    expect(res.status).toBe(201);
    expect(balance()).toBe(14);
  });

  it("keeps the quantity validation", async () => {
    const res = await returnGoods(0);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_QUANTITY");
    expect(balance()).toBe(-3);
  });
});
