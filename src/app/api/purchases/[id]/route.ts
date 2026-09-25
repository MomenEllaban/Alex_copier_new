import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { findOrCreateMainWarehouse, receivePurchaseIntoStock, reversePurchaseFromStock } from "@/lib/stock-movement-helper";
import { traceError } from "@/lib/prisma-errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePageAccess("purchases");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const { id } = await params;
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { supplier: true, company: true, items: { include: { product: true } } },
    });
    if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(po);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("purchases");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true, items: { select: { productId: true, quantity: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const { items, ...data } = body;
    const itemsProvided = Array.isArray(items);
    const nextStatus =
      typeof data.status === "string" && data.status
        ? (data.status as "DRAFT" | "CONFIRMED" | "RECEIVED" | "CANCELLED")
        : existing.status;

    if (data.companyId !== undefined) {
      const company = await prisma.company.findUnique({ where: { id: data.companyId }, select: { id: true } });
      if (!company) {
        return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 400 });
      }
    }
    if (data.supplierId !== undefined) {
      const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId }, select: { id: true } });
      if (!supplier) {
        return NextResponse.json({ error: "المورد غير موجود", code: "SUPPLIER_NOT_FOUND" }, { status: 400 });
      }
    }
    if (itemsProvided && items.length > 0) {
      const ids = items.map((item: { productId: string }) => item.productId).filter(Boolean);
      const distinct = new Set(ids);
      if (distinct.size > 0) {
        const found = await prisma.product.count({ where: { id: { in: ids } } });
        if (found !== distinct.size) {
          return NextResponse.json({ error: "منتج غير موجود في سجل المنتجات", code: "PRODUCT_NOT_FOUND" }, { status: 400 });
        }
      }
    }

    const companyId = typeof data.companyId === "string" && data.companyId ? data.companyId : existing.companyId;
    if (nextStatus === "RECEIVED" && !companyId) {
      return NextResponse.json({ error: "الشركة مطلوبة عند استلام أمر الشراء", code: "COMPANY_REQUIRED_FOR_RECEIVE" }, { status: 400 });
    }

    // بمجرد الاستلام (أو أثناء تحويله للاستلام) تكون البنود مثبّتة — يُمنع تعديلها.
    if ((nextStatus === "RECEIVED" || existing.status === "RECEIVED") && itemsProvided) {
      return NextResponse.json(
        { error: "لا يمكن تعديل بنود أمر شراء تم استلامه — احذف الأمر أو عكس الاستلام أولاً", code: "ITEMS_LOCKED_AFTER_RECEIVE" },
        { status: 400 }
      );
    }

    const total = itemsProvided
      ? items.reduce(
          (sum: number, item: { quantity: number; unitPrice: number }) =>
            sum + item.quantity * item.unitPrice,
          0
        ) ?? 0
      : undefined;

    const wasReceived = existing.status === "RECEIVED";
    const becomesReceived = nextStatus === "RECEIVED";

    const po = await prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(data.companyId !== undefined ? { companyId: data.companyId } : {}),
          ...(data.supplierId !== undefined ? { supplierId: data.supplierId } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.orderDate !== undefined ? { orderDate: data.orderDate } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(total !== undefined ? { total } : {}),
          ...(itemsProvided
            ? {
                items: {
                  deleteMany: {},
                  create: items.map((item: { productId: string; quantity: number; unitPrice: number }) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                  })),
                },
              }
            : undefined),
        },
        include: {
          supplier: true,
          items: { include: { product: true } },
          invoices: true,
        },
      });

      if (becomesReceived && !wasReceived) {
        const warehouse = await findOrCreateMainWarehouse(tx, companyId);
        const withItems = await tx.purchaseOrder.findUnique({
          where: { id },
          select: { items: { select: { productId: true, quantity: true } } },
        });
        await receivePurchaseIntoStock(tx, {
          purchaseOrderId: id,
          warehouseId: warehouse.id,
          items: withItems?.items ?? [],
        });
      }

      if (wasReceived && !becomesReceived) {
        await reversePurchaseFromStock(tx, id);
      }

      return updated;
    });

    return NextResponse.json(po);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_STOCK")) {
      return NextResponse.json({ error: "الكمية المتاحة في المخزون لا تكفي للعكس — لا يُسمح برصيد سالب", code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update purchase order" }, { status: traceError("[purchases:PUT] update failed", error) });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {  try {
    const actor = await requirePageAccess("purchases");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;
    const existing = await prisma.purchaseOrder.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.purchaseOrder.delete({ where: { id } });
    return NextResponse.json({ message: "Deleted" });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
