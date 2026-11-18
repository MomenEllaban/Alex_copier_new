import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Trade-in invoices: N returned items <-> N received lines.
 *
 * Prisma is faked as a tiny in-memory store so the assertions can inspect the
 * rows the routes actually wrote — stock movements, warehouse balances,
 * customer debt and the returned-item rows — instead of trusting a spy.
 */
import {
  legacyTradeIns,
  parseTradeIns,
  tradeInCreditTotal,
} from "@/lib/trade-in-items";

const COMPANY = "c1";
const CUSTOMER = "cust-1";
const WAREHOUSE = { id: "wh-1" };

type Row = { warehouseId: string; productId: string; quantity: number };
type Movement = {
  warehouseId: string; productId: string; quantity: number;
  movementType: string; referenceId?: string | null; notes?: string | null;
};

const store = {
  inventory: [] as Row[],
  movements: [] as Movement[],
  orders: [] as Record<string, any>[],
  items: [] as Record<string, any>[],
  tradeIns: [] as Record<string, any>[],
  products: [] as Record<string, any>[],
  debt: { totalDebt: 0, remainingDebt: 0 },
  ledger: [] as Record<string, any>[],
  payments: [] as Record<string, any>[],
};

function reset() {
  store.inventory = [
    { warehouseId: WAREHOUSE.id, productId: "p1", quantity: 10 },
    { warehouseId: WAREHOUSE.id, productId: "p2", quantity: 10 },
  ];
  store.movements = [];
  store.orders = [];
  store.items = [];
  store.tradeIns = [];
  store.products = [];
  store.debt = { totalDebt: 0, remainingDebt: 0 };
  store.ledger = [];
  store.payments = [];
  productSeq = 0;
}

let productSeq = 0;
const key = (warehouseId: string, productId: string) => `${warehouseId}:${productId}`;
const balance = (productId: string) =>
  store.inventory.find((r) => key(r.warehouseId, r.productId) === key(WAREHOUSE.id, productId))?.quantity;
const movementTotal = (productId: string, type: string) =>
  store.movements
    .filter((m) => m.productId === productId && m.movementType === type)
    .reduce((sum, m) => sum + m.quantity, 0);

function makeTx() {
  const tx: any = {
    inventorySetting: {
      findUnique: async () => ({ id: "s1", companyId: COMPANY, allowNegativeStock: false, warnOnNegativeStock: false }),
      create: async ({ data }: any) => ({ id: "s1", ...data }),
      update: async () => ({}),
    },
    warehouseInventory: {
      findMany: async ({ where }: any) =>
        store.inventory.filter((r) => r.warehouseId === where.warehouseId && where.productId.in.includes(r.productId)),
      findUnique: async ({ where }: any) =>
        store.inventory.find((r) => key(r.warehouseId, r.productId) === key(where.warehouseId_productId.warehouseId, where.warehouseId_productId.productId)) ?? null,
      update: async ({ where, data }: any) => {
        const row = store.inventory.find((r) => key(r.warehouseId, r.productId) === key(where.warehouseId_productId.warehouseId, where.warehouseId_productId.productId))!;
        row.quantity = data.quantity;
        return row;
      },
      upsert: async ({ where, update, create }: any) => {
        const row = store.inventory.find((r) => key(r.warehouseId, r.productId) === key(where.warehouseId_productId.warehouseId, where.warehouseId_productId.productId));
        if (row) {
          row.quantity += update.quantity.increment ?? 0;
          return row;
        }
        const created = { ...create };
        store.inventory.push(created);
        return created;
      },
      create: async ({ data }: any) => {
        const created = { ...data };
        store.inventory.push(created);
        return created;
      },
    },
    product: {
      findMany: async ({ where }: any) => where.id.in.map((id: string) => ({ id, name: `منتج ${id}` })),
      count: async ({ where }: any) => new Set(where.id.in).size,
      create: async ({ data }: any) => {
        const created = { id: `ti-${++productSeq}`, ...data };
        store.products.push(created);
        return created;
      },
      deleteMany: async ({ where }: any) => {
        const ids: string[] = where.id.in ?? [];
        const removed = store.products.filter((p) => ids.includes(p.id));
        store.products = store.products.filter((p) => !ids.includes(p.id));
        store.inventory = store.inventory.filter((r) => !ids.includes(r.productId));
        return { count: removed.length };
      },
    },
    stockMovement: {
      create: async ({ data }: any) => {
        const created = { ...data };
        store.movements.push(created);
        return created;
      },
      findMany: async ({ where }: any) => store.movements.filter((m) => m.referenceId === where.referenceId),
      deleteMany: async ({ where }: any) => {
        const before = store.movements.length;
        store.movements = store.movements.filter((m) => m.referenceId !== where.referenceId);
        return { count: before - store.movements.length };
      },
    },
    salesOrder: {
      create: async ({ data }: any) => {
        const created = { id: `so-${store.orders.length + 1}`, ...data };
        store.orders.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const order = store.orders.find((o) => o.id === where.id)!;
        Object.assign(order, data);
        return order;
      },
      findUnique: async ({ where }: any) => {
        const order = store.orders.find((o) => o.id === where.id);
        return order ? {
          ...order,
          items: store.items.filter((i) => i.salesOrderId === where.id),
          tradeInItems: store.tradeIns.filter((t) => t.salesOrderId === where.id).map((t) => ({ ...t, product: store.products.find((p) => p.id === t.productId) })),
          installments: [],
        } : null;
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const order = store.orders.find((o) => o.id === where.id)!;
        return { total: order.total, paidAmount: order.paidAmount, tradeInTotal: order.tradeInTotal, paymentMethod: order.paymentMethod };
      },
      delete: async ({ where }: any) => {
        store.orders = store.orders.filter((o) => o.id !== where.id);
        return { id: where.id };
      },
    },
    salesOrderItem: {
      create: async ({ data }: any) => { store.items.push({ ...data }); return data; },
      deleteMany: async ({ where }: any) => {
        store.items = store.items.filter((i) => i.salesOrderId !== where.salesOrderId);
        return { count: 0 };
      },
    },
    tradeInItem: {
      create: async ({ data }: any) => {
        const created = { id: `tii-${store.tradeIns.length + 1}`, ...data };
        store.tradeIns.push(created);
        return created;
      },
      findMany: async ({ where }: any) => store.tradeIns.filter((t) => t.salesOrderId === where.salesOrderId),
      deleteMany: async ({ where }: any) => {
        const before = store.tradeIns.length;
        store.tradeIns = store.tradeIns.filter((t) => t.salesOrderId !== where.salesOrderId);
        return { count: before - store.tradeIns.length };
      },
    },
    customer: {
      findUnique: async () => ({ id: CUSTOMER, ...store.debt }),
      update: async ({ data }: any) => {
        if (typeof data.totalDebt === "number") store.debt.totalDebt = data.totalDebt;
        else if (data.totalDebt?.increment) store.debt.totalDebt += data.totalDebt.increment;
        if (typeof data.remainingDebt === "number") store.debt.remainingDebt = data.remainingDebt;
        else if (data.remainingDebt?.increment) store.debt.remainingDebt += data.remainingDebt.increment;
        return store.debt;
      },
    },
    customerLedger: {
      upsert: async ({ update, create }: any) => {
        const existingLedger = store.ledger.find((l) => l.companyId === COMPANY);
        if (existingLedger) {
          if (update.balance?.increment) existingLedger.balance += update.balance.increment;
          if (typeof update.balance === "number") existingLedger.balance = update.balance;
          if (update.balance?.decrement) existingLedger.balance -= update.balance.decrement;
        } else {
          store.ledger.push({ companyId: COMPANY, ...create });
        }
        return {};
      },
    },
    customerPayment: {
      create: async ({ data }: any) => { store.payments.push({ ...data }); return data; },
      deleteMany: async () => ({ count: 0 }),
    },
    returnTransaction: { findMany: async () => [] },
  };

  return tx;
}

const prismaMock = {
  company: { findUnique: async () => ({ id: COMPANY }) },
  customer: { findUnique: async () => ({ id: CUSTOMER, ...store.debt }) },
  engineer: { findUnique: async () => null },
  product: { count: async ({ where }: any) => new Set(where.id.in).size },
  warehouse: { findFirst: async () => WAREHOUSE },
  salesOrder: { findUnique: async ({ where }: any) => {
    const order = store.orders.find((o) => o.id === where.id);
    return order ? {
      ...order,
      items: store.items.filter((i) => i.salesOrderId === where.id).map((i) => ({ ...i, tradeInProduct: null })),
      tradeInItems: store.tradeIns.filter((t) => t.salesOrderId === where.id).map((t) => ({ productId: t.productId })),
      installments: [],
      returns: [],
    } : null;
  } },
  $transaction: async (fn: (tx: unknown) => unknown) => fn(makeTx()),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: async () => ({ id: "u1", companyId: COMPANY }),
  requirePageAccess: async () => ({ id: "u1", companyId: COMPANY }),
  requireAction: async () => ({ id: "u1", companyId: COMPANY }),
}));

const { POST } = await import("@/app/api/sales/route");
const { PUT, DELETE } = await import("@/app/api/sales/[id]/route");

const request = (body: Record<string, unknown>, method = "POST", id = "so-1") =>
  new Request(`http://localhost/api/sales${method === "POST" ? "" : `/${id}`}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId: COMPANY,
      customerId: CUSTOMER,
      orderType: "SPARE_PART_SALE",
      paymentMethod: "CREDIT",
      orderDate: "2026-01-05T10:00:00Z",
      items: [
        { productId: "p1", quantity: 2, unitPrice: 100 },
        { productId: "p2", quantity: 1, unitPrice: 100 },
      ],
      ...body,
    }),
  });

const TWO_RETURNED = {
  tradeIns: [
    { name: "ماكينة قديمة A", brand: "Canon", condition: "good", quantity: 2, value: 50, serialNumber: "SN-A" },
    { name: "طnr قديم B", quantity: 1, value: 50, condition: "fair" },
  ],
};

describe("trade-in items helper", () => {
  it("rejects missing names, non-integer quantities and negative values", () => {
    expect(() => parseTradeIns([{ name: "", quantity: 1, value: 10 }])).toThrow();
    expect(() => parseTradeIns([{ name: "x", quantity: 1.5, value: 10 }])).toThrow();
    expect(() => parseTradeIns([{ name: "x", quantity: 1, value: -1 }])).toThrow();
    expect(() => parseTradeIns({})).toThrow();
  });

  it("sums quantity × per-unit value and still reads legacy per-line trade-ins", () => {
    const parsed = parseTradeIns(TWO_RETURNED.tradeIns);
    expect(tradeInCreditTotal(parsed)).toBe(150);
    expect(legacyTradeIns([{ tradeIn: { name: "old", value: 70 } }])).toEqual([
      expect.objectContaining({ name: "old", quantity: 1, value: 70 }),
    ]);
  });
});

describe("POST /api/sales — many returned items", () => {
  beforeEach(reset);

  it("creates a stock row and movement per returned item with its own quantity", async () => {
    const res = await POST(request(TWO_RETURNED));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tradeInTotal).toBe(150);
    expect(store.tradeIns).toHaveLength(2);
    expect(store.tradeIns.map((t) => t.quantity)).toEqual([2, 1]);
    expect(store.tradeIns.map((t) => t.unitValue)).toEqual([50, 50]);

    const ti1 = store.tradeIns[0].productId;
    const ti2 = store.tradeIns[1].productId;
    expect(balance(ti1)).toBe(2);
    expect(balance(ti2)).toBe(1);
    expect(movementTotal(ti1, "PURCHASE_IN")).toBe(2);
    expect(movementTotal(ti2, "PURCHASE_IN")).toBe(1);
    // Received items were deducted independently (N received lines).
    expect(movementTotal("p1", "SALE_OUT")).toBe(2);
    expect(movementTotal("p2", "SALE_OUT")).toBe(1);
  });

  it("puts the whole returned value on the customer account, not just the first item", async () => {
    const res = await POST(request(TWO_RETURNED));
    expect(res.status).toBe(201);
    // invoice total 300, returned value 150 -> 150 goes on credit.
    expect(store.debt.remainingDebt).toBe(150);
    expect(store.ledger[0]).toMatchObject({ balance: 150 });
  });

  it("accepts the legacy per-line tradeIn as a one-unit fallback", async () => {
    const res = await POST(request({
      tradeIns: undefined,
      items: [
        { productId: "p1", quantity: 1, unitPrice: 100, tradeIn: { name: "قديم", value: 40 } },
      ],
    }));
    expect(res.status).toBe(201);
    expect(store.tradeIns).toHaveLength(1);
    expect(store.tradeIns[0]).toMatchObject({ quantity: 1, unitValue: 40 });
  });

  it("refuses an invalid returned line without writing anything", async () => {
    const res = await POST(request({ tradeIns: [{ name: "x", quantity: 0, value: 10 }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_TRADE_IN_ITEMS");
    expect(store.orders).toHaveLength(0);
    expect(store.movements).toHaveLength(0);
  });
});

describe("PUT / DELETE — many returned items", () => {
  beforeEach(reset);

  it("replaces every returned item on edit and reverses the old stock by its real quantity", async () => {
    const created = await POST(request(TWO_RETURNED));
    const { id } = await created.json();
    const oldProductIds = store.tradeIns.map((t) => t.productId);

    const edited = await PUT(request({ tradeIns: [
      { name: "جهاز جديد مستبدل", quantity: 3, value: 40 },
    ] }, "PUT", id), { params: Promise.resolve({ id }) });
    expect(edited.status).toBe(200);
    expect(store.tradeIns).toHaveLength(1);
    expect(store.tradeIns[0]).toMatchObject({ quantity: 3, unitValue: 40 });

    const newProductId = store.tradeIns[0].productId;
    expect(movementTotal(newProductId, "PURCHASE_IN")).toBe(3);
    expect(store.products.filter((p) => oldProductIds.includes(p.id)).map((p) => p.id)).toEqual([]);
    // The old PURCHASE_IN lines were reversed with their original quantities.
    const remainingIn = store.movements.filter((m) => m.movementType === "PURCHASE_IN");
    expect(remainingIn).toHaveLength(1);
    expect(remainingIn[0].quantity).toBe(3);
  });

  it("reverses every returned quantity and removes the products on delete", async () => {
    const created = await POST(request(TWO_RETURNED));
    const { id } = await created.json();
    const ti1 = store.tradeIns[0].productId;
    const ti2 = store.tradeIns[1].productId;

    const deleted = await DELETE(new Request(`http://localhost/api/sales/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });
    expect(deleted.status).toBe(200);
    expect(store.tradeIns).toHaveLength(0);
    expect(store.movements).toHaveLength(0);
    expect(balance(ti1)).toBeUndefined();
    expect(balance(ti2)).toBeUndefined();
    expect(store.orders).toHaveLength(0);
  });
});
