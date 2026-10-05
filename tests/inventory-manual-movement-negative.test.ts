import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Manual stock movements typed on the inventory page, on a product that is
 * already in deficit.
 *
 * The negative-stock policy is deliberately scoped to sales, and this test is
 * the reason it can be: a clerk's manual movement must not be able to widen or
 * paper over the deficit the sales side was made to record honestly. Outbound
 * stays floored at what is physically there; inbound is a plain increment, so it
 * is also how a deficit gets recovered without an edit.
 */

const WAREHOUSE = "wh-1";

const store = {
  inventory: [] as Array<{ warehouseId: string; productId: string; quantity: number }>,
  movements: [] as Array<Record<string, any>>,
};

function reset(balance: number | null) {
  store.inventory = balance === null ? [] : [{ warehouseId: WAREHOUSE, productId: "p1", quantity: balance }];
  store.movements = [];
}

const balance = () => store.inventory.find((r) => r.productId === "p1")?.quantity;

async function withTx(fn: (tx: unknown) => unknown) {
  const work = {
    inventory: store.inventory.map((r) => ({ ...r })),
    movements: [...store.movements],
  };
  const result = await fn({
    warehouseInventory: {
      findUnique: async ({ where }: any) =>
        work.inventory.find(
          (r) => r.productId === where.warehouseId_productId.productId && r.warehouseId === where.warehouseId_productId.warehouseId,
        ) ?? null,
      update: async ({ where, data }: any) => {
        const row = work.inventory.find((r) => r.productId === where.warehouseId_productId.productId)!;
        row.quantity = data.quantity;
        return row;
      },
      create: async ({ data }: any) => {
        work.inventory.push({ ...data });
        return data;
      },
    },
    stockMovement: {
      create: async ({ data }: any) => {
        work.movements.push(data);
        return { ...data, product: { name: "منتج p1" }, warehouse: { name: "المخزن الرئيسي" } };
      },
    },
  });
  Object.assign(store, work);
  return result;
}

const prismaMock = {
  warehouseInventory: { findUnique: async () => ({ quantity: balance() ?? 0 }) },
  $transaction: withTx,
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: async () => ({ id: "u1" }),
  requirePageAccess: async () => ({ id: "u1" }),
  requireAction: async () => ({ id: "u1" }),
}));
vi.mock("@/lib/notifications", () => ({ notifyLowStockAfterMovement: async () => undefined }));

const { POST } = await import("@/app/api/inventory/route");

const move = (movementType: string, quantity: number) =>
  POST(
    new Request("http://localhost/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId: WAREHOUSE, productId: "p1", quantity, movementType }),
    }),
  );

describe("POST /api/inventory — manual movement while the balance is negative", () => {
  beforeEach(() => reset(-3));

  it("refuses to take more out, so the deficit cannot be widened by hand", async () => {
    const res = await move("ADJUSTMENT", 1);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INSUFFICIENT_STOCK");
    expect(balance()).toBe(-3);
    expect(store.movements).toHaveLength(0);
  });

  it("accepts a receipt that walks the deficit back up", async () => {
    const res = await move("PURCHASE_IN", 10);
    expect(res.status).toBe(201);
    expect(balance()).toBe(7);
    expect(store.movements[0]).toMatchObject({ movementType: "PURCHASE_IN", quantity: 10 });
  });

  it("refuses to create a negative row for a product that was never stocked", async () => {
    reset(null);
    const res = await move("CONSUMED", 1);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INSUFFICIENT_STOCK");
    expect(balance()).toBeUndefined();
    expect(store.movements).toHaveLength(0);
  });

  it("keeps the quantity validation", async () => {
    const res = await move("ADJUSTMENT", 0);
    expect(res.status).toBe(400);
    expect(balance()).toBe(-3);
  });
});