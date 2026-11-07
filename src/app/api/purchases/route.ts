import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import { findOrCreateMainWarehouse, receivePurchaseIntoStock } from "@/lib/stock-movement-helper";
import { traceError } from "@/lib/prisma-errors";

export async function GET() {
  try {
    const user = await requirePageAccess("purchases");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const purchases = await prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        company: true,
        items: {
          include: { product: true },
        },
        invoices: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const salesOrders = await prisma.salesOrder.findMany({
      where: { id: { in: (await prisma.interCompanyInvoice.findMany({ select: { salesOrderId: true } })).filter(x => x.salesOrderId).map(x => x.salesOrderId!) } },
      select: {
        id: true,
        orderType: true,
        paymentMethod: true,
        paidAmount: true,
        taxRate: true,
        discount: true,
        discountType: true,
        notes: true,
        engineer: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        items: { include: { product: true } },
      },
    });

    const intercompany = await prisma.interCompanyInvoice.findMany({
      include: {
        fromCompany: true,
        toCompany: true,
      },
      orderBy: { createdAt: "desc" },
    }).then((rows) => rows.map((inv) => {
      const so = salesOrders.find((s) => s.id === inv.salesOrderId);
      return {
        ...inv,
        items: so?.items ?? [],
        customer: so?.customer ? { id: so.customer.id, name: so.customer.name } : null,
        engineer: so?.engineer ? { id: so.engineer.id, name: so.engineer.name } : null,
        orderType: so?.orderType,
        paymentMethod: so?.paymentMethod,
        paidAmount: so?.paidAmount,
        taxRate: so?.taxRate,
        discount: so?.discount,
        discountType: so?.discountType,
      };
    }));

    return NextResponse.json({ orders: purchases, intercompany });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch purchases" }, { status: 500 });
  }
}

const PAYMENT_METHOD_VALUES = new Set(["CASH", "CREDIT", "INSTALLMENT", "MIXED"]);

function normalizePurchasePayment(input: {
  paymentMethod?: unknown;
  paidAmount?: unknown;
  total: number;
}): { paymentMethod: "CASH" | "CREDIT" | "INSTALLMENT" | "MIXED"; paymentStatus: "PENDING" | "PARTIAL" | "PAID"; paidAmount: number } {
  const rawMethod = typeof input.paymentMethod === "string" ? input.paymentMethod.trim().toUpperCase() : "";
  const paymentMethod = (PAYMENT_METHOD_VALUES.has(rawMethod) ? rawMethod : "CASH") as "CASH" | "CREDIT" | "INSTALLMENT" | "MIXED";
  const total = Number.isFinite(input.total) && input.total >= 0 ? input.total : 0;
  const provided = input.paidAmount !== undefined && input.paidAmount !== null && input.paidAmount !== "";
  let paidAmountRaw = provided ? Number(input.paidAmount) : NaN;
  if (!Number.isFinite(paidAmountRaw)) paidAmountRaw = paymentMethod === "CASH" ? total : 0;
  paidAmountRaw = Math.max(0, Math.min(paidAmountRaw, total));

  // CASH defaults to fully paid unless an explicit paidAmount was provided.
  const paidAmount = paymentMethod === "CASH" && !provided ? total : paidAmountRaw;
  let paymentStatus: "PENDING" | "PARTIAL" | "PAID" = "PENDING";
  if (paidAmount >= total && total > 0) paymentStatus = "PAID";
  else if (paidAmount > 0) paymentStatus = "PARTIAL";
  else paymentStatus = "PENDING";

  return { paymentMethod, paymentStatus, paidAmount };
}

export async function POST(request: Request) {
  try {

    const actor = await requireAction("purchases", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
        const body = await request.json();
    const { items, paymentMethod: rawPaymentMethod, paidAmount: rawPaidAmount, ...data } = body;

    const total = items?.reduce(
      (sum: number, item: { quantity: number; unitPrice: number }) =>
        sum + item.quantity * item.unitPrice,
      0
    ) ?? 0;

    const companyId = typeof data.companyId === "string" ? data.companyId : "";
    const supplierId = typeof data.supplierId === "string" ? data.supplierId : "";
    const [company, supplier] = await Promise.all([
      companyId ? prisma.company.findUnique({ where: { id: companyId }, select: { id: true } }) : null,
      supplierId ? prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } }) : null,
    ]);
    if (companyId && !company) {
      return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 400 });
    }
    if (!companyId && data.status === "RECEIVED") {
      return NextResponse.json({ error: "الشركة مطلوبة عند استلام أمر الشراء", code: "COMPANY_REQUIRED_FOR_RECEIVE" }, { status: 400 });
    }
    if (supplierId && !supplier) {
      return NextResponse.json({ error: "المورد غير موجود", code: "SUPPLIER_NOT_FOUND" }, { status: 400 });
    }
    if (Array.isArray(items) && items.length > 0) {
      const ids = items.map((item: { productId: string }) => item.productId).filter(Boolean);
      const distinct = new Set(ids);
      if (distinct.size > 0) {
        const found = await prisma.product.count({ where: { id: { in: ids } } });
        if (found !== distinct.size) {
          return NextResponse.json({ error: "منتج غير موجود في سجل المنتجات", code: "PRODUCT_NOT_FOUND" }, { status: 400 });
        }
      }
    }

    const payment = normalizePurchasePayment({ paymentMethod: rawPaymentMethod, paidAmount: rawPaidAmount, total });

    const purchaseOrder = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          companyId: data.companyId,
          supplierId: data.supplierId,
          status: data.status,
          orderDate: data.orderDate,
          notes: data.notes ?? null,
          total,
          paymentMethod: payment.paymentMethod,
          paymentStatus: payment.paymentStatus,
          paidAmount: payment.paidAmount,
          ...(items && {
            items: {
              create: items.map((item: { productId: string; quantity: number; unitPrice: number }) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
              })),
            },
          }),
        },
        include: {
          supplier: true,
          company: true,
          items: {
            include: { product: true },
          },
          invoices: true,
        },
      });

      // دفعة مرتبطة بالفاتورة (نقدًا أو دفعة مقدمة) — تظهر في تقارير الموردين وتسوية الأرصدة.
      if (created.paidAmount > 0) {
        await tx.supplierPayment.create({
          data: {
            supplierId: created.supplierId,
            companyId: created.companyId || null,
            purchaseOrderId: created.id,
            amount: created.paidAmount,
            paymentDate: created.orderDate ? new Date(created.orderDate) : new Date(),
            paymentMethod: created.paymentMethod === "CASH" ? "كاش" : "دفعة مع فاتورة شراء",
            docNumber: `PO-${created.id.slice(0, 8)}`,
            notes:
              created.paymentMethod === "CASH"
                ? `سداد نقدي مع فاتورة شراء #${created.id.slice(0, 8)}`
                : `دفعة مقدمة مع فاتورة شراء #${created.id.slice(0, 8)}`,
          },
        });
      }

      // استلام فوري عند الإنشاء: أدخل البضاعة للمخزون مرتبطة بأمر الشراء الحقيقي.
      if (created.status === "RECEIVED") {
        const warehouse = await findOrCreateMainWarehouse(tx, created.companyId);
        await receivePurchaseIntoStock(tx, {
          purchaseOrderId: created.id,
          warehouseId: warehouse.id,
          items: (created.items as unknown as { productId: string; quantity: number; unitPrice: number }[]).map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          })),
        });
      }

      return tx.purchaseOrder.findUnique({
        where: { id: created.id },
        include: { supplier: true, company: true, items: { include: { product: true } }, invoices: true },
      });
    });

    return NextResponse.json(purchaseOrder, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: traceError("[purchases:POST] create failed", error) });
  }
}
