import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { findOrCreateMainWarehouse, receivePurchaseIntoStock } from "@/lib/stock-movement-helper";
import { traceError } from "@/lib/prisma-errors";

export async function GET() {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

export async function POST(request: Request) {
  try {

    const actor = await requirePageAccess("purchases");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
        const body = await request.json();
    const { items, ...data } = body;

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

    const purchaseOrder = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          ...data,
          total,
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
          items: {
            include: { product: true },
          },
          invoices: true,
        },
      });

      // استلام فوري عند الإنشاء: أدخل البضاعة للمخزون مرتبطة بأمر الشراء الحقيقي.
      if (created.status === "RECEIVED") {
        const warehouse = await findOrCreateMainWarehouse(tx, created.companyId);
        await receivePurchaseIntoStock(tx, {
          purchaseOrderId: created.id,
          warehouseId: warehouse.id,
          items: (created.items as unknown as { productId: string; quantity: number }[]).map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
          })),
        });
      }

      return created;
    });

    return NextResponse.json(purchaseOrder, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: traceError("[purchases:POST] create failed", error) });
  }
}
