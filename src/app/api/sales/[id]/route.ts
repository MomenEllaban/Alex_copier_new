import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import { recalculatePaymentStatus } from "@/lib/payment-status";
import { computeCreditSplit, creditUsedNote } from "@/lib/customer-credit";
import { sanitizePaymentMethod } from "@/lib/payment-method";
import { traceError } from "@/lib/prisma-errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePageAccess("sales");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const { id } = await params;
    const sale = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        company: true,
        salesCategory: true,
        items: {
          include: { product: true, tradeInProduct: true },
        },
        installments: true,
      },
    });

    if (!sale) {
      return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
    }

    return NextResponse.json(sale);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch sales order" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("sales", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const { items, installments, ...raw } = body;

    if (!raw.companyId || !raw.customerId || !raw.orderType || !raw.paymentMethod || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "بيانات البيع غير مكتملة", code: "SALE_FIELDS_REQUIRED" }, { status: 400 });
    }
    if (items.some((item: { productId?: string; quantity?: number; unitPrice?: number }) => !item.productId || !Number.isInteger(item.quantity) || (item.quantity ?? 0) <= 0 || !Number.isFinite(item.unitPrice) || (item.unitPrice ?? -1) < 0)) {
      return NextResponse.json({ error: "بنود البيع غير صالحة", code: "INVALID_SALE_ITEMS" }, { status: 400 });
    }

    const existing = await prisma.salesOrder.findUnique({
      where: { id },
      select: {
        id: true,
        customerId: true,
        companyId: true,
        paymentMethod: true,
        total: true,
        paidAmount: true,
        creditUsed: true,
        tradeInTotal: true,
        orderDate: true,
        items: { include: { tradeInProduct: true } },
        installments: { select: { id: true } },
        returns: { select: { status: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "فاتورة البيع غير موجودة", code: "SALE_NOT_FOUND" }, { status: 404 });
    }
    const hasActiveReturns = existing.returns.some(
      (r) => r.status === "APPROVED" || r.status === "COMPLETED"
    );
    if (hasActiveReturns) {
      return NextResponse.json({ error: "لا يمكن تعديل فاتورة لها مرتجعات مقبولة. احذف المرتجعات أولاً", code: "HAS_ACTIVE_RETURNS" }, { status: 400 });
    }

    const resolvedTaxRate = raw.isTaxInvoice ? 14 : Number(raw.taxRate) || 0;
    const companyId = String(raw.companyId).trim();
    const customerId = String(raw.customerId).trim();
    const orderType = String(raw.orderType).trim() as "MACHINE_SALE" | "SPARE_PART_SALE";
    const paymentMethod = sanitizePaymentMethod(raw.paymentMethod);
    if (!paymentMethod) {
      return NextResponse.json({ error: "طريقة الدفع غير صالحة (كاش أو أجل فقط)", code: "INVALID_PAYMENT_METHOD" }, { status: 400 });
    }
    const notes = raw.notes ? String(raw.notes) : null;
    const engineerId = typeof raw.engineerId === "string" && raw.engineerId.trim() ? raw.engineerId : null;
    const discountVal = Math.max(0, Number(raw.discount) || 0);
    const discountType = (raw.discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED") as "FIXED" | "PERCENTAGE";
    const isTaxInvoice = Boolean(raw.isTaxInvoice);

    const [company, customer] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { id: true } }),
      prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }),
    ]);
    if (!company) {
      return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 400 });
    }
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود", code: "CUSTOMER_NOT_FOUND" }, { status: 400 });
    }
    if (engineerId) {
      const engineer = await prisma.engineer.findUnique({ where: { id: engineerId }, select: { id: true } });
      if (!engineer) {
        return NextResponse.json({ error: "المهندس غير موجود", code: "ENGINEER_NOT_FOUND" }, { status: 400 });
      }
    }
    const productIds = items.map((item: { productId: string }) => item.productId);
    const distinctProducts = new Set(productIds);
    const foundProducts = await prisma.product.count({ where: { id: { in: productIds } } });
    if (foundProducts !== distinctProducts.size) {
      return NextResponse.json({ error: "منتج غير موجود في سجل المنتجات", code: "PRODUCT_NOT_FOUND" }, { status: 400 });
    }

    const subtotal = items.reduce(
      (sum: number, item: { quantity: number; unitPrice: number; discount?: number }) =>
        sum + item.quantity * item.unitPrice - Math.min(item.discount ?? 0, item.quantity * item.unitPrice),
      0
    );
    const orderDiscount = discountType === "PERCENTAGE" ? subtotal * Math.min(discountVal, 100) / 100 : Math.min(discountVal, subtotal);
    const taxable = subtotal - orderDiscount;
    const total = Math.round((taxable + taxable * Math.max(0, resolvedTaxRate) / 100) * 100) / 100;

    // Trade-in value (قيمة الاستبدال) is customer coverage toward the invoice.
    const tradeInVal = items.reduce(
      (sum: number, item: { tradeIn?: { value?: number } }) =>
        sum + Math.max(0, Number(item.tradeIn?.value) || 0),
      0
    );

    // Original debt contribution of this order (to be reversed) — matches the
    // POST forward logic. Unpaid portion adds debt; creditUsed consumed some of
    // the customer's under-account money (also reflected in remainingDebt).
    // A trade-in value covered part of the original invoice, so it is subtracted
    // from the unpaid portion to avoid over-reversing.
    const originalCreditUsed = Number((existing as { creditUsed?: number }).creditUsed) || 0;
    const originalTradeIn = Number((existing as { tradeInTotal?: number }).tradeInTotal) || 0;
    const originalUnpaid =
      existing.paymentMethod !== "CASH"
        ? Math.max(0, existing.total - existing.paidAmount - originalTradeIn)
        : 0;
    const originalRemainingDelta = originalUnpaid + originalCreditUsed;

    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId, isMain: true },
      select: { id: true },
    });
    if (!warehouse) {
      return NextResponse.json(
        { error: "لا يوجد مستودع رئيسي لهذه الشركة — لا يمكن تعديل الفاتورة دون خصم من المخزون", code: "NO_MAIN_WAREHOUSE" },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1) Reverse stock from the ORIGINAL order using recorded movements
      const stockMovements = await tx.stockMovement.findMany({ where: { referenceId: id } });
      for (const movement of stockMovements) {
        if (movement.movementType === "SALE_OUT") {
          await tx.warehouseInventory.upsert({
            where: { warehouseId_productId: { warehouseId: movement.warehouseId, productId: movement.productId } },
            update: { quantity: { increment: movement.quantity } },
            create: { warehouseId: movement.warehouseId, productId: movement.productId, quantity: movement.quantity },
          });
        } else if (movement.movementType === "PURCHASE_IN") {
          const inv = await tx.warehouseInventory.findUnique({
            where: { warehouseId_productId: { warehouseId: movement.warehouseId, productId: movement.productId } },
          });
          const available = inv?.quantity ?? 0;
          if (!inv || available < movement.quantity) {
            throw new Error(`INSUFFICIENT_STOCK:${movement.productId}`);
          }
          await tx.warehouseInventory.update({
            where: { warehouseId_productId: { warehouseId: movement.warehouseId, productId: movement.productId } },
            data: { quantity: available - movement.quantity },
          });
        }
      }
      await tx.stockMovement.deleteMany({ where: { referenceId: id } });

      // 2) Remove original line items + trade-in products
      const oldTradeInProductIds = existing.items
        .map((it) => it.tradeInProductId)
        .filter((pid): pid is string => Boolean(pid));
      await tx.salesOrderItem.deleteMany({ where: { salesOrderId: id } });
      if (oldTradeInProductIds.length > 0) {
        await tx.product.deleteMany({ where: { id: { in: oldTradeInProductIds } } });
      }
      // 3) Remove installments (will be recreated if provided)
      if (existing.installments.length > 0) {
        await tx.installment.deleteMany({ where: { salesOrderId: id } });
      }

      // 4) Reverse original customer debt (including consumed under-account
      // credit) and drop the statement rows we recorded for the credit usage.
      if (originalRemainingDelta > 0) {
        const debtBefore = await tx.customer.findUnique({
          where: { id: existing.customerId },
          select: { totalDebt: true, remainingDebt: true },
        });
        await tx.customer.update({
          where: { id: existing.customerId },
          data: {
            totalDebt: Math.max(0, (debtBefore?.totalDebt ?? 0) - originalUnpaid),
            remainingDebt: (debtBefore?.remainingDebt ?? 0) - originalRemainingDelta,
          },
        });
        await tx.customerLedger.upsert({
          where: { customerId_companyId: { customerId: existing.customerId, companyId: existing.companyId } },
          update: { balance: { decrement: originalRemainingDelta } },
          create: { customerId: existing.customerId, companyId: existing.companyId, balance: -originalRemainingDelta },
        });
      }
      await tx.customerPayment.deleteMany({
        where: { customerId: existing.customerId, notes: { contains: id } },
      });

      // 5) Deduct new stock
      if (warehouse) {
        for (const item of items as { productId: string; quantity: number }[]) {
          const iv = await tx.warehouseInventory.findUnique({
            where: { warehouseId_productId: { warehouseId: warehouse.id, productId: item.productId } },
          });
          const available = iv?.quantity ?? 0;
          if (available < item.quantity || !iv) {
            throw new Error(`INSUFFICIENT_STOCK:${item.productId}`);
          }
          await tx.warehouseInventory.update({
            where: { warehouseId_productId: { warehouseId: warehouse.id, productId: item.productId } },
            data: { quantity: available - item.quantity },
          });
        }
      }

      const installmentData = Array.isArray(installments) && installments.length > 0
        ? {
            create: installments.map(
              (inst: { installmentNo: number; amount: number; dueDate: string }) => ({
                installmentNo: inst.installmentNo,
                amount: inst.amount,
                dueDate: new Date(inst.dueDate),
              })
            ),
          }
        : undefined;

      // 6) Compute how the new invoice total is covered (under-account credit is
      // consumed FIRST, then the user-provided upfront cash), and read the new
      // customer's balance fresh since step 4 may have reversed the old customer.
      const customerNow = await tx.customer.findUnique({
        where: { id: customerId },
        select: { remainingDebt: true },
      });
      const creditSplit = computeCreditSplit(total, customerNow?.remainingDebt ?? 0, Number(raw.paidAmount) || 0, paymentMethod, tradeInVal);
      const initialPaidAmount = creditSplit.paidAmount;

      await tx.salesOrder.update({
        where: { id },
        data: {
          companyId,
          customerId,
          engineerId,
          categoryId: typeof raw.categoryId === "string" && raw.categoryId ? raw.categoryId : null,
          orderType,
          paymentMethod,
          notes,
          discount: discountVal,
          discountType,
          taxRate: resolvedTaxRate,
          isTaxInvoice,
          total,
          paidAmount: initialPaidAmount,
          creditUsed: creditSplit.creditUsed,
          tradeInTotal: 0,
          ...(installmentData && { installments: installmentData }),
        },
      });

      // 7) Apply new customer balance:
      //    - unpaid  => new debt (totalDebt + remainingDebt)
      //    - creditUsed => under-account money consumed by this invoice
      const remainingDelta = creditSplit.unpaid + creditSplit.creditUsed;
      if (remainingDelta > 0 || creditSplit.unpaid > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            ...(creditSplit.unpaid > 0 ? { totalDebt: { increment: creditSplit.unpaid } } : {}),
            ...(remainingDelta > 0 ? { remainingDebt: { increment: remainingDelta } } : {}),
          },
        });
        await tx.customerLedger.upsert({
          where: { customerId_companyId: { customerId, companyId } },
          update: { balance: { increment: remainingDelta } },
          create: { customerId, companyId, balance: remainingDelta },
        });
      }

      // Record how the invoice was covered so the statement shows it clearly.
      const paymentEffectiveDate = raw.orderDate ? new Date(raw.orderDate) : existing.orderDate;
      if (creditSplit.creditUsed > 0) {
        await tx.customerPayment.create({
          data: {
            customerId,
            companyId,
            amount: creditSplit.creditUsed,
            paymentDate: paymentEffectiveDate,
            notes: creditUsedNote(id),
          },
        });
      }
      if (paymentMethod !== "CASH" && creditSplit.cashUpfront > 0) {
        await tx.customerPayment.create({
          data: {
            customerId,
            companyId,
            amount: creditSplit.cashUpfront,
            paymentDate: paymentEffectiveDate,
            notes: `دفع مبدئي مع فاتورة بيع ${id}`,
          },
        });
      }

      // 8) Create new items + trade-in
      let tradeInTotal = 0;
      for (const item of items as {
        productId: string;
        quantity: number;
        unitPrice: number;
        discount?: number;
        tradeIn?: { name: string; brand?: string; condition?: string; value: number; serialNumber?: string };
      }[]) {
        let tradeInProductId: string | undefined;
        if (item.tradeIn && item.tradeIn.value > 0) {
          const tradeInProduct = await tx.product.create({
            data: {
              name: item.tradeIn.name,
              productType: orderType === "MACHINE_SALE" ? "MACHINE" : "SPARE_PART",
              companyId,
              isTradeIn: true,
              tradeInValue: item.tradeIn.value,
              brand: item.tradeIn.brand || null,
              condition: item.tradeIn.condition || null,
              description: item.tradeIn.serialNumber ? `S/N: ${item.tradeIn.serialNumber}` : null,
            },
          });
          tradeInProductId = tradeInProduct.id;
          tradeInTotal += item.tradeIn.value;
          if (warehouse) {
            await tx.warehouseInventory.create({
              data: { warehouseId: warehouse.id, productId: tradeInProduct.id, quantity: 1 },
            });
            await tx.stockMovement.create({
              data: {
                warehouseId: warehouse.id,
                productId: tradeInProduct.id,
                quantity: 1,
                movementType: "PURCHASE_IN",
                referenceId: id,
                notes: `منتج استبدال — ${item.tradeIn.name}`,
              },
            });
          }
        }
        await tx.salesOrderItem.create({
          data: {
            salesOrderId: id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: Math.min(item.discount ?? 0, item.quantity * item.unitPrice),
            tradeInProductId: tradeInProductId || null,
            tradeInValue: item.tradeIn?.value || 0,
          },
        });
        if (warehouse) {
          await tx.stockMovement.create({
            data: {
              warehouseId: warehouse.id,
              productId: item.productId,
              quantity: item.quantity,
              movementType: "SALE_OUT",
              referenceId: id,
              notes: `بيع — ${orderType} — ${id}`,
            },
          });
        }
      }

      if (tradeInTotal > 0) {
        await tx.salesOrder.update({ where: { id }, data: { tradeInTotal } });
      }

      await recalculatePaymentStatus(tx, id);

      return tx.salesOrder.findUnique({
        where: { id },
        include: {
          customer: true,
          company: true,
          engineer: true,
          items: { include: { product: true, tradeInProduct: true } },
          installments: true,
        },
      });
    }, { timeout: 120000 });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_STOCK")) {
      return NextResponse.json({ error: "الكمية المتاحة في المخزون لا تكفي لهذه الحركة", code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update sales order", detail: error instanceof Error ? error.message : undefined }, { status: traceError("[sales:PUT] update failed", error) });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("sales", "delete");
    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.salesOrder.findUnique({
      where: { id },
      select: {
        id: true,
        customerId: true,
        companyId: true,
        paymentMethod: true,
        total: true,
        paidAmount: true,
        creditUsed: true,
        tradeInTotal: true,
        items: { select: { id: true, tradeInProductId: true } },
        installments: { select: { id: true } },
        returns: { select: { id: true, status: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
    }

    // Check if there are approved/completed returns - block deletion
    const activeReturns = existing.returns.filter(
      (r) => r.status === "APPROVED" || r.status === "COMPLETED"
    );
    if (activeReturns.length > 0) {
      return NextResponse.json(
        { error: "لا يمكن حذف فاتورة بيعلها مرتجعات مقبولة. احذف المرتجعات أولاً", code: "HAS_ACTIVE_RETURNS" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Reverse the customer debt this invoice created (unpaid + consumed
      // under-account credit). The trade-in value covered part of the invoice
      // at creation, so it must not be reversed here.
      const originalCreditUsed = Number(existing.creditUsed) || 0;
      const originalTradeIn = Number(existing.tradeInTotal) || 0;
      const originalUnpaid =
        existing.paymentMethod !== "CASH"
          ? Math.max(0, existing.total - existing.paidAmount - originalTradeIn)
          : 0;
      const originalRemainingDelta = originalUnpaid + originalCreditUsed;
      if (originalRemainingDelta > 0) {
        const debtBefore = await tx.customer.findUnique({
          where: { id: existing.customerId },
          select: { totalDebt: true, remainingDebt: true },
        });
        await tx.customer.update({
          where: { id: existing.customerId },
          data: {
            totalDebt: Math.max(0, (debtBefore?.totalDebt ?? 0) - originalUnpaid),
            remainingDebt: (debtBefore?.remainingDebt ?? 0) - originalRemainingDelta,
          },
        });
        await tx.customerLedger.upsert({
          where: { customerId_companyId: { customerId: existing.customerId, companyId: existing.companyId } },
          update: { balance: { decrement: originalRemainingDelta } },
          create: { customerId: existing.customerId, companyId: existing.companyId, balance: -originalRemainingDelta },
        });
      }
      await tx.customerPayment.deleteMany({
        where: { customerId: existing.customerId, notes: { contains: existing.id } },
      });

      // Clean up trade-in products created for this order before deleting it.
      const tradeInProductIds = existing.items
        .map((it) => it.tradeInProductId)
        .filter((pid): pid is string => Boolean(pid));
      if (tradeInProductIds.length > 0) {
        await tx.product.deleteMany({ where: { id: { in: tradeInProductIds } } });
      }

      // Reverse stock movements for this order
      const stockMovements = await tx.stockMovement.findMany({
        where: { referenceId: id },
      });

      for (const movement of stockMovements) {
        if (movement.movementType === "SALE_OUT") {
          // Reverse sale: increment warehouse inventory
          await tx.warehouseInventory.upsert({
            where: { warehouseId_productId: { warehouseId: movement.warehouseId, productId: movement.productId } },
            update: { quantity: { increment: movement.quantity } },
            create: { warehouseId: movement.warehouseId, productId: movement.productId, quantity: movement.quantity },
          });
        } else if (movement.movementType === "PURCHASE_IN") {
          // Reverse trade-in: decrement warehouse inventory (guarded: never negative)
          const inv = await tx.warehouseInventory.findUnique({
            where: { warehouseId_productId: { warehouseId: movement.warehouseId, productId: movement.productId } },
          });
          const available = inv?.quantity ?? 0;
          if (!inv || available < movement.quantity) {
            throw new Error(`INSUFFICIENT_STOCK:${movement.productId}`);
          }
          await tx.warehouseInventory.update({
            where: { warehouseId_productId: { warehouseId: movement.warehouseId, productId: movement.productId } },
            data: { quantity: available - movement.quantity },
          });
        }
      }

      // Delete stock movements
      await tx.stockMovement.deleteMany({ where: { referenceId: id } });

      // Delete the order (cascades to items, installments, returns via Prisma)
      await tx.salesOrder.delete({ where: { id } });
    });

    return NextResponse.json({ message: "Sales order deleted" });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_STOCK")) {
      return NextResponse.json({ error: "الكمية المتاحة في المخزون لا تكفي للعكس — لا يُسمح برصيد سالب", code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }
    console.error("Failed to delete sales order:", error);
    return NextResponse.json({ error: "Failed to delete sales order" }, { status: 500 });
  }
}
