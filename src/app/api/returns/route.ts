import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { recalculatePaymentStatus } from "@/lib/payment-status";
import { traceError } from "@/lib/prisma-errors";

export async function GET() {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const returns = await prisma.returnTransaction.findMany({
      include: {
        company: true,
        customer: true,
        supplier: true,
        product: true,
        warehouse: true,
        salesOrder: { select: { id: true } },
        salesOrderItem: { select: { id: true, unitPrice: true, quantity: true } },
        purchaseOrder: { select: { id: true } },
        purchaseOrderItem: { select: { id: true, unitPrice: true, quantity: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(returns);
  } catch (error) {
    console.error("Failed to fetch return transactions:", error);
    return NextResponse.json({ error: "Failed to fetch return transactions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePageAccess("returns");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const body = await request.json();
    const { type, salesOrderId, salesOrderItemId, quantity, reason } = body;

    if (!type) {
      return NextResponse.json(
        { error: "نوع المرتجع مطلوب", code: "RETURN_TYPE_REQUIRED" },
        { status: 400 }
      );
    }

    if (type !== "SALE_RETURN" && type !== "PURCHASE_RETURN") {
      return NextResponse.json(
        { error: "نوع المرتجع غير صالح", code: "INVALID_RETURN_TYPE" },
        { status: 400 }
      );
    }

    if (type === "SALE_RETURN") {
      if (!salesOrderId || !salesOrderItemId) {
        return NextResponse.json(
          { error: "اختيار فاتورة البيع والمنتج مطلوب", code: "SALE_ORDER_REQUIRED" },
          { status: 400 }
        );
      }

      const normalizedQty = Number(quantity);
      if (!Number.isInteger(normalizedQty) || normalizedQty <= 0) {
        return NextResponse.json(
          { error: "الكمية يجب أن تكون عددًا صحيحًا أكبر من صفر", code: "INVALID_QUANTITY" },
          { status: 400 }
        );
      }

      const salesOrder = await prisma.salesOrder.findUnique({
        where: { id: salesOrderId },
        include: {
          items: { include: { product: true } },
          company: { select: { id: true, name: true, nameAr: true } },
          customer: { select: { id: true, name: true } },
        },
      });

      if (!salesOrder) {
        return NextResponse.json(
          { error: "فاتورة البيع غير موجودة", code: "SALE_ORDER_NOT_FOUND" },
          { status: 404 }
        );
      }

      const salesItem = salesOrder.items.find((i) => i.id === salesOrderItemId);
      if (!salesItem) {
        return NextResponse.json(
          { error: "المنتج غير موجود في فاتورة البيع", code: "SALE_ITEM_NOT_FOUND" },
          { status: 404 }
        );
      }

      const existingReturns = await prisma.returnTransaction.findMany({
        where: {
          salesOrderId,
          salesOrderItemId,
          status: { not: "REJECTED" },
        },
      });
      const totalReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);
      const availableToReturn = salesItem.quantity - totalReturned;

      if (normalizedQty > availableToReturn) {
        return NextResponse.json(
          {
            error: `الكمية المطلوبة (${normalizedQty}) تتجاوز الكمية المتاحة للمرتجع (${availableToReturn})`,
            code: "EXCEEDED_RETURNABLE_QUANTITY",
          },
          { status: 400 }
        );
      }

      const warehouse = await prisma.warehouse.findFirst({
        where: { companyId: salesOrder.companyId, isMain: true },
        select: { id: true },
      });

      if (!warehouse) {
        return NextResponse.json(
          { error: "لا يوجد مستودع رئيسي للشركة", code: "NO_WAREHOUSE" },
          { status: 400 }
        );
      }

      const unitPrice = salesItem.unitPrice;
      const total = Number((normalizedQty * unitPrice).toFixed(2));

      const returnRecord = await prisma.$transaction(async (tx) => {
        const created = await tx.returnTransaction.create({
          data: {
            companyId: salesOrder.companyId,
            type: "SALE_RETURN",
            salesOrderId,
            salesOrderItemId,
            priceTier: null,
            warehouseId: warehouse.id,
            customerId: salesOrder.customerId,
            productId: salesItem.productId,
            quantity: normalizedQty,
            unitPrice,
            total,
            reason: reason || null,
            status: "APPROVED",
          },
        });

        await tx.warehouseInventory.upsert({
          where: { warehouseId_productId: { warehouseId: warehouse.id, productId: salesItem.productId } },
          update: { quantity: { increment: normalizedQty } },
          create: { warehouseId: warehouse.id, productId: salesItem.productId, quantity: normalizedQty },
        });

        await tx.stockMovement.create({
          data: {
            warehouseId: warehouse.id,
            productId: salesItem.productId,
            quantity: normalizedQty,
            movementType: "SALE_RETURN_IN",
            referenceId: created.id,
            notes: `مرتجع مبيعات — فاتورة ${salesOrder.id} — ${salesItem.product?.name || ""}`,
          },
        });

        await tx.customerLedger.upsert({
          where: { customerId_companyId: { customerId: salesOrder.customerId, companyId: salesOrder.companyId } },
          update: { balance: { decrement: total } },
          create: { customerId: salesOrder.customerId, companyId: salesOrder.companyId, balance: -total },
        });

        // Decrement customer remaining debt (return reduces what customer owes)
        const debtBefore = await tx.customer.findUnique({
          where: { id: salesOrder.customerId },
          select: { remainingDebt: true },
        });
        await tx.customer.update({
          where: { id: salesOrder.customerId },
          // No floor clamp: money back beyond the outstanding debt becomes credit
          // under the customer's account (رصيد تحت الحساب).
          data: { remainingDebt: (debtBefore?.remainingDebt ?? 0) - total },
        });

        // Recalculate payment status for the parent order
        await recalculatePaymentStatus(tx, salesOrderId);

        return created;
      });

      const full = await prisma.returnTransaction.findUnique({
        where: { id: returnRecord.id },
        include: {
          company: true,
          customer: true,
          product: true,
          warehouse: true,
          salesOrder: { select: { id: true } },
          salesOrderItem: { select: { id: true, unitPrice: true, quantity: true } },
        },
      });

      return NextResponse.json(full, { status: 201 });
    }

    if (type === "PURCHASE_RETURN") {
      const { purchaseOrderId, purchaseOrderItemId } = body;
      if (!purchaseOrderId || !purchaseOrderItemId) {
        return NextResponse.json(
          { error: "اختيار فاتورة الشراء والمنتج مطلوب", code: "PURCHASE_ORDER_REQUIRED" },
          { status: 400 }
        );
      }

      const normalizedQty = Number(quantity);
      if (!Number.isInteger(normalizedQty) || normalizedQty <= 0) {
        return NextResponse.json(
          { error: "الكمية يجب أن تكون عددًا صحيحًا أكبر من صفر", code: "INVALID_QUANTITY" },
          { status: 400 }
        );
      }

      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: {
          items: { include: { product: true } },
          company: { select: { id: true, name: true, nameAr: true } },
          supplier: { select: { id: true, name: true } },
        },
      });

      if (!purchaseOrder) {
        return NextResponse.json(
          { error: "فاتورة الشراء غير موجودة", code: "PURCHASE_ORDER_NOT_FOUND" },
          { status: 404 }
        );
      }

      const purchaseItem = purchaseOrder.items.find((i) => i.id === purchaseOrderItemId);
      if (!purchaseItem) {
        return NextResponse.json(
          { error: "المنتج غير موجود في فاتورة الشراء", code: "PURCHASE_ITEM_NOT_FOUND" },
          { status: 404 }
        );
      }

      const existingReturns = await prisma.returnTransaction.findMany({
        where: {
          purchaseOrderId,
          purchaseOrderItemId,
          status: { not: "REJECTED" },
        },
      });
      const totalReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);
      const availableToReturn = purchaseItem.quantity - totalReturned;

      if (normalizedQty > availableToReturn) {
        return NextResponse.json(
          {
            error: `الكمية المطلوبة (${normalizedQty}) تتجاوز الكمية المتاحة للمرتجع (${availableToReturn})`,
            code: "EXCEEDED_RETURNABLE_QUANTITY",
          },
          { status: 400 }
        );
      }

      const warehouse = await prisma.warehouse.findFirst({
        where: { companyId: purchaseOrder.companyId, isMain: true },
        select: { id: true },
      });

      if (!warehouse) {
        return NextResponse.json(
          { error: "لا يوجد مستودع رئيسي للشركة", code: "NO_WAREHOUSE" },
          { status: 400 }
        );
      }

      const unitPrice = purchaseItem.unitPrice;
      const total = Number((normalizedQty * unitPrice).toFixed(2));

      const returnRecord = await prisma.$transaction(async (tx) => {
        const created = await tx.returnTransaction.create({
          data: {
            companyId: purchaseOrder.companyId,
            type: "PURCHASE_RETURN",
            purchaseOrderId,
            purchaseOrderItemId,
            priceTier: null,
            warehouseId: warehouse.id,
            supplierId: purchaseOrder.supplierId,
            productId: purchaseItem.productId,
            quantity: normalizedQty,
            unitPrice,
            total,
            reason: reason || null,
            status: "APPROVED",
          },
        });

        // Goods go back out of the warehouse to the supplier (guarded: never negative).
        const inv = await tx.warehouseInventory.findUnique({
          where: { warehouseId_productId: { warehouseId: warehouse.id, productId: purchaseItem.productId } },
        });
        const available = inv?.quantity ?? 0;
        if (!inv || available < normalizedQty) {
          throw new Error("INSUFFICIENT_STOCK");
        }
        await tx.warehouseInventory.update({
          where: { warehouseId_productId: { warehouseId: warehouse.id, productId: purchaseItem.productId } },
          data: { quantity: available - normalizedQty },
        });

        await tx.stockMovement.create({
          data: {
            warehouseId: warehouse.id,
            productId: purchaseItem.productId,
            quantity: normalizedQty,
            movementType: "PURCHASE_RETURN_OUT",
            referenceId: created.id,
            notes: `مرتجع مشتريات — فاتورة ${purchaseOrder.id} — ${purchaseItem.product?.name || ""}`,
          },
        });

        // Money comes back to the company: an ADDITION settlement (refund).
        await tx.settlement.create({
          data: {
            companyId: purchaseOrder.companyId,
            amount: total,
            paymentMethod: "CASH",
            reason: `مرتجع مشتريات — ${purchaseOrder.id}`,
            direction: "ADDITION",
            status: "VERIFIED",
            collectedBy: actor.id,
            settlementNumber: `STL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          },
        });

        // Reduce the purchase order total to reflect the returned value.
        const newTotal = Math.max(0, Number(((purchaseOrder.total || 0) - total).toFixed(2)));
        await tx.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: { total: newTotal },
        });

        return created;
      });

      const full = await prisma.returnTransaction.findUnique({
        where: { id: returnRecord.id },
        include: {
          company: true,
          supplier: true,
          product: true,
          warehouse: true,
          purchaseOrder: { select: { id: true } },
          purchaseOrderItem: { select: { id: true, unitPrice: true, quantity: true } },
        },
      });

      return NextResponse.json(full, { status: 201 });
    }

    return NextResponse.json({ error: "نوع المرتجع غير صالح", code: "INVALID_RETURN_TYPE" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json({ error: "الكمية المتاحة في المخزون لا تكفي لهذا المرتجع — لا يُسمح برصيد سالب", code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create return transaction" }, { status: traceError("[returns:POST] create failed", error) });
  }
}
