import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import { recalculatePaymentStatus } from "@/lib/payment-status";
import { computeCreditSplit, creditUsedNote } from "@/lib/customer-credit";
import { sanitizePaymentMethod } from "@/lib/payment-method";
import { traceError } from "@/lib/prisma-errors";

export async function GET() {
  try {
    const user = await requirePageAccess("sales");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const [sales, invoices] = await Promise.all([
      prisma.salesOrder.findMany({
        include: {
          customer: true,
          company: true,
          engineer: true,
          salesCategory: { select: { id: true, name: true } },
          items: {
            include: { product: true, tradeInProduct: true },
          },
          installments: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.interCompanyInvoice.findMany({
        select: { salesOrderId: true, fromCompanyId: true, toCompanyId: true, total: true },
      }),
    ]);
    const interMap = new Map(invoices
      .filter((i) => i.salesOrderId)
      .map((i) => [i.salesOrderId, i]));
    const data = sales.map((s) => {
      const invoice = interMap.get(s.id);
      return {
        ...s,
        isIntercompany: Boolean(invoice),
        ...(invoice ? { interCompanyFromCompanyId: invoice.fromCompanyId, interCompanyToCompanyId: invoice.toCompanyId, interCompanyTotal: invoice.total } : {}),
      };
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Sales GET error:", error);
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAction("sales", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" }, { status: authed ? 403 : 401 });
    }
    const body = await request.json();
    const { items, installments, ...raw } = body;

    if (!raw.companyId || !raw.customerId || !raw.orderType || !raw.paymentMethod || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "بيانات البيع غير مكتملة (عميل وشركة وطريقة دفع وبند واحد على الأقل)", code: "SALE_FIELDS_REQUIRED" }, { status: 400 });
    }

    if (!raw.orderDate || isNaN(new Date(raw.orderDate).getTime())) {
      return NextResponse.json({ error: "تاريخ الطلب غير صالح", code: "INVALID_ORDER_DATE" }, { status: 400 });
    }

    const resolvedTaxRate = raw.isTaxInvoice ? 14 : Number(raw.taxRate) || 0;
    const engineerId = typeof raw.engineerId === "string" && raw.engineerId.trim() ? raw.engineerId : null;
    if (items.some((item: { productId?: string; quantity?: number; unitPrice?: number }) => !item.productId || !Number.isInteger(item.quantity) || (item.quantity ?? 0) <= 0 || !Number.isFinite(item.unitPrice) || (item.unitPrice ?? -1) < 0)) {
      return NextResponse.json({ error: "بنود البيع غير صالحة", code: "INVALID_SALE_ITEMS" }, { status: 400 });
    }

    const companyId = String(raw.companyId).trim();
    const customerId = String(raw.customerId).trim();
    const orderType = String(raw.orderType).trim() as "MACHINE_SALE" | "SPARE_PART_SALE";
    const paymentMethod = sanitizePaymentMethod(raw.paymentMethod);
    if (!paymentMethod) {
      return NextResponse.json({ error: "طريقة الدفع غير صالحة (كاش أو أجل فقط)", code: "INVALID_PAYMENT_METHOD" }, { status: 400 });
    }
    const notes = raw.notes ? String(raw.notes) : null;
    const discountVal = Math.max(0, Number(raw.discount) || 0);
    const discountType = (raw.discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED") as "FIXED" | "PERCENTAGE";
    const isTaxInvoice = Boolean(raw.isTaxInvoice);

    const subtotal = items.reduce(
      (sum: number, item: { quantity: number; unitPrice: number; discount?: number }) =>
        sum + item.quantity * item.unitPrice - Math.min(item.discount ?? 0, item.quantity * item.unitPrice),
      0
    );
    const orderDiscount = discountType === "PERCENTAGE" ? subtotal * Math.min(discountVal, 100) / 100 : Math.min(discountVal, subtotal);
    const taxable = subtotal - orderDiscount;
    const total = Math.round((taxable + taxable * Math.max(0, resolvedTaxRate) / 100) * 100) / 100;

    // Trade-in value (قيمة الاستبدال) is customer coverage toward the invoice:
    // it reduces what the customer still owes, exactly like cash.
    const tradeInVal = items.reduce(
      (sum: number, item: { tradeIn?: { value?: number } }) =>
        sum + Math.max(0, Number(item.tradeIn?.value) || 0),
      0
    );

    const [company, customer] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { id: true } }),
      prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, remainingDebt: true } }),
    ]);
    if (!company) {
      return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 400 });
    }
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود", code: "CUSTOMER_NOT_FOUND" }, { status: 400 });
    }

    // Partial upfront payment is only allowed for non-CASH orders and must not
    // exceed the order total. If the customer has money under their account
    // (رصيد تحت الحساب), that credit is consumed FIRST automatically and the
    // given upfront amount is treated as cash paying on top of the credit.
    // A trade-in value covers part of the invoice before any of the above.
    const creditSplit = computeCreditSplit(total, customer.remainingDebt ?? 0, Number(raw.paidAmount) || 0, paymentMethod, tradeInVal);
    const initialPaidAmount = creditSplit.paidAmount;
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

    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId, isMain: true },
      select: { id: true },
    });
    if (!warehouse) {
      return NextResponse.json(
        { error: "لا يوجد مستودع رئيسي لهذه الشركة — لا يمكن إنشاء الفاتورة دون خصم من المخزون", code: "NO_MAIN_WAREHOUSE" },
        { status: 400 }
      );
    }

    const salesOrder = await prisma.$transaction(async (tx) => {
      if (warehouse) {
        for (const item of items as { productId: string; quantity: number }[]) {
          const existing = await tx.warehouseInventory.findUnique({
            where: { warehouseId_productId: { warehouseId: warehouse.id, productId: item.productId } },
          });
          const available = existing?.quantity ?? 0;
          if (available < item.quantity || !existing) {
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

      const order = await tx.salesOrder.create({
        data: {
          companyId,
          customerId,
          engineerId,
          status: "CONFIRMED",
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
          paymentStatus: paymentMethod === "CASH" ? "PAID" : initialPaidAmount >= total ? "PAID" : initialPaidAmount > 0 ? "PARTIAL" : "PENDING",
          tradeInTotal: 0,
          orderDate: new Date(raw.orderDate),
          ...(installmentData && { installments: installmentData }),
        },
      });

      // Update the customer balance:
      // - unpaid => new debt (totalDebt + remainingDebt)
      // - creditUsed => money under the customer's account consumed by this invoice
      //   (raises remainingDebt back toward zero, since the credit is being used)
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

      let tradeInTotal = 0;

      for (const item of items as {
        productId: string;
        quantity: number;
        unitPrice: number;
        discount?: number;
        tradeIn?: {
          name: string;
          brand?: string;
          condition?: string;
          value: number;
          serialNumber?: string;
        };
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
              data: {
                warehouseId: warehouse.id,
                productId: tradeInProduct.id,
                quantity: 1,
              },
            });
            await tx.stockMovement.create({
              data: {
                warehouseId: warehouse.id,
                productId: tradeInProduct.id,
                quantity: 1,
                movementType: "PURCHASE_IN",
                referenceId: order.id,
                notes: `منتج استبدال — ${item.tradeIn.name}`,
              },
            });
          }
        }

        await tx.salesOrderItem.create({
          data: {
            salesOrderId: order.id,
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
              referenceId: order.id,
              notes: `بيع — ${orderType} — ${order.id}`,
            },
          });
        }
      }

      if (tradeInTotal > 0) {
        await tx.salesOrder.update({
          where: { id: order.id },
          data: { tradeInTotal },
        });
      }

      // Record how the invoice was covered so the statement shows it clearly:
      // the part paid from the customer's under-account money + any upfront cash.
      if (creditSplit.creditUsed > 0) {
        await tx.customerPayment.create({
          data: {
            customerId,
            companyId,
            amount: creditSplit.creditUsed,
            paymentDate: new Date(raw.orderDate),
            notes: creditUsedNote(order.id),
          },
        });
      }

      if (paymentMethod !== "CASH" && creditSplit.cashUpfront > 0) {
        await tx.customerPayment.create({
          data: {
            customerId,
            companyId,
            amount: creditSplit.cashUpfront,
            paymentDate: new Date(raw.orderDate),
            notes: `دفع مبدئي مع فاتورة بيع ${order.id}`,
          },
        });
      }

      // Recalculate payment status after all mutations
      await recalculatePaymentStatus(tx, order.id);

      const finalOrder = await tx.salesOrder.findUnique({
        where: { id: order.id },
        include: {
          customer: true,
          company: true,
          engineer: true,
          items: { include: { product: true, tradeInProduct: true } },
          installments: true,
        },
      });

      return finalOrder;
    });

    return NextResponse.json(salesOrder, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_STOCK")) {
      return NextResponse.json({ error: "الكمية المتاحة في المخزون لا تكفي لهذه الحركة", code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }
    const msg = error instanceof Error ? (error.message || error.name || String(error)) : "Failed to create sales order";
    return NextResponse.json({ error: msg, detail: error instanceof Error ? error.stack : undefined }, { status: traceError("[sales:POST] create failed", error) });
  }
}
