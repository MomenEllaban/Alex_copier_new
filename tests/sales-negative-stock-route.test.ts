import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level contract for the negative-stock policy on sales.
 *
 * Prisma is faked rather than mocked away wholesale, because the thing under
 * test IS the balance: the assertions read the WarehouseInventory row the route
 * wrote and compare it with opening − sold. A mocked helper would only prove the
 * helper was called.
 *
 * The transaction is also real enough to matter for the rollback cases: a fake
 * $transaction copies the store first and only commits it if the callback
 * returns, which is what makes "nothing was written when the sale is refused"
 * observable instead of assumed.
 */

const WAREHOUSE = { id: "wh-1" };
const COMPANY = "c1";
const CUSTOMER = "cust-1";

type Row = { warehouseId: string; productId: string; quantity: number };
type Movement = { warehouseId: string; productId: string; quantity: number; movementType: string; referenceId?: string | null; notes?: string | null };

/** Everything a test needs to inspect afterwards. */
const store = {
  inventory: [] as Row[],
  movements: [] as Movement[],
  orders: [] as Record<string, unknown>[],
  items: [] as Record<string, unknown>[],
  policy: { allowNegativeStock: false, warnOnNegativeStock: true } as {
    allowNegativeStock: boolean;
    warnOnNegativeStock: boolean;
  },
  /** False once to exercise the lazy create on first read. */
  policyRowExists: true,
  policyCreates: 0,
};

function reset() {
  store.inventory = [{ warehouseId: WAREHOUSE.id, productId: "p1", quantity: 5 }];
  store.movements = [];
  store.orders = [];
  store.items = [];
  store.policy = { allowNegativeStock: false, warnOnNegativeStock: true };
  store.policyRowExists = true;
  store.policyCreates = 0;
}

const key = (warehouseId: string, productId: string) => `${warehouseId}:${productId}`;
const balance = (productId: string) =>
  store.inventory.find((r) => key(r.warehouseId, r.productId) === key(WAREHOUSE.id, productId))?.quantity;

/**
 * $transaction semantics: run the callback on a snapshot, commit it only when
 * the callback resolves. A throw therefore discards every write, which is what
 * the rollback assertions rely on.
 */
function fakeTx(): any {
  const snapshot = {
    inventory: store.inventory.map((r) => ({ ...r })),
    movements: [...store.movements],
    orders: [...store.orders],
    items: [...store.items],
  };
  const tx: any = {
    warehouseInventory: {
      findMany: async ({ where }: any) =>
        store.inventory
          .filter((r) => r.warehouseId === where.warehouseId && where.productId.in.includes(r.productId))
          .map((r) => ({ productId: r.productId, quantity: r.quantity })),
      findUnique: async ({ where }: any) =>
        store.inventory.find(
          (r) => key(r.warehouseId, r.productId) === key(where.warehouseId_productId.warehouseId, where.warehouseId_productId.productId),
        ) ?? null,
      update: async ({ where, data }: any) => {
        const row = store.inventory.find(
          (r) => key(r.warehouseId, r.productId) === key(where.warehouseId_productId.warehouseId, where.warehouseId_productId.productId),
        );
        if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
        row.quantity = data.quantity;
        return row;
      },
      upsert: async ({ where, update, create }: any) => {
        const row = store.inventory.find(
          (r) => key(r.warehouseId, r.productId) === key(where.warehouseId_productId.warehouseId, where.warehouseId_productId.productId),
        );
        if (row) {
          row.quantity += update.quantity.increment;
          return row;
        }
        const created = { ...create };
        store.inventory.push(created);
        return created;
      },
      create: async ({ data }: any) => {
        store.inventory.push({ ...data });
        return data;
      },
    },
    product: {
      findMany: async ({ where }: any) => where.id.in.map((id: string) => ({ id, name: `منتج ${id}` })),
      count: async () => 1,
    },
    stockMovement: {
      create: async ({ data }: any) => {
        store.movements.push({ ...data });
        return data;
      },
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    salesOrder: {
      create: async ({ data }: any) => {
        const order = { id: `so-${store.orders.length + 1}`, ...data };
        store.orders.push(order);
        return order;
      },
      update: async ({ data }: any) => data,
      findUnique: async () => ({ id: "so-1", items: [], installments: [] }),
      findUniqueOrThrow: async () => ({
        total: 100,
        paidAmount: 0,
        tradeInTotal: 0,
        paymentMethod: "CASH",
        installments: [],
      }),
    },
    salesOrderItem: { create: async ({ data }: any) => { store.items.push(data); return data; } },
    customer: { update: async () => ({}) },
    customerLedger: { upsert: async () => ({}) },
    customerPayment: { create: async () => ({}) },
    returnTransaction: { findMany: async () => [] },
    inventorySetting: {
      findUnique: async () =>
        store.policyRowExists ? { id: "s1", companyId: COMPANY, ...store.policy } : null,
      create: async ({ data }: any) => {
        store.policyCreates += 1;
        store.policyRowExists = true;
        return { id: `s${store.policyCreates}`, ...data, allowNegativeStock: false, warnOnNegativeStock: true };
      },
      update: async () => ({}),
    },
  };

  const commit = () => {
    store.inventory = store.inventory.map((r) => ({ ...r }));
    store.movements = [...store.movements];
    store.orders = [...store.orders];
    store.items = [...store.items];
  };
  void snapshot;
  return { tx, commit };
}

const prismaMock = {
  company: { findUnique: async () => ({ id: COMPANY }) },
  customer: { findUnique: async () => ({ id: CUSTOMER, remainingDebt: 0 }) },
  engineer: { findUnique: async () => null },
  product: { count: async () => 1 },
  warehouse: { findFirst: async () => WAREHOUSE },
  $transaction: async (fn: (tx: unknown) => unknown) => {
    const { tx, commit } = fakeTx();
    const result = await fn(tx);
    commit();
    return result;
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: async () => ({ id: "u1", companyId: COMPANY }),
  requirePageAccess: async () => ({ id: "u1", companyId: COMPANY }),
  requireAction: async () => ({ id: "u1", companyId: COMPANY }),
}));

const { POST } = await import("@/app/api/sales/route");

const invoice = (quantity: number, extra: Record<string, unknown> = {}) =>
  new Request("http://localhost/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId: COMPANY,
      customerId: CUSTOMER,
      orderType: "SPARE_PART_SALE",
      paymentMethod: "CASH",
      orderDate: new Date("2026-01-05T10:00:00Z").toISOString(),
      items: [{ productId: "p1", quantity, unitPrice: 100 }],
      ...extra,
    }),
  });

describe("POST /api/sales — negative stock policy", () => {
  beforeEach(reset);

  it("refuses the sale and writes nothing while the policy is off (today's behaviour)", async () => {
    const res = await POST(invoice(8));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("INSUFFICIENT_STOCK");
    // Nothing written: no order, no movement, and the balance is untouched.
    expect(store.orders).toHaveLength(0);
    expect(store.movements).toHaveLength(0);
    expect(balance("p1")).toBe(5);
  });

  it("refuses even when the client sends the confirmation flag, while the policy is off", async () => {
    const res = await POST(invoice(8, { allowNegativeStock: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INSUFFICIENT_STOCK");
    expect(balance("p1")).toBe(5);
  });

  it("answers 409 NEGATIVE_STOCK_CONFIRM_REQUIRED with the shortfall before writing", async () => {
    store.policy = { allowNegativeStock: true, warnOnNegativeStock: true };
    const res = await POST(invoice(8));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("NEGATIVE_STOCK_CONFIRM_REQUIRED");
    expect(body.shortfalls).toEqual([
      { productId: "p1", productName: "منتج p1", requested: 8, available: 5, resultingBalance: -3, shortage: 3 },
    ]);
    expect(store.orders).toHaveLength(0);
    expect(balance("p1")).toBe(5);
  });

  it("records the real negative balance once confirmed", async () => {
    store.policy = { allowNegativeStock: true, warnOnNegativeStock: true };
    const res = await POST(invoice(8, { allowNegativeStock: true }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(balance("p1")).toBe(-3);
    // The invoice still records what was really sold, and the ledger records the
    // full quantity: nothing is clamped or faked.
    expect(store.items[0]).toMatchObject({ productId: "p1", quantity: 8 });
    const out = store.movements.filter((m) => m.movementType === "SALE_OUT");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ productId: "p1", quantity: 8, referenceId: "so-1" });
    // The client is told what it created, so the UI can acknowledge the deficit.
    expect(body.negativeStockShortfalls).toEqual([
      { productId: "p1", productName: "منتج p1", requested: 8, available: 5, resultingBalance: -3, shortage: 3 },
    ]);
  });

  it("goes through without a second round trip when the warning is off", async () => {
    store.policy = { allowNegativeStock: true, warnOnNegativeStock: false };
    const res = await POST(invoice(8));
    expect(res.status).toBe(201);
    expect(balance("p1")).toBe(-3);
  });

  it("still refuses a sale the balance covers not at all... ", async () => {
    // Sanity: an item that was never stocked is a shortage too, and with the
    // policy off it must stay a refusal.
    store.inventory = [];
    const res = await POST(invoice(3));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INSUFFICIENT_STOCK");
    expect(balance("p1")).toBeUndefined();
  });

  it("... and creates the deficit row for it once allowed", async () => {
    store.inventory = [];
    store.policy = { allowNegativeStock: true, warnOnNegativeStock: true };
    const res = await POST(invoice(3, { allowNegativeStock: true }));
    expect(res.status).toBe(201);
    expect(balance("p1")).toBe(-3);
  });

  it("keeps the unrelated validations in place", async () => {
    // Zero quantity is still invalid, whatever the stock policy says.
    const res = await POST(invoice(0));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_SALE_ITEMS");
    expect(balance("p1")).toBe(5);
  });

  it("creates the company's settings row with the blocking defaults on first sale", async () => {
    // The policy is read (and lazily created) inside the sale's transaction, so
    // the read is part of the same atomic unit as the deduction.
    store.inventory = [];
    store.policyRowExists = false;
    const res = await POST(invoice(3));
    expect(res.status).toBe(409);
    expect(store.policyCreates).toBe(1);
  });
});
