import { withApiErrors } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import { findOrCreateMainWarehouse, receivePurchaseIntoStock, reversePurchaseFromStock, syncPurchaseStockAfterEdit } from "@/lib/stock-movement-helper";
import { normalizePurchaseItems } from "@/lib/purchase-items";
import { traceError } from "@/lib/prisma-errors";

const PAYMENT_METHOD_VALUES = new Set(["CASH", "CREDIT", "INSTALLMENT", "MIXED"]);

type PurchaseTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function normalizePurchasePayment(input: {
  paymentMethod?: unknown;
  paidAmount?: unknown;
  total: number;
  existingMethod?: string | null;
  existingPaid?: number | null;
}): { paymentMethod: "CASH" | "CREDIT" | "INSTALLMENT" | "MIXED"; paymentStatus: "PENDING" | "PARTIAL" | "PAID"; paidAmount: number } {
  const rawMethod = typeof input.paymentMethod === "string" ? input.paymentMethod.trim().toUpperCase() : (input.existingMethod || "CASH");
  const paymentMethod = (PAYMENT_METHOD_VALUES.has(rawMethod) ? rawMethod : "CASH") as "CASH" | "CREDIT" | "INSTALLMENT" | "MIXED";
  const total = Number.isFinite(input.total) && input.total >= 0 ? input.total : 0;
  const provided = input.paidAmount !== undefined && input.paidAmount !== null && input.paidAmount !== "";
  let paidAmountRaw = provided ? Number(input.paidAmount) : NaN;
  if (!Number.isFinite(paidAmountRaw)) {
    // CASH defaults to fully paid; CREDIT keeps existing paid amount when method unchanged, else 0.
    if (paymentMethod === "CASH") paidAmountRaw = total;
    else if (input.existingMethod === paymentMethod && input.existingPaid != null) paidAmountRaw = Number(input.existingPaid);
    else paidAmountRaw = 0;
  }
  paidAmountRaw = Math.max(0, Math.min(paidAmountRaw, total));

  // CASH always means fully settled unless explicitly overridden.
  const paidAmount = paymentMethod === "CASH" && !provided ? total : paidAmountRaw;
  let paymentStatus: "PENDING" | "PARTIAL" | "PAID" = "PENDING";
  if (paidAmount >= total && total > 0) paymentStatus = "PAID";
  else if (paidAmount > 0) paymentStatus = "PARTIAL";
  else paymentStatus = "PENDING";
  return { paymentMethod, paymentStatus, paidAmount };
}

async function syncPurchasePayment(tx: PurchaseTx, po: { id: string; supplierId: string; companyId: string; orderDate: Date | string | null; total: number; paymentMethod: string; paidAmount: number; status: string }) {
  const existing = await tx.supplierPayment.findUnique({ where: { purchaseOrderId: po.id } }).catch(() => null);
  const active = po.status !== "CANCELLED" && po.status !== "DRAFT";
  const amount = active ? Math.max(0, Math.min(Number(po.paidAmount) || 0, Number(po.total) || 0)) : 0;
  if (amount <= 0) {
    if (existing) await tx.supplierPayment.delete({ where: { id: existing.id } });
    return;
  }
  const data = {
    supplierId: po.supplierId,
    companyId: po.companyId || null,
    purchaseOrderId: po.id,
    amount,
    paymentDate: po.orderDate ? new Date(po.orderDate) : new Date(),
    paymentMethod: po.paymentMethod === "CASH" ? "كاش" : "دفعة مع فاتورة شراء",
    docNumber: `PO-${po.id.slice(0, 8)}`,
    notes:
      po.paymentMethod === "CASH"
        ? `سداد نقدي مع فاتورة شراء #${po.id.slice(0, 8)}`
        : `دفعة مع فاتورة شراء #${po.id.slice(0, 8)}`,
  };
  if (existing) await tx.supplierPayment.update({ where: { id: existing.id }, data });
  else await tx.supplierPayment.create({ data });
}

async function GET__raw(
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

async function PUT__raw(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("purchases", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, companyId: true, supplierId: true, status: true, total: true, orderDate: true, paymentMethod: true, paymentStatus: true, paidAmount: true, items: { select: { productId: true, quantity: true, unitPrice: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const { items, paymentMethod: rawPaymentMethod, paidAmount: rawPaidAmount, ...data } = body;
    const itemsProvided = Array.isArray(items);
    const normalizedItems = itemsProvided ? normalizePurchaseItems(items) : null;
    if (itemsProvided && (!normalizedItems || normalizedItems.length === 0)) {
      return NextResponse.json(
        { error: "بنود أمر الشراء غير صالحة — تأكد من المنتج والكمية والسعر", code: "INVALID_ITEMS" },
        { status: 400 }
      );
    }
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
    if (normalizedItems && normalizedItems.length > 0) {
      const ids = normalizedItems.map((item) => item.productId);
      const distinct = new Set(ids);
      if (distinct.size > 0) {
        const found = await prisma.product.count({ where: { id: { in: [...distinct] } } });
        if (found !== distinct.size) {
          return NextResponse.json({ error: "منتج غير موجود في سجل المنتجات", code: "PRODUCT_NOT_FOUND" }, { status: 400 });
        }
      }
    }

    const companyId = typeof data.companyId === "string" && data.companyId ? data.companyId : existing.companyId;
    if (nextStatus === "RECEIVED" && !companyId) {
      return NextResponse.json({ error: "الشركة مطلوبة عند استلام أمر الشراء", code: "COMPANY_REQUIRED_FOR_RECEIVE" }, { status: 400 });
    }

    const total = normalizedItems
      ? normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      : undefined;

    const paymentProvided = rawPaymentMethod !== undefined || rawPaidAmount !== undefined || total !== undefined;
    const payment = paymentProvided || !existing.paymentMethod
      ? normalizePurchasePayment({
          paymentMethod: rawPaymentMethod ?? existing.paymentMethod,
          paidAmount: rawPaidAmount,
          total: total ?? existing.total ?? 0,
          existingMethod: existing.paymentMethod,
          existingPaid: existing.paidAmount,
        })
      : null;

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
          ...(payment ? { paymentMethod: payment.paymentMethod, paymentStatus: payment.paymentStatus, paidAmount: payment.paidAmount } : {}),
          ...(normalizedItems
            ? {
                items: {
                  deleteMany: {},
                  create: normalizedItems.map((item) => ({
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
          company: true,
          items: { include: { product: true } },
          invoices: true,
        },
      });

      await syncPurchasePayment(tx, {
        id: updated.id,
        supplierId: updated.supplierId,
        companyId: updated.companyId,
        orderDate: updated.orderDate,
        total: updated.total,
        paymentMethod: updated.paymentMethod || "CREDIT",
        paidAmount: updated.paidAmount ?? 0,
        status: updated.status,
      });

      if (wasReceived && becomesReceived) {
        // The order is already in stock: apply only the difference between the
        // old and new lines (a price-only edit touches no inventory at all).
        const oldWarehouse = await findOrCreateMainWarehouse(tx, existing.companyId);
        const newWarehouse = companyId === existing.companyId ? oldWarehouse : await findOrCreateMainWarehouse(tx, companyId);
        await syncPurchaseStockAfterEdit(tx, {
          purchaseOrderId: id,
          oldWarehouseId: oldWarehouse.id,
          newWarehouseId: newWarehouse.id,
          oldItems: existing.items,
          newItems: normalizedItems ?? existing.items,
          refreshPrices: Boolean(normalizedItems),
        });
      }

      if (becomesReceived && !wasReceived) {
        const warehouse = await findOrCreateMainWarehouse(tx, companyId);
        await receivePurchaseIntoStock(tx, {
          purchaseOrderId: id,
          warehouseId: warehouse.id,
          items: normalizedItems ?? existing.items,
        });
      }

      if (wasReceived && !becomesReceived) {
        await reversePurchaseFromStock(tx, id);
      }

      return tx.purchaseOrder.findUnique({
        where: { id },
        include: { supplier: true, company: true, items: { include: { product: true } }, invoices: true },
      });
    });

    return NextResponse.json(po);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_STOCK")) {
      return NextResponse.json({ error: "الكمية المتاحة في المخزون لا تكفي لهذا التعديل — لا يُسمح برصيد سالب", code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update purchase order" }, { status: traceError("[purchases:PUT] update failed", error) });
  }
}

async function DELETE__raw(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("purchases", "delete");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;
    const existing = await prisma.purchaseOrder.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      if (existing.status === "RECEIVED") {
        await reversePurchaseFromStock(tx, id);
      }
      await tx.supplierPayment.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrder.delete({ where: { id } });
    });
    return NextResponse.json({ message: "Deleted" });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_STOCK")) {
      return NextResponse.json({ error: "الكمية المتاحة في المخزون لا تكفي لهذا التعديل — لا يُسمح برصيد سالب", code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export const GET = withApiErrors(GET__raw);
export const PUT = withApiErrors(PUT__raw);
export const DELETE = withApiErrors(DELETE__raw);
