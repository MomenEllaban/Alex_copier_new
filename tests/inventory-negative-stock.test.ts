import { describe, expect, it, beforeEach } from "vitest";
import {
  STOCK_BLOCKED,
  STOCK_CONFIRM_REQUIRED,
  StockShortfallError,
  deductStockForSale,
  findShortfalls,
  receivePurchaseIntoStock,
  reversePurchaseFromStock,
  totalByProduct,
  type InventoryTx,
  type StockLine,
} from "@/lib/stock-movement-helper";
import {
  DEFAULT_INVENTORY_POLICY,
  getInventoryPolicy,
  type InventoryPolicy,
} from "@/lib/services/inventory/inventory-settings-service";

const ALLOW: InventoryPolicy = { allowNegativeStock: true, warnOnNegativeStock: true };
const ALLOW_SILENT: InventoryPolicy = { allowNegativeStock: true, warnOnNegativeStock: false };
const BLOCK: InventoryPolicy = { allowNegativeStock: false, warnOnNegativeStock: true };

/**
 * A stand-in for the `tx` inside a sale's $transaction.
 *
 * Only WarehouseInventory and Product are touched by the sale path, so the fake
 * keeps just those two tables — in memory, keyed the same way the real ones are.
 * The point of the fake is that assertions can look at the FINAL balance, which
 * is the number that has to be right when a sale goes negative.
 */
function fakeTx(initial: Record<string, number>) {
  // key: warehouseId:productId -> quantity (may be negative)
  const rows = new Map<string, number>(Object.entries(initial));
  const created: Array<{ warehouseId: string; productId: string; quantity: number }> = [];
  const names = new Map<string, string>();
  const movements: Array<Record<string, unknown>> = [];
  const purchasePrices = new Map<string, number>();

  const key = (warehouseId: string, productId: string) => `${warehouseId}:${productId}`;

  const tx = {
    warehouseInventory: {
      findMany: async ({ where }: { where: { warehouseId: string; productId: { in: string[] } } }) =>
        where.productId.in
          .filter((productId) => rows.has(key(where.warehouseId, productId)))
          .map((productId) => ({
            productId,
            quantity: rows.get(key(where.warehouseId, productId))!,
          })),
      findUnique: async ({ where }: any) => {
        const quantity = rows.get(key(where.warehouseId_productId.warehouseId, where.warehouseId_productId.productId));
        return quantity === undefined ? null : { productId: where.warehouseId_productId.productId, quantity };
      },
      upsert: async ({ where, update, create }: any) => {
        // Prisma accepts both an absolute `quantity` and an `{ increment }`
        // delta here, and the real helpers use each in its own place.
        const k = key(where.warehouseId_productId.warehouseId, where.warehouseId_productId.productId);
        const delta = update.quantity?.increment;
        if (rows.has(k) && delta === undefined && typeof update.quantity === "number") {
          rows.set(k, update.quantity);
        } else if (rows.has(k)) {
          rows.set(k, rows.get(k)! + (delta ?? update.quantity));
        } else {
          rows.set(k, create.quantity);
          created.push(create);
        }
        return { productId: where.warehouseId_productId.productId, quantity: rows.get(k)! };
      },
      update: async ({ where, data }: { where: { warehouseId_productId: { warehouseId: string; productId: string } }; data: { quantity: number } }) => {
        rows.set(key(where.warehouseId_productId.warehouseId, where.warehouseId_productId.productId), data.quantity);
        return data;
      },
      create: async ({ data }: { data: { warehouseId: string; productId: string; quantity: number } }) => {
        rows.set(key(data.warehouseId, data.productId), data.quantity);
        created.push(data);
        return data;
      },
    },
    product: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, name: names.get(id) ?? id })),
      update: async ({ where, data }: any) => {
        purchasePrices.set(where.id, data.purchasePrice);
        return data;
      },
    },
    stockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        movements.push(data);
        return data;
      },
      findMany: async ({ where }: any) =>
        movements.filter((m) =>
          Object.entries(where).every(([field, value]: [string, any]) =>
            value === undefined || m[field] === value,
          ),
        ),
      deleteMany: async ({ where }: any) => {
        const keep = movements.filter((m) =>
          !Object.entries(where).every(([field, value]: [string, any]) =>
            value === undefined || m[field] === value,
          ),
        );
        const count = movements.length - keep.length;
        movements.length = 0;
        movements.push(...keep);
        return { count };
      },
    },
  };

  return {
    tx: tx as unknown as InventoryTx,
    rows,
    created,
    movements,
    purchasePrices,
    /** The balance the reports and the inventory page will read. */
    balance: (warehouseId: string, productId: string) => rows.get(key(warehouseId, productId)),
    name: (productId: string, label: string) => names.set(productId, label),
  };
}

const W = "wh-1";

describe("totalByProduct", () => {
  it("adds up a product repeated across invoice lines", () => {
    const totals = totalByProduct([
      { productId: "p1", quantity: 2 },
      { productId: "p2", quantity: 7 },
      { productId: "p1", quantity: 3 },
    ]);
    expect(totals.get("p1")).toBe(5);
    expect(totals.get("p2")).toBe(7);
  });
});

describe("findShortfalls", () => {
  it("reports requested, available, the resulting balance and the gap, worst first", () => {
    const balances = new Map([
      ["p1", { available: 5, name: "تونر" }],
      ["p2", { available: 0, name: "درام" }],
      ["p3", { available: 4, name: "رول" }],
    ]);
    const totals = new Map([
      ["p1", 8],
      ["p2", 1],
      ["p3", 4],
    ]);

    const shortfalls = findShortfalls(totals, balances);
    expect(shortfalls).toEqual([
      { productId: "p1", productName: "تونر", requested: 8, available: 5, resultingBalance: -3, shortage: 3 },
      { productId: "p2", productName: "درام", requested: 1, available: 0, resultingBalance: -1, shortage: 1 },
    ]);
  });

  it("treats an item that is already in deficit as having negative availability", () => {
    const balances = new Map([["p1", { available: -3, name: "تونر" }]]);
    const [shortfall] = findShortfalls(new Map([["p1", 8]]), balances);
    expect(shortfall.available).toBe(-3);
    expect(shortfall.resultingBalance).toBe(-11);
    expect(shortfall.shortage).toBe(11);
  });
});

describe("deductStockForSale", () => {
  let db: ReturnType<typeof fakeTx>;

  beforeEach(() => {
    db = fakeTx({ [`${W}:p1`]: 5, [`${W}:p2`]: 10 });
    db.name("p1", "تونر");
    db.name("p2", "درام");
  });

  const sell = (lines: StockLine[], policy: InventoryPolicy, confirmed = false) =>
    deductStockForSale(db.tx, { warehouseId: W, lines, policy, confirmed });

  it("BLOCKS the sale and changes nothing when the policy is off", async () => {
    await expect(sell([{ productId: "p1", quantity: 8 }], BLOCK)).rejects.toMatchObject({
      code: STOCK_BLOCKED,
      message: `${STOCK_BLOCKED}:p1`,
    });
    // The numbers must be untouched, not partially deducted.
    expect(db.balance(W, "p1")).toBe(5);
  });

  it("stays blocked even when the client sends the confirmation flag", async () => {
    // The flag confirms the WARNING, it is not a way to opt the company in.
    await expect(sell([{ productId: "p1", quantity: 8 }], BLOCK, true)).rejects.toBeInstanceOf(
      StockShortfallError,
    );
    expect(db.balance(W, "p1")).toBe(5);
  });

  it("asks for confirmation instead of selling when the warning is on", async () => {
    const error = await sell([{ productId: "p1", quantity: 8 }], ALLOW).catch((e) => e);
    expect(error).toBeInstanceOf(StockShortfallError);
    expect(error.code).toBe(STOCK_CONFIRM_REQUIRED);
    expect(error.shortfalls).toEqual([
      { productId: "p1", productName: "تونر", requested: 8, available: 5, resultingBalance: -3, shortage: 3 },
    ]);
    // Nothing is written before the user says yes.
    expect(db.balance(W, "p1")).toBe(5);
  });

  it("records the real negative balance once the user confirms", async () => {
    const shortfalls = await sell([{ productId: "p1", quantity: 8 }], ALLOW, true);
    expect(shortfalls).toHaveLength(1);
    // opening 5, sold 8 -> the books carry -3
    expect(db.balance(W, "p1")).toBe(-3);
  });

  it("goes through silently when the warning is turned off", async () => {
    await sell([{ productId: "p1", quantity: 8 }], ALLOW_SILENT);
    expect(db.balance(W, "p1")).toBe(-3);
  });

  it("does not create a row for an item that had stock, and deducts only what was sold", async () => {
    await sell([{ productId: "p2", quantity: 4 }], ALLOW, true);
    expect(db.balance(W, "p2")).toBe(6);
    expect(db.created).toHaveLength(0);
  });

  it("creates a row at the negative balance for a product that was never stocked", async () => {
    // A never-stocked item reads as 0, which is exactly what makes it a
    // shortfall — and the deficit has to exist as a row afterwards, or the
    // reports and the inventory page would never show it.
    await sell([{ productId: "p-new", quantity: 3 }], ALLOW, true);
    expect(db.balance(W, "p-new")).toBe(-3);
    expect(db.created).toEqual([{ warehouseId: W, productId: "p-new", quantity: -3 }]);
  });

  it("aggregates repeated lines of the same product before checking", async () => {
    // 4 + 4 = 8 against a balance of 5: refused as one 3-unit shortage, not
    // two "4 <= 5 is fine" passes.
    await expect(
      sell([{ productId: "p1", quantity: 4 }, { productId: "p1", quantity: 4 }], BLOCK),
    ).rejects.toMatchObject({ code: STOCK_BLOCKED });

    await sell([{ productId: "p1", quantity: 4 }, { productId: "p1", quantity: 4 }], ALLOW, true);
    expect(db.balance(W, "p1")).toBe(-3);
  });

  it("allows a sale that exactly consumes the balance", async () => {
    const accepted = await sell([{ productId: "p1", quantity: 5 }], ALLOW);
    expect(accepted).toHaveLength(0);
    expect(db.balance(W, "p1")).toBe(0);
  });

  it("recovers from a deficit with a later receipt", async () => {
    await sell([{ productId: "p1", quantity: 8 }], ALLOW, true);
    expect(db.balance(W, "p1")).toBe(-3);

    await receivePurchaseIntoStock(db.tx, {
      purchaseOrderId: "po-1",
      warehouseId: W,
      items: [{ productId: "p1", quantity: 10 }],
      notes: "استلام",
    });
    // The purchase is a plain increment: -3 + 10 = 7, never clamped to 0.
    expect(db.balance(W, "p1")).toBe(7);
    // It is a real receipt: PURCHASE_IN recorded against the purchase order.
    expect(db.movements).toContainEqual(
      expect.objectContaining({ movementType: "PURCHASE_IN", quantity: 10, purchaseOrderId: "po-1" }),
    );

    // And a sale from there is checked against 7, not against 0.
    await sell([{ productId: "p1", quantity: 7 }], ALLOW);
    expect(db.balance(W, "p1")).toBe(0);
  });

  it("lets a purchase that never happened be un-received only while the units are still there", async () => {
    await receivePurchaseIntoStock(db.tx, {
      purchaseOrderId: "po-2",
      warehouseId: W,
      items: [{ productId: "p1", quantity: 10 }],
    });
    expect(db.balance(W, "p1")).toBe(15);

    // Un-receiving an intact receipt is a plain reversal.
    await reversePurchaseFromStock(db.tx, "po-2");
    expect(db.balance(W, "p1")).toBe(5);
    expect(db.movements.filter((m) => m.movementType === "PURCHASE_IN")).toHaveLength(0);
    expect(db.movements).toContainEqual(
      expect.objectContaining({ movementType: "ADJUSTMENT", quantity: 10, purchaseOrderId: "po-2" }),
    );

    // But once the received units have been sold on, taking them back would
    // invent stock that does not exist — refused, and the receipt is kept so the
    // history stays true.
    await receivePurchaseIntoStock(db.tx, {
      purchaseOrderId: "po-3",
      warehouseId: W,
      items: [{ productId: "p1", quantity: 10 }],
    });
    await sell([{ productId: "p1", quantity: 20 }], ALLOW, true);
    expect(db.balance(W, "p1")).toBe(-5);

    await expect(reversePurchaseFromStock(db.tx, "po-3")).rejects.toThrow("INSUFFICIENT_STOCK:p1");
    expect(db.balance(W, "p1")).toBe(-5);
    expect(db.movements).toContainEqual(
      expect.objectContaining({ movementType: "PURCHASE_IN", purchaseOrderId: "po-3" }),
    );
  });

  it("leaves other products alone when one line is short", async () => {
    const error = await sell(
      [{ productId: "p1", quantity: 8 }, { productId: "p2", quantity: 2 }],
      BLOCK,
    ).catch((e) => e);
    expect(error.code).toBe(STOCK_BLOCKED);
    expect(db.balance(W, "p2")).toBe(10);
  });

  it("is a no-op for an invoice with no items", async () => {
    expect(await sell([], ALLOW)).toEqual([]);
  });
});

describe("getInventoryPolicy", () => {
  const row = {
    id: "s1",
    companyId: "c1",
    allowNegativeStock: true,
    warnOnNegativeStock: false,
  };

  it("creates the row with the blocking defaults the first time", async () => {
    const created: unknown[] = [];
    const client = {
      inventorySetting: {
        findUnique: async () => null,
        create: async (args: { data: { companyId: string } }) => {
          created.push(args.data);
          return { ...row, ...args.data, allowNegativeStock: false, warnOnNegativeStock: true };
        },
      },
    };
    const policy = await getInventoryPolicy("c1", client as any);
    expect(created).toEqual([{ companyId: "c1" }]);
    expect(policy).toEqual(DEFAULT_INVENTORY_POLICY);
  });

  it("returns the stored policy without writing when the row exists", async () => {
    let createCalls = 0;
    const client = {
      inventorySetting: {
        findUnique: async () => row,
        create: async () => {
          createCalls += 1;
          return row;
        },
      },
    };
    expect(await getInventoryPolicy("c1", client as any)).toEqual({
      allowNegativeStock: true,
      warnOnNegativeStock: false,
    });
    expect(createCalls).toBe(0);
  });
});
