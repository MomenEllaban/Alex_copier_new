import { prisma } from "@/lib/prisma";

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

export interface PurchaseStockItem {
  productId: string;
  quantity: number;
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