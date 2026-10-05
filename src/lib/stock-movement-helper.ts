import { prisma } from "@/lib/prisma";
import type { InventoryPolicy } from "@/lib/services/inventory/inventory-settings-service";

// The `tx` inside $transaction (same pattern used across the codebase).
export type InventoryTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Resolve the company's main warehouse (isMain == true), creating a default
 * "المستودع الرئيسي" when none exists (consistent with the products flow).
 */
export async function findOrCreateMainWarehouse(tx: InventoryTx, companyId: string) {
  const warehouse = await tx.warehouse.findFirst({
    where: { companyId, isMain: true },
    orderBy: { createdAt: "asc" },
  });
  if (warehouse) return warehouse;
  return tx.warehouse.create({
    data: { companyId, name: "المستودع الرئيسي", isMain: true },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Negative stock on sales
//
// A sale used to be a hard `available < quantity` check with no way past it.
// The company's policy (InventorySetting) now decides, and it is read INSIDE
// the transaction that moves the stock so a settings change cannot land
// half-way through a sale.
//
// The arithmetic is unchanged: the invoice always records what was really
// sold, the StockMovement always records the full quantity, and the balance is
// simply allowed to land below zero when the company has opted in. Stock stays
// consistent either way —
//
//     opening 5, sold 8, purchase 10  ->  -3  ->  7
//
// so the deficit is visible and the next receipt clears it. What the policy
// changes is whether the system refuses the sale or records the deficit.
// ═══════════════════════════════════════════════════════════════════════════

/** Error code: the company's policy forbids selling below zero. */
export const STOCK_BLOCKED = "INSUFFICIENT_STOCK";

/** Error code: negative stock is allowed, but the user has not confirmed yet. */
export const STOCK_CONFIRM_REQUIRED = "NEGATIVE_STOCK_CONFIRM_REQUIRED";

export interface StockLine {
  productId: string;
  quantity: number;
}

/** One product that cannot be covered by the balance on hand. */
export interface StockShortfall {
  productId: string;
  productName: string;
  /** Quantity the invoice is asking for. */
  requested: number;
  /** Quantity on hand (negative if the item is already in deficit). */
  available: number;
  /** Where the balance ends up if the sale goes through: available - requested. */
  resultingBalance: number;
  /** How many units are missing: requested - available. */
  shortage: number;
}

/**
 * Carries the shortfalls out of the transaction, so the route can answer with
 * the numbers the warning dialog shows.
 *
 * The message keeps the legacy `INSUFFICIENT_STOCK:<productId>` shape for the
 * blocked case: the routes already branch on that prefix, and the product id in
 * the message is what their tests assert on.
 */
export class StockShortfallError extends Error {
  readonly code: typeof STOCK_BLOCKED | typeof STOCK_CONFIRM_REQUIRED;
  readonly shortfalls: StockShortfall[];

  constructor(
    code: typeof STOCK_BLOCKED | typeof STOCK_CONFIRM_REQUIRED,
    shortfalls: StockShortfall[],
  ) {
    super(code === STOCK_BLOCKED ? `${STOCK_BLOCKED}:${shortfalls[0]?.productId ?? ""}` : STOCK_CONFIRM_REQUIRED);
    this.name = "StockShortfallError";
    this.code = code;
    this.shortfalls = shortfalls;
  }
}

/** Total quantity per product, so a product repeated across lines is checked once. */
export function totalByProduct(lines: StockLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  }
  return totals;
}

/**
 * Read the on-hand balance for every product in the sale, plus its name, in one
 * pass. A product with no WarehouseInventory row reads as 0 — which is what
 * makes selling a never-stocked item a shortfall.
 *
 * `rowExists` is kept separately from `available`: a product that was never
 * stocked has to be CREATED at its negative balance, while one that has a row
 * is UPDATED, and a blind `update` on a missing row is a P2025.
 */
async function readBalances(
  tx: InventoryTx,
  warehouseId: string,
  productIds: string[],
): Promise<Map<string, { available: number; name: string; rowExists: boolean }>> {
  const [rows, products] = await Promise.all([
    tx.warehouseInventory.findMany({
      where: { warehouseId, productId: { in: productIds } },
      select: { productId: true, quantity: true },
    }),
    tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    }),
  ]);

  const rowByProduct = new Map(rows.map((row) => [row.productId, row.quantity]));
  const nameByProduct = new Map(products.map((product) => [product.id, product.name]));

  const balances = new Map<string, { available: number; name: string; rowExists: boolean }>();
  for (const productId of productIds) {
    const quantity = rowByProduct.get(productId);
    balances.set(productId, {
      available: quantity ?? 0,
      name: nameByProduct.get(productId) ?? productId,
      rowExists: quantity !== undefined,
    });
  }
  return balances;
}

/** The products whose balance would end below zero, worst deficit first. */
export function findShortfalls(
  totals: Map<string, number>,
  balances: Map<string, { available: number; name: string }>,
): StockShortfall[] {
  const shortfalls: StockShortfall[] = [];
  for (const [productId, requested] of totals) {
    const balance = balances.get(productId);
    if (!balance) continue;
    const available = balance.available;
    if (available >= requested) continue;
    shortfalls.push({
      productId,
      productName: balance.name,
      requested,
      available,
      resultingBalance: available - requested,
      shortage: requested - available,
    });
  }
  return shortfalls.sort((a, b) => b.shortage - a.shortage);
}

/**
 * Apply a sale's stock deduction, subject to the company's policy.
 *
 * Throws before touching anything when the sale cannot proceed, so the
 * transaction rolls back with no partial deduction:
 *
 *   • policy blocks negative stock        -> StockShortfallError(STOCK_BLOCKED)
 *   • allowed but the client has not
 *     confirmed the warning yet           -> StockShortfallError(STOCK_CONFIRM_REQUIRED)
 *   • allowed and confirmed               -> deducted, balance may be negative
 *
 * A product with no stock row at all gets one created at the negative balance,
 * so the deficit is a real row the reports and the inventory page can show —
 * not a sale that quietly left no trace.
 *
 * Returns the shortfalls that were accepted, so the caller can log them on the
 * StockMovement.
 */
export async function deductStockForSale(
  tx: InventoryTx,
  args: {
    warehouseId: string;
    lines: StockLine[];
    policy: InventoryPolicy;
    /** The client confirmed the shortfall warning (resubmitted with the flag). */
    confirmed: boolean;
  },
): Promise<StockShortfall[]> {
  const totals = totalByProduct(args.lines);
  if (totals.size === 0) return [];

  const balances = await readBalances(tx, args.warehouseId, [...totals.keys()]);
  const shortfalls = findShortfalls(totals, balances);

  if (shortfalls.length > 0) {
    if (!args.policy.allowNegativeStock) {
      throw new StockShortfallError(STOCK_BLOCKED, shortfalls);
    }
    if (args.policy.warnOnNegativeStock && !args.confirmed) {
      throw new StockShortfallError(STOCK_CONFIRM_REQUIRED, shortfalls);
    }
  }

  for (const [productId, quantity] of totals) {
    const balance = balances.get(productId)!;
    const key = { warehouseId: args.warehouseId, productId };
    if (balance.rowExists) {
      await tx.warehouseInventory.update({
        where: { warehouseId_productId: key },
        data: { quantity: balance.available - quantity },
      });
    } else {
      await tx.warehouseInventory.create({ data: { ...key, quantity: -quantity } });
    }
  }

  return shortfalls;
}

export interface PurchaseStockItem {
  productId: string;
  quantity: number;
  unitPrice?: number;
}

/**
 * Atomic stock-in for a received purchase order:
 * increments WarehouseInventory for every item and records a PURCHASE_IN
 * StockMovement linked to the real PurchaseOrder (purchaseOrderId FK).
 */
export async function receivePurchaseIntoStock(
  tx: InventoryTx,
  args: {
    purchaseOrderId: string;
    warehouseId: string;
    items: PurchaseStockItem[];
    notes?: string;
  }
): Promise<void> {
  for (const item of args.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("INVALID_PURCHASE_QUANTITY");
    }
    const existing = await tx.warehouseInventory.findUnique({
      where: { warehouseId_productId: { warehouseId: args.warehouseId, productId: item.productId } },
    });
    const available = existing?.quantity ?? 0;
    await tx.warehouseInventory.upsert({
      where: { warehouseId_productId: { warehouseId: args.warehouseId, productId: item.productId } },
      update: { quantity: available + item.quantity },
      create: { warehouseId: args.warehouseId, productId: item.productId, quantity: item.quantity },
    });
    await tx.stockMovement.create({
      data: {
        warehouseId: args.warehouseId,
        productId: item.productId,
        quantity: item.quantity,
        movementType: "PURCHASE_IN",
        purchaseOrderId: args.purchaseOrderId,
        referenceId: args.purchaseOrderId,
        notes: args.notes ?? `استلام أمر شراء ${args.purchaseOrderId}`,
      },
    });
    if (typeof item.unitPrice === "number" && item.unitPrice > 0) {
      await tx.product.update({
        where: { id: item.productId },
        data: { purchasePrice: item.unitPrice },
      });
    }
  }
}

/**
 * Atomic un-receive (cancelling a received purchase order): removes the exact
 * quantity that was received from the warehouse (guarded — never negative),
 * records an ADJUSTMENT movement and deletes the original PURCHASE_IN movements
 * so the order can be re-received cleanly later.
 */
export async function reversePurchaseFromStock(tx: InventoryTx, purchaseOrderId: string): Promise<void> {
  const movements = await tx.stockMovement.findMany({
    where: { purchaseOrderId, movementType: "PURCHASE_IN" },
  });
  for (const movement of movements) {
    const existing = await tx.warehouseInventory.findUnique({
      where: { warehouseId_productId: { warehouseId: movement.warehouseId, productId: movement.productId } },
    });
    const available = existing?.quantity ?? 0;
    if (available < movement.quantity) {
      throw new Error(`INSUFFICIENT_STOCK:${movement.productId}`);
    }
    if (existing) {
      await tx.warehouseInventory.update({
        where: { warehouseId_productId: { warehouseId: movement.warehouseId, productId: movement.productId } },
        data: { quantity: available - movement.quantity },
      });
    }
    await tx.stockMovement.create({
      data: {
        warehouseId: movement.warehouseId,
        productId: movement.productId,
        quantity: movement.quantity,
        movementType: "ADJUSTMENT",
        purchaseOrderId,
        referenceId: purchaseOrderId,
        notes: `إلغاء استلام أمر شراء ${purchaseOrderId}`,
      },
    });
  }
  await tx.stockMovement.deleteMany({
    where: { purchaseOrderId, movementType: "PURCHASE_IN" },
  });
}