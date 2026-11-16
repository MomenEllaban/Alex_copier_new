export interface PurchaseItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Validate and normalise the item lines of a purchase order. Returns null when
 * the payload is not a usable line set, so routes can answer 400 instead of
 * letting Prisma fail on a float quantity or a negative price.
 */
export function normalizePurchaseItems(value: unknown): PurchaseItemInput[] | null {
  if (!Array.isArray(value)) return null;
  const items: PurchaseItemInput[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const productId = typeof row.productId === "string" ? row.productId.trim() : "";
    const quantity = Number(row.quantity);
    const unitPrice = Number(row.unitPrice);
    if (
      !productId ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      return null;
    }
    items.push({ productId, quantity, unitPrice });
  }
  return items;
}
