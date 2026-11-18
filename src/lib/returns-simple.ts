import type { prisma } from "@/lib/prisma";

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface SimpleReturnEffects {
  id: string;
  companyId: string;
  type: "SALE_RETURN" | "PURCHASE_RETURN";
  customerId: string | null;
  supplierId: string | null;
  productId: string;
  quantity: number;
  total: number;
  warehouseId: string | null;
}

export const SIMPLE_RETURN_REF_PREFIX = "RET-";

export function isSimpleReturn(ret: {
  salesOrderId?: string | null;
  purchaseOrderId?: string | null;
}): boolean {
  return !ret.salesOrderId && !ret.purchaseOrderId;
}

async function resolveWarehouse(tx: PrismaTx, ret: SimpleReturnEffects): Promise<string> {
  if (ret.warehouseId) return ret.warehouseId;
  const warehouse = await tx.warehouse.findFirst({
    where: { companyId: ret.companyId, isMain: true },
    select: { id: true },
  });
  if (!warehouse) throw new Error("NO_WAREHOUSE");
  return warehouse.id;
}

/** Stock, cash, customer/supplier balance and settlement postings for a new-style return. */
export async function postSimpleReturnEffects(
  tx: PrismaTx,
  ret: SimpleReturnEffects,
  actorId: string,
): Promise<void> {
  const warehouseId = await resolveWarehouse(tx, ret);
  const isSale = ret.type === "SALE_RETURN";
  const ref = `${SIMPLE_RETURN_REF_PREFIX}${ret.id}`;

  if (isSale) {
    await tx.warehouseInventory.upsert({
      where: { warehouseId_productId: { warehouseId, productId: ret.productId } },
      update: { quantity: { increment: ret.quantity } },
      create: { warehouseId, productId: ret.productId, quantity: ret.quantity },
    });
  } else {
    const inv = await tx.warehouseInventory.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: ret.productId } },
    });
    if (!inv || inv.quantity < ret.quantity) throw new Error("INSUFFICIENT_STOCK");
    await tx.warehouseInventory.update({
      where: { warehouseId_productId: { warehouseId, productId: ret.productId } },
      data: { quantity: inv.quantity - ret.quantity },
    });
  }

  await tx.stockMovement.create({
    data: {
      warehouseId,
      productId: ret.productId,
      quantity: ret.quantity,
      movementType: isSale ? "SALE_RETURN_IN" : "PURCHASE_RETURN_OUT",
      referenceId: ret.id,
      notes: `${isSale ? "مرتجع مبيعات" : "مرتجع مشتريات"} — ${ref}`,
    },
  });

  const cash = await tx.account.findFirst({
    where: { companyId: ret.companyId, code: "1001" },
    select: { id: true },
  });
  if (!cash) throw new Error("ACCOUNT_CHART_MISSING");
  await tx.account.update({
    where: { id: cash.id },
    data: { balance: isSale ? { decrement: ret.total } : { increment: ret.total } },
  });

  await tx.settlement.create({
    data: {
      settlementNumber: ref,
      companyId: ret.companyId,
      customerId: isSale ? ret.customerId : null,
      amount: ret.total,
      paymentMethod: "CASH",
      reason: `${isSale ? "مرتجع مبيعات" : "مرتجع مشتريات"} — ${ret.id}`,
      direction: isSale ? "SUBTRACTION" : "ADDITION",
      status: "VERIFIED",
      collectedBy: actorId,
      verifiedBy: actorId,
    },
  });

  if (isSale && ret.customerId) {
    await tx.customerLedger.upsert({
      where: { customerId_companyId: { customerId: ret.customerId, companyId: ret.companyId } },
      update: { balance: { decrement: ret.total } },
      create: { customerId: ret.customerId, companyId: ret.companyId, balance: -ret.total },
    });
    const customer = await tx.customer.findUnique({
      where: { id: ret.customerId },
      select: { remainingDebt: true },
    });
    await tx.customer.update({
      where: { id: ret.customerId },
      data: { remainingDebt: (customer?.remainingDebt ?? 0) - ret.total },
    });
  }

  if (!isSale && ret.supplierId) {
    await tx.supplierPayment.create({
      data: {
        supplierId: ret.supplierId,
        companyId: ret.companyId,
        amount: ret.total,
        paymentMethod: "CASH",
        docNumber: ref,
        notes: `مرتجع مشتريات — ${ret.id}`,
      },
    });
  }
}

/** Undo all of the above when a simple return is rejected or deleted. */
export async function reverseSimpleReturnEffects(
  tx: PrismaTx,
  ret: SimpleReturnEffects,
): Promise<void> {
  if (!ret.warehouseId) return;
  const isSale = ret.type === "SALE_RETURN";
  const ref = `${SIMPLE_RETURN_REF_PREFIX}${ret.id}`;

  if (isSale) {
    const inv = await tx.warehouseInventory.findUnique({
      where: { warehouseId_productId: { warehouseId: ret.warehouseId, productId: ret.productId } },
    });
    if (!inv || inv.quantity < ret.quantity) throw new Error("INSUFFICIENT_STOCK");
    await tx.warehouseInventory.update({
      where: { warehouseId_productId: { warehouseId: ret.warehouseId, productId: ret.productId } },
      data: { quantity: inv.quantity - ret.quantity },
    });
  } else {
    await tx.warehouseInventory.upsert({
      where: { warehouseId_productId: { warehouseId: ret.warehouseId, productId: ret.productId } },
      update: { quantity: { increment: ret.quantity } },
      create: { warehouseId: ret.warehouseId, productId: ret.productId, quantity: ret.quantity },
    });
  }

  await tx.stockMovement.create({
    data: {
      warehouseId: ret.warehouseId,
      productId: ret.productId,
      quantity: ret.quantity,
      movementType: "ADJUSTMENT",
      referenceId: ret.id,
      notes: `إلغاء مرتجع — ${ref}`,
    },
  });

  const cash = await tx.account.findFirst({
    where: { companyId: ret.companyId, code: "1001" },
    select: { id: true },
  });
  if (cash) {
    await tx.account.update({
      where: { id: cash.id },
      data: { balance: isSale ? { increment: ret.total } : { decrement: ret.total } },
    });
  }

  await tx.settlement.deleteMany({ where: { settlementNumber: ref } });
  await tx.supplierPayment.deleteMany({ where: { docNumber: ref } });

  if (isSale && ret.customerId) {
    await tx.customerLedger.upsert({
      where: { customerId_companyId: { customerId: ret.customerId, companyId: ret.companyId } },
      update: { balance: { increment: ret.total } },
      create: { customerId: ret.customerId, companyId: ret.companyId, balance: ret.total },
    });
    const customer = await tx.customer.findUnique({
      where: { id: ret.customerId },
      select: { remainingDebt: true },
    });
    await tx.customer.update({
      where: { id: ret.customerId },
      data: { remainingDebt: (customer?.remainingDebt ?? 0) + ret.total },
    });
  }
}
