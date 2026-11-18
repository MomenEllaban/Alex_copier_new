import type { InventoryTx } from "./stock-movement-helper";

/**
 * A returned item in a trade-in invoice. `value` is the PER-UNIT value, so a
 * line of 2 machines worth 500 each contributes 1000 to the invoice credit and
 * adds 2 units to the warehouse.
 */
export interface TradeInInput {
  name: string;
  brand?: string | null;
  condition?: string | null;
  quantity: number;
  value: number;
  serialNumber?: string | null;
  notes?: string | null;
}

export class TradeInValidationError extends Error {
  readonly code = "INVALID_TRADE_IN_ITEMS";
  constructor(message: string) {
    super(message);
    this.name = "TradeInValidationError";
  }
}

const text = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
};

/** Validate the order-level `tradeIns[]` payload coming from the invoice form. */
export function parseTradeIns(raw: unknown): TradeInInput[] {
  if (raw === undefined || raw === null || raw === "") return [];
  if (!Array.isArray(raw)) {
    throw new TradeInValidationError("بيانات أصناف الاستبدال غير صالحة");
  }
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new TradeInValidationError(`بيانات الصنف المستبدل ${index + 1} غير صالحة`);
    }
    const r = entry as Record<string, unknown>;
    const name = text(r.name);
    const quantity = Number(r.quantity ?? 1);
    const value = Number(r.value ?? r.unitValue ?? 0);
    if (!name) throw new TradeInValidationError(`اسم الصنف المستبدل مطلوب في البند ${index + 1}`);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new TradeInValidationError(`كمية الصنف المستبدل غير صالحة في البند ${index + 1}`);
    }
    if (!Number.isFinite(value) || value < 0) {
      throw new TradeInValidationError(`قيمة الصنف المستبدل غير صالحة في البند ${index + 1}`);
    }
    return {
      name,
      brand: text(r.brand),
      condition: text(r.condition),
      quantity,
      value,
      serialNumber: text(r.serialNumber),
      notes: text(r.notes),
    };
  });
}

/** Old invoices stored one returned product per received line. Keep reading it. */
export function legacyTradeIns(
  items: Array<{ tradeIn?: { name?: string; brand?: string; condition?: string; value?: number; serialNumber?: string } }>
): TradeInInput[] {
  return items
    .filter((item) => item.tradeIn && text(item.tradeIn.name) && Number(item.tradeIn.value) > 0)
    .map((item) => ({
      name: String(item.tradeIn!.name),
      brand: text(item.tradeIn!.brand),
      condition: text(item.tradeIn!.condition),
      quantity: 1,
      value: Number(item.tradeIn!.value),
      serialNumber: text(item.tradeIn!.serialNumber),
    }));
}

/** The invoice credit equals the total value of everything handed over. */
export function tradeInCreditTotal(items: TradeInInput[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.quantity * item.value, 0) * 100) / 100;
}

interface CreateArgs {
  tx: InventoryTx;
  orderId: string;
  companyId: string;
  warehouseId: string;
  orderType: string;
  items: TradeInInput[];
}

/**
 * Create one real Product per returned line, receive its quantity into stock,
 * record a PURCHASE_IN movement tied to the invoice, and save the line on the
 * order. Returns the total credit so the caller can store `tradeInTotal`.
 */
export async function createTradeInItems({
  tx, orderId, companyId, warehouseId, orderType, items,
}: CreateArgs): Promise<number> {
  for (const item of items) {
    const product = await tx.product.create({
      data: {
        name: item.name,
        productType: orderType === "MACHINE_SALE" ? "MACHINE" : "SPARE_PART",
        companyId,
        isTradeIn: true,
        tradeInValue: item.value,
        brand: item.brand,
        condition: item.condition,
        description: item.serialNumber ? `S/N: ${item.serialNumber}` : item.notes,
      },
    });

    await tx.warehouseInventory.upsert({
      where: { warehouseId_productId: { warehouseId, productId: product.id } },
      update: { quantity: { increment: item.quantity } },
      create: { warehouseId, productId: product.id, quantity: item.quantity },
    });

    await tx.stockMovement.create({
      data: {
        warehouseId,
        productId: product.id,
        quantity: item.quantity,
        movementType: "PURCHASE_IN",
        referenceId: orderId,
        notes: `استبدال — ${item.name}${item.serialNumber ? ` — S/N: ${item.serialNumber}` : ""}`,
      },
    });

    await tx.tradeInItem.create({
      data: {
        salesOrderId: orderId,
        productId: product.id,
        quantity: item.quantity,
        unitValue: item.value,
        condition: item.condition,
        serialNumber: item.serialNumber,
        notes: item.notes,
      },
    });
  }
  return tradeInCreditTotal(items);
}

/**
 * Delete the returned-item rows and their Product rows when an invoice is
 * edited or cancelled. Stock is reversed separately from the movements tied to
 * the invoice (which already carry the real quantity).
 */
export async function removeTradeInItems(
  tx: InventoryTx,
  orderId: string,
  legacyProductIds: string[] = []
) {
  const rows = await tx.tradeInItem.findMany({
    where: { salesOrderId: orderId },
    select: { productId: true },
  });
  const productIds = [
    ...rows.map((row) => row.productId),
    ...legacyProductIds,
  ];
  await tx.tradeInItem.deleteMany({ where: { salesOrderId: orderId } });
  if (productIds.length > 0) {
    await tx.product.deleteMany({ where: { id: { in: [...new Set(productIds)] } } });
  }
}
