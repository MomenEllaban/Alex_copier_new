import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Edit and cancel of a sales invoice that already left stock negative.
 *
 * These two routes rewrite history rather than append to it: the edit reverses
 * the original movements and re-deducts, the cancel reverses and stops. The
 * failure mode that matters is therefore not "wrong number" but "half-applied" —
 * a reversal that survives a rejected re-deduction, or a second movement row
 * where there should be one. The fake below gives $transaction real rollback
 * semantics (writes land on a working copy that is published only if the
 * callback resolves) so those can be asserted instead of assumed.
 */

const WAREHOUSE = { id: "wh-1" };
const COMPANY = "c1";
const CUSTOMER = "cust-1";
const ORDER = "so-1";

type Row = { warehouseId: string; productId: string; quantity: number };
type Movement = { warehouseId: string; productId: string; quantity: number; movementType: string; referenceId?: string | null; notes?: string | null };

const store = {
  inventory: [] as Row[],
  movements: [] as Movement[],
  policy: { allowNegativeStock: false, warnOnNegativeStock: true } as {
    allowNegativeStock: boolean;
    warnOnNegativeStock: boolean;
  },
};

/** The state left behind by a confirmed sale of 8 against an opening balance of 5. */
function reset() {
  store.inventory = [{ warehouseId: WAREHOUSE.id, productId: "p1", quantity: -3 }];
  store.movements = [
    { warehouseId: WAREHOUSE.id, productId: "p1", quantity: 8, movementType: "SALE_OUT", referenceId: ORDER, notes: "بيع — SPARE_PART_SALE — so-1" },
  ];
  store.policy = { allowNegativeStock: false, warnOnNegativeStock: true };
}

const balance = () => store.inventory.find((r) => r.productId === "p1")?.quantity;
const saleOuts = () => store.movements.filter((m) => m.referenceId === ORDER && m.movementType === "SALE_OUT");

function buildTx(work: { inventory: Row[]; movements: Movement[] }) {
  const upsert = async ({ where, update, create }: any) => {
    const row = work.inventory.find((r) => r.productId === where.warehouseId_productId.productId && r.warehouseId === where.warehouseId_productId.warehouseId);
    if (row) {
      row.quantity += update.quantity.increment;
      return row;
    }
    const created = { ...create };
    work.inventory.push(created);
    return created;
  };

  return {
    warehouseInventory: {
      findMany: async ({ where }: any) =>
        work.inventory
          .filter((r) => r.warehouseId === where.warehouseId && where.productId.in.includes(r.productId))
          .map((r) => ({ productId: r.productId, quantity: r.quantity })),
      findUnique: async ({ where }: any) =>
        work.inventory.find((r) => r.productId === where.warehouseId_productId.productId) ?? null,
      update: async ({ where, data }: any) => {
        const row = work.inventory.find((r) => r.productId === where.warehouseId_productId.productId);
        if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
        row.quantity = data.quantity;
        return row;
      },
      upsert,
      create: async ({ data }: any) => {
        work.inventory.push({ ...data });
        return data;
      },
    },
    stockMovement: {
      findMany: async ({ where }: any) => work.movements.filter((m) => m.referenceId === where.referenceId),
      deleteMany: async ({ where }: any) => {
        const before = work.movements.length;
        work.movements = work.movements.filter((m) => m.referenceId !== where.referenceId);
        return { count: before - work.movements.length };
      },
      create: async ({ data }: any) => {
        work.movements.push({ ...data });
        return data;
      },
    },
    product: {
      findMany: async ({ where }: any) => where.id.in.map((id: string) => ({ id, name: `منتج ${id}` })),
      count: async () => 1,
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: any) => data,
    },
    salesOrder: {
      update: async ({ data }: any) => data,
      findUnique: async () => ({ id: ORDER, items: [], installments: [] }),
      findUniqueOrThrow: async () => ({ total: 800, paidAmount: 800, tradeInTotal: 0, paymentMethod: "CASH", installments: [] }),
      delete: async () => ({ id: ORDER }),
    },
    salesOrderItem: { deleteMany: async () => ({ count: 0 }), create: async () => ({}) },
    installment: { deleteMany: async () => ({ count: 0 }) },
    customer: { findUnique: async () => ({ totalDebt: 0, remainingDebt: 0, id: CUSTOMER }), update: async () => ({}) },
    customerLedger: { upsert: async () => ({}) },
    customerPayment: { create: async () => ({}), deleteMany: async () => ({ count: 0 }) },
    returnTransaction: { findMany: async () => [] },
    inventorySetting: {
      findUnique: async () => ({ id: "s1", companyId: COMPANY, ...store.policy }),
      create: async ({ data }: any) => ({ id: "s-new", ...data }),
      update: async () => ({}),
    },
  };
}

/** Writes to a working copy; publishes only on success. A throw leaves `store` untouched. */
async function withTx(fn: (tx: unknown) => unknown) {
  const work = { inventory: store.inventory.map((r) => ({ ...r })), movements: [...store.movements] };
  const result = await fn(buildTx(work));
  store.inventory = work.inventory;
  store.movements = work.movements;
  return result;
}

const existingOrder = {
  id: ORDER,
  customerId: CUSTOMER,
  companyId: COMPANY,
  paymentMethod: "CASH",
  total: 800,
  paidAmount: 800,
  creditUsed: 0,
  tradeInTotal: 0,
  orderDate: new Date("2026-01-05T10:00:00Z"),
  items: [{ id: "it1", tradeInProductId: null }],
  installments: [],
  returns: [],
};

const prismaMock = {
  salesOrder: { findUnique: async () => existingOrder },
  company: { findUnique: async () => ({ id: COMPANY }) },
  customer: { findUnique: async () => ({ id: CUSTOMER }) },
  engineer: { findUnique: async () => null },
  product: { count: async () => 1 },
  warehouse: { findFirst: async () => WAREHOUSE },
  $transaction: withTx,
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: async () => ({ id: "u1", companyId: COMPANY }),
  requirePageAccess: async () => ({ id: "u1", companyId: COMPANY }),
  requireAction: async () => ({ id: "u1", companyId: COMPANY }),
}));

const { PUT, DELETE } = await import("@/app/api/sales/[id]/route");

const params = Promise.resolve({ id: ORDER });

const edit = (quantity: number, extra: Record<string, unknown> = {}) =>
  PUT(
    new Request(`http://localhost/api/sales/${ORDER}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: COMPANY,
        customerId: CUSTOMER,
        orderType: "SPARE_PART_SALE",
        paymentMethod: "CASH",
        orderDate: "2026-01-05T10:00:00Z",
        items: [{ productId: "p1", quantity, unitPrice: 100 }],
        ...extra,
      }),
    }),
    { params },
  );

describe("PUT /api/sales/:id — editing an invoice that went negative", () => {
  beforeEach(reset);

  it("refuses the edit while the policy is off and undoes the reversal it started", async () => {
    const res = await edit(8);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INSUFFICIENT_STOCK");
    // The edit restores the original 8 units before re-deducting; that restore
    // must not survive a rejected edit, or the invoice would silently give the
    // stock away.
    expect(balance()).toBe(-3);
    // ...and the original movement row is neither deleted nor duplicated.
    expect(saleOuts()).toHaveLength(1);
    expect(saleOuts()[0].notes).toBe("بيع — SPARE_PART_SALE — so-1");
  });

  it("measures the warning against the balance the item will end on", async () => {
    store.policy = { allowNegativeStock: true, warnOnNegativeStock: true };
    const res = await edit(8);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("NEGATIVE_STOCK_CONFIRM_REQUIRED");
    // available is 5 (the 8 units came back first), not the -3 the invoice
    // currently leaves behind — the warning describes the real end state.
    expect(body.shortfalls).toEqual([
      { productId: "p1", productName: "منتج p1", requested: 8, available: 5, resultingBalance: -3, shortage: 3 },
    ]);
    expect(balance()).toBe(-3);
    expect(saleOuts()).toHaveLength(1);
  });

  it("applies the edit once confirmed, leaving one movement row and the new real balance", async () => {
    store.policy = { allowNegativeStock: true, warnOnNegativeStock: true };
    const res = await edit(12, { allowNegativeStock: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(balance()).toBe(-7);
    expect(saleOuts()).toHaveLength(1);
    expect(saleOuts()[0]).toMatchObject({ productId: "p1", quantity: 12, referenceId: ORDER });
    expect(body.negativeStockShortfalls).toEqual([
      { productId: "p1", productName: "منتج p1", requested: 12, available: 5, resultingBalance: -7, shortage: 7 },
    ]);
  });

  it("refuses an edit that would go negative even if the client claims confirmation, while the policy is off", async () => {
    const res = await edit(12, { allowNegativeStock: true });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INSUFFICIENT_STOCK");
    expect(balance()).toBe(-3);
    expect(saleOuts()).toHaveLength(1);
  });
});

describe("DELETE /api/sales/:id — cancelling a negative invoice", () => {
  beforeEach(reset);

  it("gives the units back and removes the movement instead of appending a correction", async () => {
    const res = await DELETE(new Request(`http://localhost/api/sales/${ORDER}`, { method: "DELETE" }), { params });
    expect(res.status).toBe(200);
    // -3 + 8 = the original 5: the deficit is undone, not merely not-repeated.
    expect(balance()).toBe(5);
    expect(saleOuts()).toHaveLength(0);
    expect(store.movements).toHaveLength(0);
  });
});