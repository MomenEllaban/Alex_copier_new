import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Intercompany sale against the SOURCE company's policy.
 *
 * An intercompany invoice is two stock events in one transaction: the source
 * warehouse ships out (and may legitimately go negative), while the destination
 * receives and immediately consumes the very same units. That asymmetry is the
 * thing to pin down — the source must follow the source company's setting, the
 * destination must never be able to grant permission by having a lax setting of
 * its own, and the destination's balance must end up untouched (in then out).
 *
 * As in the sibling route test, the fake $transaction only publishes its writes
 * if the callback resolves, so "nothing was created" is asserted, not assumed.
 */

const FROM = "from-co";
const TO = "to-co";
const CUSTOMER = "cust-1";
const SOURCE_WH = "wh-from";
const TARGET_WH = "wh-to";

const store = {
  inventory: [] as Array<{ warehouseId: string; productId: string; quantity: number }>,
  movements: [] as Array<Record<string, any>>,
  orders: [] as Array<Record<string, unknown>>,
  interInvoices: [] as Array<Record<string, unknown>>,
  journalEntries: [] as Array<Record<string, unknown>>,
  policies: {} as Record<string, { allowNegativeStock: boolean; warnOnNegativeStock: boolean }>,
};

function reset() {
  store.inventory = [{ warehouseId: SOURCE_WH, productId: "p1", quantity: 5 }];
  store.movements = [];
  store.orders = [];
  store.interInvoices = [];
  store.journalEntries = [];
  store.policies = {
    [FROM]: { allowNegativeStock: false, warnOnNegativeStock: true },
    [TO]: { allowNegativeStock: false, warnOnNegativeStock: true },
  };
}

const sourceBalance = () => store.inventory.find((r) => r.warehouseId === SOURCE_WH && r.productId === "p1")?.quantity;
const targetBalance = () => store.inventory.find((r) => r.warehouseId === TARGET_WH && r.productId === "p1")?.quantity;
const movementsAt = (warehouseId: string, movementType: string) =>
  store.movements.filter((m) => m.warehouseId === warehouseId && m.movementType === movementType);

function buildTx(work: { inventory: typeof store.inventory; movements: typeof store.movements; orders: typeof store.orders; interInvoices: typeof store.interInvoices; journalEntries: typeof store.journalEntries }) {
  const findRow = (warehouseId: string, productId: string) =>
    work.inventory.find((r) => r.warehouseId === warehouseId && r.productId === productId);

  return {
    warehouse: {
      findMany: async () => [
        { id: SOURCE_WH, companyId: FROM },
        { id: TARGET_WH, companyId: TO },
      ],
    },
    warehouseInventory: {
      findMany: async ({ where }: any) =>
        work.inventory
          .filter((r) => r.warehouseId === where.warehouseId && where.productId.in.includes(r.productId))
          .map((r) => ({ productId: r.productId, quantity: r.quantity })),
      findUnique: async ({ where }: any) =>
        findRow(where.warehouseId_productId.warehouseId, where.warehouseId_productId.productId) ?? null,
      update: async ({ where, data }: any) => {
        const row = findRow(where.warehouseId_productId.warehouseId, where.warehouseId_productId.productId);
        if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
        row.quantity = data.quantity;
        return row;
      },
      upsert: async ({ where, update, create }: any) => {
        const row = findRow(where.warehouseId_productId.warehouseId, where.warehouseId_productId.productId);
        if (row) {
          row.quantity += update.quantity.increment;
          return row;
        }
        const created = { ...create };
        work.inventory.push(created);
        return created;
      },
      create: async ({ data }: any) => {
        work.inventory.push({ ...data });
        return data;
      },
    },
    product: {
      findMany: async ({ where }: any) => where.id.in.map((id: string) => ({ id, name: `منتج ${id}` })),
      count: async () => 1,
    },
    stockMovement: {
      create: async ({ data }: any) => {
        work.movements.push(data);
        return data;
      },
    },
    salesOrder: {
      create: async ({ data }: any) => {
        const order = { id: `ic-order-${work.orders.length + 1}`, ...data };
        work.orders.push(order);
        return order;
      },
      update: async ({ data }: any) => data,
      findUnique: async () => ({ id: "ic-order-1", items: [] }),
      findUniqueOrThrow: async () => ({ total: 0, paidAmount: 0, tradeInTotal: 0, paymentMethod: "CREDIT", installments: [] }),
    },
    salesOrderItem: { create: async ({ data }: any) => data },
    interCompanyInvoice: {
      create: async ({ data }: any) => {
        const invoice = { id: `ic-inv-${work.interInvoices.length + 1}`, ...data };
        work.interInvoices.push(invoice);
        return invoice;
      },
    },
    journalEntry: {
      create: async ({ data }: any) => {
        work.journalEntries.push(data);
        return data;
      },
    },
    account: { findFirst: async ({ where }: any) => ({ id: `acc-${where.companyId}-${where.code}` }) },
    customer: { findUnique: async () => ({ id: CUSTOMER, remainingDebt: 0 }), update: async () => ({}) },
    customerLedger: { upsert: async () => ({}) },
    customerPayment: { create: async () => ({}) },
    returnTransaction: { findMany: async () => [] },
    inventorySetting: {
      // Keyed by company so "which company's rule applied?" is answerable.
      findUnique: async ({ where }: any) => {
        const policy = store.policies[where.companyId];
        return policy ? { id: `set-${where.companyId}`, companyId: where.companyId, ...policy } : null;
      },
      create: async ({ data }: any) => ({ id: `set-${data.companyId}`, ...data, allowNegativeStock: false, warnOnNegativeStock: true }),
      update: async () => ({}),
    },
  };
}

async function withTx(fn: (tx: unknown) => unknown) {
  const work = {
    inventory: store.inventory.map((r) => ({ ...r })),
    movements: [...store.movements],
    orders: [...store.orders],
    interInvoices: [...store.interInvoices],
    journalEntries: [...store.journalEntries],
  };
  const result = await fn(buildTx(work));
  Object.assign(store, work);
  return result;
}

const prismaMock = {
  company: { findUnique: async ({ where }: any) => ({ id: where.id }) },
  customer: { findUnique: async () => ({ id: CUSTOMER, remainingDebt: 0 }) },
  engineer: { findUnique: async () => null },
  product: { count: async () => 1 },
  $transaction: withTx,
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: async () => ({ id: "u1", companyId: FROM }),
  requireAction: async () => ({ id: "u1", companyId: FROM }),
}));

const { POST } = await import("@/app/api/sales/intercompany/route");

const transfer = (quantity: number, extra: Record<string, unknown> = {}) =>
  POST(
    new Request("http://localhost/api/sales/intercompany", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromCompanyId: FROM,
        toCompanyId: TO,
        customerId: CUSTOMER,
        orderType: "SPARE_PART_SALE",
        paymentMethod: "CASH",
        items: [{ productId: "p1", quantity, internalPrice: 90, customerPrice: 100, costPrice: 60 }],
        ...extra,
      }),
    }),
  );

describe("POST /api/sales/intercompany — negative stock policy", () => {
  beforeEach(reset);

  it("refuses the transfer while the SOURCE company has the policy off, leaving no invoice behind", async () => {
    const res = await transfer(8);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INSUFFICIENT_STOCK");
    // The order and the internal invoice are created before the stock is
    // touched, so this is the assertion that they are not left orphaned.
    expect(store.orders).toHaveLength(0);
    expect(store.interInvoices).toHaveLength(0);
    expect(store.journalEntries).toHaveLength(0);
    expect(store.movements).toHaveLength(0);
    expect(sourceBalance()).toBe(5);
  });

  it("asks for confirmation against the source warehouse, still writing nothing", async () => {
    store.policies[FROM] = { allowNegativeStock: true, warnOnNegativeStock: true };
    const res = await transfer(8);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("NEGATIVE_STOCK_CONFIRM_REQUIRED");
    expect(body.shortfalls).toEqual([
      { productId: "p1", productName: "منتج p1", requested: 8, available: 5, resultingBalance: -3, shortage: 3 },
    ]);
    expect(store.orders).toHaveLength(0);
    expect(store.interInvoices).toHaveLength(0);
    expect(sourceBalance()).toBe(5);
  });

  it("applies the SOURCE policy even when the destination's is laxer", async () => {
    // The destination company has negatives switched on, but it is the SOURCE
    // warehouse that goes into deficit, so the source's setting is the one that
    // decides.
    store.policies[FROM] = { allowNegativeStock: false, warnOnNegativeStock: true };
    store.policies[TO] = { allowNegativeStock: true, warnOnNegativeStock: false };
    const res = await transfer(8, { allowNegativeStock: true });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INSUFFICIENT_STOCK");
    expect(sourceBalance()).toBe(5);
  });

  it("executes once confirmed, taking the source negative and leaving the destination flat", async () => {
    store.policies[FROM] = { allowNegativeStock: true, warnOnNegativeStock: true };
    const res = await transfer(8, { allowNegativeStock: true });
    expect(res.status).toBe(201);
    const body = await res.json();

    // Source: the real deficit, 5 − 8.
    expect(sourceBalance()).toBe(-3);
    expect(body.negativeStockShortfalls).toEqual([
      { productId: "p1", productName: "منتج p1", requested: 8, available: 5, resultingBalance: -3, shortage: 3 },
    ]);

    // Destination: received then consumed, so it ends flat at 0 — a transfer
    // must not leave stock sitting at the far end, and must not take it negative
    // either even though the source was allowed to.
    expect(targetBalance()).toBe(0);
    expect(movementsAt(TARGET_WH, "INTER_COMPANY_IN")).toHaveLength(1);
    expect(movementsAt(TARGET_WH, "SALE_OUT")).toHaveLength(1);

    // Source movement records the real quantity shipped, once.
    expect(movementsAt(SOURCE_WH, "INTER_COMPANY_OUT")).toHaveLength(1);
    expect(movementsAt(SOURCE_WH, "INTER_COMPANY_OUT")[0]).toMatchObject({ productId: "p1", quantity: 8 });
    expect(store.interInvoices).toHaveLength(1);
    // Journal entries for both sides are still produced.
    expect(store.journalEntries).toHaveLength(2);
  });

  it("goes through without a second round trip when the source's warning is off", async () => {
    store.policies[FROM] = { allowNegativeStock: true, warnOnNegativeStock: false };
    const res = await transfer(8);
    expect(res.status).toBe(201);
    expect(sourceBalance()).toBe(-3);
  });

  it("keeps the item validation in place", async () => {
    const res = await transfer(0);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_INTERCOMPANY_ITEMS");
    expect(sourceBalance()).toBe(5);
  });

  it("rejects a transfer to the same company", async () => {
    const res = await POST(
      new Request("http://localhost/api/sales/intercompany", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromCompanyId: FROM,
          toCompanyId: FROM,
          customerId: CUSTOMER,
          orderType: "SPARE_PART_SALE",
          paymentMethod: "CASH",
          items: [{ productId: "p1", quantity: 1, internalPrice: 90, customerPrice: 100 }],
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INTERCOMPANY_FIELDS_REQUIRED");
  });
});