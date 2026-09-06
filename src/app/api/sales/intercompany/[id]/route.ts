import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePageAccess, requireAuth } from "@/lib/auth-helpers";
import { recalculatePaymentStatus } from "@/lib/payment-status";
import { computeCreditSplit, creditUsedNote } from "@/lib/customer-credit";
import { traceError } from "@/lib/prisma-errors";

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface InterItem {
  productId: string;
  quantity: number;
  internalPrice: number;
  customerPrice: number;
  costPrice?: number;
}

interface AccountRefs {
  cash: string;
  receivables: string;
  inventory: string;
  revenue: string;
  cogs: string;
}

async function getCompanyAccounts(tx: PrismaTx, companyId: string): Promise<AccountRefs> {
  const cash = await tx.account.findFirst({ where: { companyId, code: "1001" } });
  const receivables = await tx.account.findFirst({ where: { companyId, code: "1100" } });
  const inventory = await tx.account.findFirst({ where: { companyId, code: "1200" } });
  const revenue = await tx.account.findFirst({ where: { companyId, code: "4001" } });
  const cogs = await tx.account.findFirst({ where: { companyId, code: "5001" } });

  if (!cash || !receivables || !inventory || !revenue || !cogs) {
    throw new Error("ACCOUNT_CHART_MISSING");
  }
  return {
    cash: cash.id,
    receivables: receivables.id,
    inventory: inventory.id,
    revenue: revenue.id,
    cogs: cogs.id,
  };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePageAccess("sales");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" }, { status: authed ? 403 : 401 });
    }

    const { id: orderId } = await params;
    const body = await request.json();
    const {
      fromCompanyId,
      toCompanyId,
      customerId,
      engineerId,
      orderType,
      paymentMethod,
      paidAmount,
      isTaxInvoice,
      taxRate,
      discount,
      discountType,
      notes,
      items,
    } = body;

    if (
      !fromCompanyId || !toCompanyId || !customerId || !orderType || !paymentMethod ||
      fromCompanyId === toCompanyId ||
      !Array.isArray(items) || items.length === 0
    ) {
      return NextResponse.json({ error: "بيانات البيع الداخلي غير مكتملة", code: "INTERCOMPANY_FIELDS_REQUIRED" }, { status: 400 });
    }

    for (const item of items as InterItem[]) {
      if (
        !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isFinite(item.internalPrice) || item.internalPrice < 0 ||
        !Number.isFinite(item.customerPrice) || item.customerPrice < 0
      ) {
        return NextResponse.json({ error: "بنود البيع الداخلي غير صالحة", code: "INVALID_INTERCOMPANY_ITEMS" }, { status: 400 });
      }
    }

    const [fromCompany, toCompany, customer, engineer] = await Promise.all([
      prisma.company.findUnique({ where: { id: fromCompanyId }, select: { id: true } }),
      prisma.company.findUnique({ where: { id: toCompanyId }, select: { id: true } }),
      prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, remainingDebt: true } }),
      engineerId
        ? prisma.engineer.findUnique({ where: { id: engineerId }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    if (!fromCompany) {
      return NextResponse.json({ error: "شركة المصدر غير موجودة", code: "FROM_COMPANY_NOT_FOUND" }, { status: 400 });
    }
    if (!toCompany) {
      return NextResponse.json({ error: "شركة الوجهة غير موجودة", code: "TO_COMPANY_NOT_FOUND" }, { status: 400 });
    }
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود", code: "CUSTOMER_NOT_FOUND" }, { status: 400 });
    }
    if (engineerId && !engineer) {
      return NextResponse.json({ error: "المهندس غير موجود", code: "ENGINEER_NOT_FOUND" }, { status: 400 });
    }
    const productIds = items.map((item: InterItem) => item.productId);
    const distinctProducts = new Set(productIds);
    const foundProducts = await prisma.product.count({ where: { id: { in: productIds } } });
    if (foundProducts !== distinctProducts.size) {
      return NextResponse.json({ error: "منتج غير موجود في سجل المنتجات", code: "PRODUCT_NOT_FOUND" }, { status: 400 });
    }

    const resolvedTaxRate = isTaxInvoice ? 14 : Number(taxRate) || 0;
    const orderDiscount = Number(discount) || 0;
    const _discountType = (discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED") as "FIXED" | "PERCENTAGE";
    const internalPaidAmount = Number(body.internalPaidAmount) || 0;
    const internalPaymentMethod = String(body.internalPaymentMethod || "CREDIT");
    const paid = Number(paidAmount) || 0;

    const subtotal = (items as InterItem[]).reduce((s, it) => s + it.customerPrice * it.quantity, 0);
    const discountValue = _discountType === "PERCENTAGE" ? (subtotal * orderDiscount) / 100 : orderDiscount;
    const totalNoTax = Math.max(subtotal - discountValue, 0);
    const taxVal = isTaxInvoice ? (totalNoTax * resolvedTaxRate) / 100 : 0;
    const total = totalNoTax + taxVal;
    const internalTotal = (items as InterItem[]).reduce((s, it) => s + it.internalPrice * it.quantity, 0);
    const costTotal = (items as InterItem[]).reduce((s, it) => s + (it.costPrice || 0) * it.quantity, 0);

    const result = await prisma.$transaction(async (tx: PrismaTx) => {
      const existing = await tx.salesOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          customerId: true,
          companyId: true,
          paymentMethod: true,
          total: true,
          paidAmount: true,
          creditUsed: true,
          items: { include: { product: true } },
          installments: true,
        },
      });
      if (!existing) {
        throw new Error("ORDER_NOT_FOUND");
      }

      const invoice = await tx.interCompanyInvoice.findFirst({ where: { salesOrderId: orderId } });
      if (!invoice) {
        throw new Error("NOT_INTERCOMPANY");
      }

      const existingCustomer = await tx.customer.findUnique({ where: { id: existing.customerId! } });
      // The original forward logic added: totalDebt += unpaid and
      // remainingDebt += unpaid + creditUsed (see POST). Reverse the same way.
      const existingCreditUsed = existing.creditUsed ?? 0;
      const origUnpaid = existing.paymentMethod !== "CASH"
        ? Math.max(0, existing.total - existing.paidAmount - existingCreditUsed)
        : 0;
      const origDelta = origUnpaid + existingCreditUsed;

      // ══════════ REVERSAL ══════════
      // عكس ديون العميل الأصلية
      if (origDelta > 0 && existingCustomer) {
        const debtBefore = await tx.customer.findUnique({
          where: { id: existing.customerId! },
          select: { totalDebt: true, remainingDebt: true },
        });
        await tx.customer.update({
          where: { id: existing.customerId! },
          data: {
            totalDebt: Math.max(0, (debtBefore?.totalDebt ?? 0) - origUnpaid),
            // No floor clamp: reversal re-instates any under-account credit.
            remainingDebt: (debtBefore?.remainingDebt ?? 0) - origDelta,
          },
        });
        await tx.customerLedger.upsert({
          where: { customerId_companyId: { customerId: existing.customerId!, companyId: existing.companyId } },
          update: { balance: { decrement: origDelta } },
          create: { customerId: existing.customerId!, companyId: existing.companyId, balance: -origDelta },
        });
      }

      // احذف صفوف الدفع المرتبطة بالفاتورة (خصم رصيد تحت الحساب / دفع مبدئي)
      await tx.customerPayment.deleteMany({
        where: { customerId: existing.customerId!, notes: { contains: orderId } },
      });

      // حذف القيود المحاسبية للشركتين
      await tx.journalEntry.deleteMany({ where: { referenceType: "InterCompanyInvoice", referenceId: invoice.id } });
      await tx.journalEntry.deleteMany({ where: { referenceType: "SalesOrder", referenceId: orderId } });

      // عكس حركات المخزون المرتبطة بالأمر
      const movements = await tx.stockMovement.findMany({ where: { referenceId: orderId } });
      for (const m of movements) {
        const inv = await tx.warehouseInventory.findUnique({
          where: { warehouseId_productId: { warehouseId: m.warehouseId, productId: m.productId } },
        });
        const base = inv?.quantity ?? 0;
        // عكس كل حركة على مصدرها الصحيح:
        //  - INTER_COMPANY_OUT: خصمت من المصدر → نعيدها للمصدر (+)
        //  - INTER_COMPANY_IN: أضافت للوجهة → نحذفها من الوجهة (−)
        //  - SALE_OUT: خصمت من الوجهة → نعيدها للوجهة (+)
        const addsBack = m.movementType === "SALE_OUT" || m.movementType === "INTER_COMPANY_OUT";
        const newQty = addsBack ? base + m.quantity : base - m.quantity;
        if (newQty < 0) {
          // عكس حركة خصم لا يجب أن يُسقط الرصيد تحت الصفر — يُرفض وقد تُرجَّع العملية كلها.
          throw new Error(`INSUFFICIENT_STOCK:${m.productId}`);
        }
        if (inv) {
          await tx.warehouseInventory.update({
            where: { warehouseId_productId: { warehouseId: m.warehouseId, productId: m.productId } },
            data: { quantity: newQty },
          });
        } else if (addsBack) {
          await tx.warehouseInventory.create({
            data: { warehouseId: m.warehouseId, productId: m.productId, quantity: m.quantity },
          });
        }
      }
      await tx.stockMovement.deleteMany({ where: { referenceId: orderId } });

      // حذف البنود والأقساط القديمة
      await tx.salesOrderItem.deleteMany({ where: { salesOrderId: orderId } });
      await tx.installment.deleteMany({ where: { salesOrderId: orderId } });

      // ══════════ APPLY ══════════
      const warehouses = await tx.warehouse.findMany({
        where: { companyId: { in: [fromCompanyId, toCompanyId] }, isMain: true },
      });
      const sourceWarehouse = warehouses.find((w: { companyId: string }) => w.companyId === fromCompanyId);
      const targetWarehouse = warehouses.find((w: { companyId: string }) => w.companyId === toCompanyId);
      if (!sourceWarehouse || !targetWarehouse) {
        throw new Error("WAREHOUSE_NOT_FOUND");
      }

      // حدد تغطية الفاتورة الجديدة برصيد تحت الحساب الحالي للعميل
      const customerNow = await tx.customer.findUnique({
        where: { id: customerId },
        select: { remainingDebt: true },
      });
      const split = computeCreditSplit(total, customerNow?.remainingDebt ?? 0, paid, paymentMethod);

      await tx.salesOrder.update({
        where: { id: orderId },
        data: {
          companyId: toCompanyId,
          customerId,
          engineerId: engineerId || null,
          status: "CONFIRMED",
          categoryId: typeof body.categoryId === "string" && body.categoryId ? body.categoryId : null,
          orderType,
          paymentMethod,
          notes,
          discount: orderDiscount,
          discountType: _discountType,
          taxRate: resolvedTaxRate,
          isTaxInvoice: Boolean(isTaxInvoice),
          total,
          paidAmount: split.paidAmount,
          creditUsed: split.creditUsed,
          paymentStatus: "PENDING",
          tradeInTotal: 0,
        },
      });

      if (invoice.fromCompanyId !== fromCompanyId || invoice.toCompanyId !== toCompanyId) {
        await tx.interCompanyInvoice.update({
          where: { id: invoice.id },
          data: {
            fromCompanyId,
            toCompanyId,
            total: internalTotal,
            notes: notes || null,
            internalPaymentMethod: internalPaymentMethod === "CASH" ? "CASH" : "CREDIT",
            internalPaidAmount: Math.min(internalPaidAmount, internalTotal),
          },
        });
      } else {
        await tx.interCompanyInvoice.update({
          where: { id: invoice.id },
          data: {
            total: internalTotal,
            notes: notes || null,
            internalPaymentMethod: internalPaymentMethod === "CASH" ? "CASH" : "CREDIT",
            internalPaidAmount: Math.min(internalPaidAmount, internalTotal),
          },
        });
      }

      // سحب المخزون من شركة المصدر
      for (const item of items as InterItem[]) {
        const src = await tx.warehouseInventory.findUnique({
          where: { warehouseId_productId: { warehouseId: sourceWarehouse.id, productId: item.productId } },
        });
        const available = src?.quantity ?? 0;
        if (available < item.quantity || !src) {
          throw new Error(`INSUFFICIENT_STOCK:${item.productId}`);
        }
        await tx.warehouseInventory.update({
          where: { warehouseId_productId: { warehouseId: sourceWarehouse.id, productId: item.productId } },
          data: { quantity: available - item.quantity },
        });
        await tx.stockMovement.create({
          data: {
            warehouseId: sourceWarehouse.id,
            productId: item.productId,
            quantity: item.quantity,
            movementType: "INTER_COMPANY_OUT",
            referenceId: orderId,
            notes: `تحويل داخلي من ${fromCompanyId} إلى ${toCompanyId}`,
          },
        });

        const tgt = await tx.warehouseInventory.findUnique({
          where: { warehouseId_productId: { warehouseId: targetWarehouse.id, productId: item.productId } },
        });
        if (tgt) {
          await tx.warehouseInventory.update({
            where: { warehouseId_productId: { warehouseId: targetWarehouse.id, productId: item.productId } },
            data: { quantity: tgt.quantity + item.quantity },
          });
        } else {
          await tx.warehouseInventory.create({
            data: { warehouseId: targetWarehouse.id, productId: item.productId, quantity: item.quantity },
          });
        }
        await tx.stockMovement.create({
          data: {
            warehouseId: targetWarehouse.id,
            productId: item.productId,
            quantity: item.quantity,
            movementType: "INTER_COMPANY_IN",
            referenceId: orderId,
            notes: `تحويل داخلي من ${fromCompanyId} إلى ${toCompanyId}`,
          },
        });
      }

      // تصريف المخزون من شركة الوجهة للعميل
      // ملاحظة: الرصيد الهدف زاد للتو بحركة INTER_COMPANY_IN، لكن الحارس صارم:
      // لا يُسمح بالمرور الصامت أو خصم جزئي — أي نقص يعيد العملية كاملة (rollback).
      for (const item of items as InterItem[]) {
        const tgt = await tx.warehouseInventory.findUnique({
          where: { warehouseId_productId: { warehouseId: targetWarehouse.id, productId: item.productId } },
        });
        if (!tgt || tgt.quantity < item.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${item.productId}`);
        }
        await tx.warehouseInventory.update({
          where: { warehouseId_productId: { warehouseId: targetWarehouse.id, productId: item.productId } },
          data: { quantity: tgt.quantity - item.quantity },
        });
        await tx.stockMovement.create({
          data: {
            warehouseId: targetWarehouse.id,
            productId: item.productId,
            quantity: item.quantity,
            movementType: "SALE_OUT",
            referenceId: orderId,
            notes: `بيع داخلي للعميل — ${orderId}`,
          },
        });
        await tx.salesOrderItem.create({
          data: {
            salesOrderId: orderId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.customerPrice,
            discount: 0,
          },
        });
      }

      // ديون العميل حسب التغطية الفعلية (رصيد تحت الحساب أولاً ثم المدفوع النقدي)
      const remainingDelta = split.unpaid + split.creditUsed;
      if (remainingDelta > 0 || split.unpaid > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            ...(split.unpaid > 0 ? { totalDebt: { increment: split.unpaid } } : {}),
            ...(remainingDelta > 0 ? { remainingDebt: { increment: remainingDelta } } : {}),
          },
        });
        await tx.customerLedger.upsert({
          where: { customerId_companyId: { customerId, companyId: toCompanyId } },
          update: { balance: { increment: remainingDelta } },
          create: { customerId, companyId: toCompanyId, balance: remainingDelta },
        });
      }

      // سجّل كيف تمت تغطية الفاتورة ليظهر في كشف حساب العميل بوضوح
      if (split.creditUsed > 0) {
        await tx.customerPayment.create({
          data: {
            customerId,
            companyId: toCompanyId,
            amount: split.creditUsed,
            paymentDate: new Date(),
            notes: creditUsedNote(orderId),
          },
        });
      }
      if (paymentMethod !== "CASH" && split.cashUpfront > 0) {
        await tx.customerPayment.create({
          data: {
            customerId,
            companyId: toCompanyId,
            amount: split.cashUpfront,
            paymentDate: new Date(),
            notes: `دفع مبدئي مع فاتورة بيع ${orderId}`,
          },
        });
      }

      await recalculatePaymentStatus(tx, orderId);

      // القيود المحاسبية لشركة المصدر
      const srcAccounts = await getCompanyAccounts(tx, fromCompanyId);
      const srcEntryNumber = `JE-IC-${Date.now()}-1`;
      if (internalTotal > 0) {
        const srcCash = internalPaymentMethod === "CASH" ? internalTotal : Math.min(internalPaidAmount, internalTotal);
        const srcReceivable = internalTotal - srcCash;
        await tx.journalEntry.create({
          data: {
            companyId: fromCompanyId,
            entryNumber: srcEntryNumber,
            date: new Date(),
            description: `بيع داخلي إلى ${toCompanyId} — ${invoice.invoiceNumber}`,
            referenceType: "InterCompanyInvoice",
            referenceId: invoice.id,
            isVerified: true,
            items: {
              create: [
                ...(srcCash > 0 ? [{ accountId: srcAccounts.cash, debit: srcCash, credit: 0 }] : []),
                ...(srcReceivable > 0 ? [{ accountId: srcAccounts.receivables, debit: srcReceivable, credit: 0 }] : []),
                { accountId: srcAccounts.revenue, debit: 0, credit: internalTotal },
                ...(costTotal > 0 ? [
                  { accountId: srcAccounts.cogs, debit: costTotal, credit: 0 },
                  { accountId: srcAccounts.inventory, debit: 0, credit: costTotal },
                ] : []),
              ],
            },
          },
        });
      }

      // القيود المحاسبية لشركة الوجهة
      const tgtAccounts = await getCompanyAccounts(tx, toCompanyId);
      const tgtEntryNumber = `JE-IC-${Date.now()}-2`;
      const tgtCash = split.paidAmount;
      const tgtReceivable = total - tgtCash;
      await tx.journalEntry.create({
        data: {
          companyId: toCompanyId,
          entryNumber: tgtEntryNumber,
          date: new Date(),
          description: `بيع للعميل + شراء داخلي من ${fromCompanyId} — ${orderId.slice(0, 8)}`,
          referenceType: "SalesOrder",
          referenceId: orderId,
          isVerified: true,
          items: {
            create: [
              ...(tgtCash > 0 ? [{ accountId: tgtAccounts.cash, debit: tgtCash, credit: 0 }] : []),
              ...(tgtReceivable > 0 ? [{ accountId: tgtAccounts.receivables, debit: tgtReceivable, credit: 0 }] : []),
              { accountId: tgtAccounts.revenue, debit: 0, credit: total },
              ...(internalTotal > 0 ? [{ accountId: tgtAccounts.cogs, debit: internalTotal, credit: 0 }] : []),
              { accountId: tgtAccounts.inventory, debit: 0, credit: internalTotal },
            ],
          },
        },
      });

      const finalOrder = await tx.salesOrder.findUnique({
        where: { id: orderId },
        include: {
          customer: true,
          company: true,
          items: { include: { product: true } },
        },
      });

      return { interInvoice: invoice, order: finalOrder, internalTotal, costTotal, total };
    }, { timeout: 120000 });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_CHART_MISSING") {
      return NextResponse.json({ error: "شجرة الحسابات غير مكتملة لإحدى الشركتين", code: "ACCOUNT_CHART_MISSING" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return NextResponse.json({ error: "أمر البيع غير موجود", code: "ORDER_NOT_FOUND" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "NOT_INTERCOMPANY") {
      return NextResponse.json({ error: "هذا الأمر ليس بيعًا داخليًا", code: "NOT_INTERCOMPANY" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "WAREHOUSE_NOT_FOUND") {
      return NextResponse.json({ error: "المستودع الرئيسي غير موجود لإحدى الشركتين", code: "WAREHOUSE_NOT_FOUND" }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_STOCK")) {
      return NextResponse.json({ error: "الكمية المتاحة في المخزون لا تكفي لهذه الحركة", code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }
    const msg = error instanceof Error ? (error.message || error.name || String(error)) : "Failed to update intercompany sale";
    return NextResponse.json({ error: msg, detail: error instanceof Error ? error.stack : undefined }, { status: traceError("[sales/intercompany:PUT] update failed", error) });
  }
}
