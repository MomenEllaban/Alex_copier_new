/**
 * Inventory settings — the negative-stock policy for sales.
 *
 * Stored per company (one row, created lazily on first read) exactly like
 * `HrSetting`, so each of the three companies can be opted in independently.
 *
 * Scope: SALES ONLY. `SalesOrder` and `InterCompanyInvoice` consult this
 * policy. Nothing else does:
 *
 *   • manual movements typed on the inventory page (ADJUSTMENT, CONSUMED,
 *     SCRAP, ENGINEER_CUSTODY_OUT) keep refusing to take a balance below zero
 *     — those are the movements an inventory clerk uses to make the count come
 *     out right, and letting them go negative would let the books be edited
 *     into any shape;
 *   • every reversal (deleting a sale, un-receiving a purchase, a return)
 *     keeps its own guard. A reversal that could go negative would let a later
 *     sale be "un-sold" past zero and hide the real shortage.
 */
import { prisma } from "@/lib/prisma";

/** Minimal client surface, so this reads through either prisma or a $transaction tx. */
export interface InventorySettingClient {
  inventorySetting: {
    findUnique(args: { where: { companyId: string } }): Promise<{
      id: string;
      companyId: string;
      allowNegativeStock: boolean;
      warnOnNegativeStock: boolean;
    } | null>;
    create(args: { data: { companyId: string } }): Promise<{
      id: string;
      companyId: string;
      allowNegativeStock: boolean;
      warnOnNegativeStock: boolean;
    }>;
    update(args: { where: { id: string }; data: { allowNegativeStock?: boolean; warnOnNegativeStock?: boolean } }): Promise<{
      id: string;
      companyId: string;
      allowNegativeStock: boolean;
      warnOnNegativeStock: boolean;
    }>;
  };
}

export interface InventoryPolicy {
  allowNegativeStock: boolean;
  warnOnNegativeStock: boolean;
}

/**
 * What the policy means before and after the user confirms. Kept as data so the
 * decision in a route reads as one lookup rather than two boolean flags.
 */
export const DEFAULT_INVENTORY_POLICY: InventoryPolicy = {
  allowNegativeStock: false,
  warnOnNegativeStock: true,
};

/**
 * The policy for a company, creating the row with the (blocking) defaults the
 * first time it is asked for.
 *
 * Takes a client so it can be called from inside a `$transaction` — the sale
 * routes must read the policy in the same transaction that moves the stock, or
 * a settings change landing mid-sale could be applied against the wrong rows.
 */
export async function getInventoryPolicy(
  companyId: string,
  client: InventorySettingClient = prisma as unknown as InventorySettingClient,
): Promise<InventoryPolicy> {
  const existing = await client.inventorySetting.findUnique({ where: { companyId } });
  if (existing) {
    return {
      allowNegativeStock: existing.allowNegativeStock,
      warnOnNegativeStock: existing.warnOnNegativeStock,
    };
  }
  const created = await client.inventorySetting.create({ data: { companyId } });
  return {
    allowNegativeStock: created.allowNegativeStock,
    warnOnNegativeStock: created.warnOnNegativeStock,
  };
}

export interface InventorySettings extends InventoryPolicy {
  id: string;
  companyId: string;
}

/** The full row for the settings screen. */
export async function getInventorySettings(companyId: string): Promise<InventorySettings> {
  const row = await (prisma as unknown as InventorySettingClient).inventorySetting.findUnique({
    where: { companyId },
  });
  if (row) return row;
  return (prisma as unknown as InventorySettingClient).inventorySetting.create({ data: { companyId } });
}

/**
 * Toggle the policy for a company.
 *
 * Only the two policy booleans are writable — `companyId` and the timestamps
 * are not, so a PUT cannot move one company's settings onto another.
 */
export async function updateInventorySettings(
  companyId: string,
  data: Partial<InventoryPolicy>,
): Promise<InventorySettings> {
  const existing = await getInventorySettings(companyId);
  const patch: { allowNegativeStock?: boolean; warnOnNegativeStock?: boolean } = {};
  if (typeof data.allowNegativeStock === "boolean") patch.allowNegativeStock = data.allowNegativeStock;
  if (typeof data.warnOnNegativeStock === "boolean") patch.warnOnNegativeStock = data.warnOnNegativeStock;

  if (Object.keys(patch).length === 0) return existing;
  return (prisma as unknown as InventorySettingClient).inventorySetting.update({
    where: { id: existing.id },
    data: patch,
  });
}
