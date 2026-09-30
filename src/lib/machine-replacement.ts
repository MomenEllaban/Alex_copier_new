import { prisma } from "@/lib/prisma";
import { findOrCreateMainWarehouse, type InventoryTx } from "@/lib/stock-movement-helper";

/**
 * Why a machine came back to the company instead of staying with the customer.
 * Mirrors the `MachineReplacementReason` enum in the schema.
 */
export const REPLACEMENT_REASONS = [
  "CUSTOMER_REQUEST",
  "MACHINE_DEFECTIVE",
  "UPGRADE",
  "CONTRACT_ENDED",
  "OTHER",
] as const;

export type ReplacementReason = (typeof REPLACEMENT_REASONS)[number];

export const TRADE_IN_CONDITIONS = ["excellent", "good", "fair", "poor"] as const;
export type TradeInCondition = (typeof TRADE_IN_CONDITIONS)[number];

/** Thrown for anything the user can fix; `code` is what the UI branches on. */
export class ReplacementError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "ReplacementError";
  }
}

export interface ReplaceMachineInput {
  oldMachineId: string;
  /** The machine handed to the customer in its place. Omit to only detach. */
  newMachineId?: string | null;
  /**
   * Restrict the swap to one contract. When omitted, every contract the old
   * machine is attached to is migrated, which is what "replace it" means for a
   * machine that happens to sit under more than one contract.
   */
  contractId?: string | null;
  /** Company that takes the returned machine in as replacement stock. */
  companyId: string;
  tradeInValue?: number | null;
  condition?: TradeInCondition | null;
  reason?: ReplacementReason;
  notes?: string | null;
  actorId?: string | null;
}

export interface ReplaceMachineResult {
  replacementId: string;
  productId: string;
  warehouseId: string;
  productName: string;
  serialNumber: string;
  companyId: string;
  warehouseName: string;
  stockQuantity: number;
  migratedContractIds: string[];
  newMachineId: string | null;
}

/** "Ricoh MP C3004" / "MP C3004" — what the trade-in product is called. */
function buildProductName(machine: {
  manufacturer: string | null;
  model: string | null;
  serialNumber: string;
}): string {
  const parts = [machine.manufacturer, machine.model].filter(
    (p): p is string => Boolean(p && p.trim())
  );
  return parts.length > 0 ? parts.join(" ").trim() : machine.serialNumber;
}

/**
 * Take a machine back from a customer and register it as replacement stock.
 *
 * One transaction, so a failure halfway cannot leave the contract pointing at a
 * machine the company no longer owns:
 *
 *  1. the machine is detached from the customer's location and ownership,
 *  2. every contract it covered is re-pointed at the new machine (or left
 *     uncovered when no replacement was given),
 *  3. the machine becomes a `Product` flagged `isTradeIn` under the given
 *     company — the replacement-holding company — so it lists on the
 *     replacement-products page,
 *  4. that product gets a stock row in the company's main warehouse plus a
 *     SALE_RETURN_IN movement, so the company's inventory and the movement
 *     ledger both account for it,
 *  5. a MachineReplacement row records the whole swap as an audit trail, and
 *     `oldMachineId` is RESTRICT so the machine cannot be deleted afterwards.
 */
export async function replaceMachine(
  input: ReplaceMachineInput
): Promise<ReplaceMachineResult> {
  const {
    oldMachineId,
    newMachineId = null,
    contractId = null,
    companyId,
    tradeInValue = null,
    condition = null,
    reason = "CUSTOMER_REQUEST",
    notes = null,
    actorId = null,
  } = input;

  if (newMachineId && newMachineId === oldMachineId) {
    throw new ReplacementError(
      "SAME_MACHINE",
      "لا يمكن استبدال الماكينة بنفسها، اختر ماكينة أخرى"
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, isActive: true },
  });
  if (!company) {
    throw new ReplacementError("COMPANY_NOT_FOUND", "الشركة المستلمة للجهاز غير موجودة", 404);
  }
  if (!company.isActive) {
    throw new ReplacementError("COMPANY_INACTIVE", `شركة ${company.name} غير نشطة`);
  }

  const oldMachine = await prisma.machine.findUnique({
    where: { id: oldMachineId },
    include: {
      contracts: {
        include: {
          contract: {
            select: { id: true, contractNumber: true, customerId: true, status: true },
          },
        },
      },
    },
  });
  if (!oldMachine) {
    throw new ReplacementError("MACHINE_NOT_FOUND", "الماكينة غير موجودة", 404);
  }

  // Scoping to one contract keeps the swap from silently migrating a machine
  // the caller could not even see on the contract they were working in.
  const targetLinks = contractId
    ? oldMachine.contracts.filter((link) => link.contractId === contractId)
    : oldMachine.contracts;
  if (contractId && targetLinks.length === 0) {
    throw new ReplacementError(
      "MACHINE_NOT_IN_CONTRACT",
      "الماكينة غير مرتبطة بهذا العقد"
    );
  }

  if (newMachineId) {
    const newMachine = await prisma.machine.findUnique({
      where: { id: newMachineId },
      select: { id: true, serialNumber: true, productId: true },
    });
    if (!newMachine) {
      throw new ReplacementError("NEW_MACHINE_NOT_FOUND", "الماكينة الجديدة غير موجودة", 404);
    }
    if (newMachine.serialNumber === oldMachine.serialNumber) {
      throw new ReplacementError(
        "DUPLICATE_SERIAL",
        "الماكينة الجديدة هي نفسها القديمة (نفس الرقم التسلسلي)"
      );
    }
  }

  // The trade-in product is keyed on the machine's serial number: it is already
  // unique per machine, so replacing the same machine twice can never create a
  // duplicate product row.
  const productName = buildProductName(oldMachine);

  return prisma.$transaction(
    async (tx) => {
      const warehouse = await findOrCreateMainWarehouse(tx, companyId);

      const product = await tx.product.upsert({
        where: { companyId_sku: { companyId, sku: oldMachine.serialNumber } },
        create: {
          name: productName,
          productType: "MACHINE",
          companyId,
          sku: oldMachine.serialNumber,
          brand: oldMachine.manufacturer,
          description: oldMachine.model
            ? `ماكينة مستعملة — موديل ${oldMachine.model}`
            : "ماكينة مستعملة",
          condition: condition ?? undefined,
          tradeInValue: tradeInValue ?? undefined,
          isTradeIn: true,
          isActive: true,
          purchasePrice: 0,
          wholesalePrice: 0,
          retailPrice: 0,
        },
        update: {
          name: productName,
          condition: condition ?? undefined,
          tradeInValue: tradeInValue ?? undefined,
          isTradeIn: true,
          isActive: true,
        },
        select: { id: true, name: true },
      });

      // The returned machine is one physical unit of that product, so the
      // quantity goes to 1 rather than accumulating: each machine carries its
      // own serial number and therefore its own product row.
      await tx.warehouseInventory.upsert({
        where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
        create: { warehouseId: warehouse.id, productId: product.id, quantity: 1 },
        update: { quantity: 1 },
      });

      await tx.stockMovement.create({
        data: {
          warehouseId: warehouse.id,
          productId: product.id,
          quantity: 1,
          movementType: "SALE_RETURN_IN",
          notes: `استبدال ماكينة ${oldMachine.serialNumber} من عقد${
            targetLinks[0]?.contract.contractNumber
              ? ` ${targetLinks[0].contract.contractNumber}`
              : ""
          }`,
        },
      });

      // Hand the old machine back to the company: no customer, no site, and in
      // the warehouse ready to be resold or redeployed.
      await tx.machine.update({
        where: { id: oldMachineId },
        data: {
          currentOwnerId: null,
          customerLocationId: null,
          currentStatus: "IN_WAREHOUSE",
        },
      });

      await tx.machineOwnerHistory.create({
        data: {
          machineId: oldMachineId,
          transactionType: "RETURN",
          companyId,
          financialValue: tradeInValue ?? undefined,
          contractId: targetLinks[0]?.contractId ?? undefined,
          notes: `تم استرجاع الماكينة كمنتج استبدال${notes ? ` — ${notes}` : ""}`,
        },
      });

      const migratedContractIds: string[] = [];

      for (const link of targetLinks) {
        await tx.contractMachine.delete({ where: { id: link.id } });

        if (newMachineId) {
          const alreadyLinked = await tx.contractMachine.findUnique({
            where: { contractId_machineId: { contractId: link.contractId, machineId: newMachineId } },
            select: { id: true },
          });
          if (!alreadyLinked) {
            await tx.contractMachine.create({
              data: { contractId: link.contractId, machineId: newMachineId },
            });
          }
        }
        migratedContractIds.push(link.contractId);

        // The contract keeps its customer: the new machine sits at the same site
        // under the same customer, which is the whole point of a swap.
        if (newMachineId) {
          await tx.machine.update({
            where: { id: newMachineId },
            data: {
              currentOwnerId: link.contract.customerId,
              customerLocationId: oldMachine.customerLocationId,
              currentStatus: "SOLD",
            },
          });

          await tx.machineOwnerHistory.create({
            data: {
              machineId: newMachineId,
              transactionType: "TRANSFER",
              companyId,
              customerId: link.contract.customerId,
              contractId: link.contractId,
              notes: `استبدال الماكينة ${oldMachine.serialNumber}`,
            },
          });
        }
      }

      const replacement = await tx.machineReplacement.create({
        data: {
          oldMachineId,
          newMachineId,
          contractId: targetLinks[0]?.contractId ?? null,
          companyId,
          productId: product.id,
          warehouseId: warehouse.id,
          tradeInValue,
          condition,
          reason,
          notes,
          createdById: actorId,
        },
        select: { id: true },
      });

      return {
        replacementId: replacement.id,
        productId: product.id,
        warehouseId: warehouse.id,
        productName: product.name,
        serialNumber: oldMachine.serialNumber,
        companyId,
        warehouseName: warehouse.name,
        stockQuantity: 1,
        migratedContractIds,
        newMachineId,
      };
    },
    { timeout: 20000, maxWait: 10000 }
  );
}

/**
 * Everything that would be destroyed or silently broken by deleting a machine.
 * The delete route returns this instead of removing anything, so the caller can
 * see exactly why a machine cannot go and what to do instead.
 *
 * Dates stay `Date` here: they are serialised to ISO strings by
 * `NextResponse.json` at the route boundary, not by this module.
 */
export interface MachineBlockers {
  contracts: {
    id: string;
    contractNumber: string;
    status: string;
    endDate: Date;
  }[];
  serviceRequests: number;
  meterReadings: number;
  ownerHistory: number;
  replacements: number;
  copierTests: number;
  scrapOrder: { id: string; orderNumber: string; status: string } | null;
  warranty: {
    id: string;
    startDate: Date;
    endDate: Date;
    isExpired: boolean;
  } | null;
}

export async function machineDeletionBlockers(machineId: string): Promise<MachineBlockers> {
  const machine = await prisma.machine.findUnique({
    where: { id: machineId },
    select: {
      contracts: {
        select: {
          contract: {
            select: { id: true, contractNumber: true, status: true, endDate: true },
          },
        },
      },
      scrapOrder: { select: { id: true, orderNumber: true, status: true } },
      warranty: { select: { id: true, startDate: true, endDate: true, isExpired: true } },
    },
  });
  if (!machine) {
    throw new ReplacementError("MACHINE_NOT_FOUND", "الماكينة غير موجودة", 404);
  }

  const [serviceRequests, meterReadings, ownerHistory, replacements, copierTests] =
    await Promise.all([
      prisma.serviceRequest.count({ where: { machineId } }),
      prisma.meterReading.count({ where: { machineId } }),
      prisma.machineOwnerHistory.count({ where: { machineId } }),
      prisma.machineReplacement.count({
        where: { OR: [{ oldMachineId: machineId }, { newMachineId: machineId }] },
      }),
      prisma.copierTest.count({ where: { machineId } }),
    ]);

  return {
    contracts: machine.contracts.map((link) => link.contract),
    serviceRequests,
    meterReadings,
    ownerHistory,
    replacements,
    copierTests,
    scrapOrder: machine.scrapOrder,
    warranty: machine.warranty,
  };
}

/**
 * A machine is only safe to hard-delete when nothing in its life is kept. The
 * first three are what a replacement depends on; the rest are history that
 * would silently disappear.
 */
export function isMachineDeletable(blockers: MachineBlockers): boolean {
  return (
    blockers.contracts.length === 0 &&
    // Ownership rows cascade, so a machine that has been placed with a customer
    // and taken back would lose that trail on delete.
    blockers.ownerHistory === 0 &&
    blockers.serviceRequests === 0 &&
    blockers.meterReadings === 0 &&
    blockers.replacements === 0 &&
    blockers.copierTests === 0 &&
    !blockers.scrapOrder &&
    !blockers.warranty
  );
}

/** Human-readable Arabic reason, matching the codes the API returns. */
export function describeMachineBlockers(blockers: MachineBlockers): string {
  const reasons: string[] = [];
  if (blockers.contracts.length > 0) {
    const numbers = blockers.contracts.map((c) => c.contractNumber).join("، ");
    reasons.push(`مرتبطة بالعقد ${numbers} — استخدم الاستبدال بدلاً من الحذف`);
  }
  if (blockers.replacements > 0) {
    reasons.push(`مسجلة في ${blockers.replacements} عملية استبدال`);
  }
  if (blockers.serviceRequests > 0) reasons.push(`مرتبطة بـ ${blockers.serviceRequests} طلب صيانة`);
  if (blockers.meterReadings > 0) reasons.push(`لها ${blockers.meterReadings} قراءة عداد`);
  if (blockers.copierTests > 0) reasons.push(`لها ${blockers.copierTests} اختبار عميل`);
  if (blockers.ownerHistory > 0) reasons.push(`لها ${blockers.ownerHistory} سجل ملكية`);
  if (blockers.scrapOrder) reasons.push("مرتبطة بأمر إتلاف");
  if (blockers.warranty) reasons.push("مرتبطة بضمان");
  return reasons.join("، ");
}
