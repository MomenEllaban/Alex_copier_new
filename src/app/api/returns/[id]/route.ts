import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { recalculatePaymentStatus } from "@/lib/payment-status";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await requirePageAccess("returns");
    if (!actor) {
      return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }

    const { id } = await params;
    const ret = await prisma.returnTransaction.findUnique({
      where: { id },
      include: {
        company: true,
        customer: true,
        supplier: true,
        product: true,
        warehouse: true,
        salesOrder: { select: { id: true } },
        salesOrderItem: { select: { id: true, unitPrice: true, quantity: true, discount: true } },
        purchaseOrder: { select: { id: true } },
        purchaseOrderItem: { select: { id: true, unitPrice: true, quantity: true } },
      },
    });

    if (!ret) {
      return NextResponse.json({ error: "Return not found" }, { status: 404 });
    }

    return NextResponse.json(ret);
  } catch {
    return NextResponse.json({ error: "Failed to fetch return" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("returns");
    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, reason } = body;

    const existing = await prisma.returnTransaction.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Return not found" }, { status: 404 });
    }

    if (status && status !== existing.status) {
      if (!["PENDING", "APPROVED", "REJECTED", "COMPLETED"].includes(status)) {
        return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 });
      }

      if (status === "REJECTED" && existing.status === "APPROVED") {
        await prisma.$transaction(async (tx) => {
          if (existing.warehouseId) {
            // Sale returns added stock on approval -> removing them takes it back out.
            // Purchase returns removed stock on approval -> rejecting restores it.
            const delta = existing.type === "PURCHASE_RETURN" ? existing.quantity : -existing.quantity;
            if (delta < 0) {
              const inv = await tx.warehouseInventory.findUnique({
                where: { warehouseId_productId: { warehouseId: existing.warehouseId, productId: existing.productId } },
              });
              const available = inv?.quantity ?? 0;
              if (!inv || available < existing.quantity) {
                throw new Error("INSUFFICIENT_STOCK");
              }
              await tx.warehouseInventory.update({
                where: { warehouseId_productId: { warehouseId: existing.warehouseId, productId: existing.productId } },
                data: { quantity: available - existing.quantity },
              });
            } else {
              await tx.warehouseInventory.upsert({
                where: { warehouseId_productId: { warehouseId: existing.warehouseId, productId: existing.productId } },
                update: { quantity: { increment: delta } },
                create: { warehouseId: existing.warehouseId, productId: existing.productId, quantity: delta },
              });
            }

            await tx.stockMovement.create({
              data: {
                warehouseId: existing.warehouseId,
                productId: existing.productId,
                quantity: Math.abs(delta),
                movementType: "ADJUSTMENT",
                referenceId: id,
                notes: `إلغاء مرتجع — ${id}`,
              },
            });
          }

          if (existing.customerId && existing.companyId) {
            await tx.customerLedger.upsert({
              where: { customerId_companyId: { customerId: existing.customerId, companyId: existing.companyId } },
              update: { balance: { increment: existing.total } },
              create: { customerId: existing.customerId, companyId: existing.companyId, balance: existing.total },
            });
          }

          // Reverse the auto ADDITION settlement created for a purchase return and
          // restore the purchase order total.
          if (existing.type === "PURCHASE_RETURN" && existing.purchaseOrderId && existing.companyId) {
            const purchasedNote = `مرتجع مشتريات — ${existing.purchaseOrderId}`;
            await tx.settlement.deleteMany({
              where: {
                companyId: existing.companyId,
                direction: "ADDITION",
                reason: { contains: purchasedNote },
              },
            });
            const po = await tx.purchaseOrder.findUnique({
              where: { id: existing.purchaseOrderId },
              select: { total: true },
            });
            const restored = Number(((po?.total || 0) + existing.total).toFixed(2));
            await tx.purchaseOrder.update({
              where: { id: existing.purchaseOrderId },
              data: { total: restored },
            });
          }
        });
      }

      if (status === "APPROVED" && existing.status === "PENDING") {
        const warehouse = existing.warehouseId
          ? { id: existing.warehouseId }
          : await prisma.warehouse.findFirst({ where: { companyId: existing.companyId, isMain: true }, select: { id: true } });

        if (warehouse && existing.type === "SALE_RETURN") {
          await prisma.$transaction(async (tx) => {
            await tx.warehouseInventory.upsert({
              where: { warehouseId_productId: { warehouseId: warehouse.id, productId: existing.productId } },
              update: { quantity: { increment: existing.quantity } },
              create: { warehouseId: warehouse.id, productId: existing.productId, quantity: existing.quantity },
            });

            await tx.stockMovement.create({
              data: {
                warehouseId: warehouse.id,
                productId: existing.productId,
                quantity: existing.quantity,
                movementType: "SALE_RETURN_IN",
                referenceId: id,
                notes: `مرتجع مبيعات — ${id}`,
              },
            });

            if (existing.customerId) {
              await tx.customerLedger.upsert({
                where: { customerId_companyId: { customerId: existing.customerId, companyId: existing.companyId } },
                update: { balance: { decrement: existing.total } },
                create: { customerId: existing.customerId, companyId: existing.companyId, balance: -existing.total },
              });
            }
          });
        }

        if (warehouse && existing.type === "PURCHASE_RETURN") {
          await prisma.$transaction(async (tx) => {
            const inv = await tx.warehouseInventory.findUnique({
              where: { warehouseId_productId: { warehouseId: warehouse.id, productId: existing.productId } },
            });
            const available = inv?.quantity ?? 0;
            if (!inv || available < existing.quantity) {
              throw new Error("INSUFFICIENT_STOCK");
            }
            await tx.warehouseInventory.update({
              where: { warehouseId_productId: { warehouseId: warehouse.id, productId: existing.productId } },
              data: { quantity: available - existing.quantity },
            });

            await tx.stockMovement.create({
              data: {
                warehouseId: warehouse.id,
                productId: existing.productId,
                quantity: existing.quantity,
                movementType: "PURCHASE_RETURN_OUT",
                referenceId: id,
                notes: `مرتجع مشتريات — ${id}`,
              },
            });

            await tx.settlement.create({
              data: {
                companyId: existing.companyId,
                amount: existing.total,
                paymentMethod: "CASH",
                reason: `مرتجع مشتريات — ${id}`,
                direction: "ADDITION",
                status: "VERIFIED",
                collectedBy: actor.id,
                settlementNumber: `STL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              },
            });

            if (existing.purchaseOrderId) {
              const po = await tx.purchaseOrder.findUnique({
                where: { id: existing.purchaseOrderId },
                select: { total: true },
              });
              const reduced = Math.max(0, Number(((po?.total || 0) - existing.total).toFixed(2)));
              await tx.purchaseOrder.update({
                where: { id: existing.purchaseOrderId },
                data: { total: reduced },
              });
            }
          });
        }
      }
    }

    const updated = await prisma.returnTransaction.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(reason !== undefined && { reason }),
      },
      include: {
        company: true,
        customer: true,
        product: true,
        warehouse: true,
        salesOrder: { select: { id: true } },
        salesOrderItem: { select: { id: true, unitPrice: true, quantity: true } },
      },
    });

    // Recalculate payment status for the parent order if status changed
    if (status && existing.salesOrderId) {
      await recalculatePaymentStatus(prisma, existing.salesOrderId);
    }

    return NextResponse.json(updated);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json({ error: "الكمية المتاحة لا تكفي لهذه العملية — لا يُسمح برصيد سالب", code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Return not found" }, { status: 404 });
    }
    console.error("Failed to update return:", error);
    return NextResponse.json({ error: "Failed to update return" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("returns");
    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.returnTransaction.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Return not found" }, { status: 404 });
    }

    if (existing.status === "APPROVED" || existing.status === "COMPLETED") {
      await prisma.$transaction(async (tx) => {
        if (existing.warehouseId) {
          // Sale returns added stock -> removing takes it out; purchase returns removed
          // stock -> deleting restores it.
          const delta = existing.type === "PURCHASE_RETURN" ? existing.quantity : -existing.quantity;
          if (delta < 0) {
            const inv = await tx.warehouseInventory.findUnique({
              where: { warehouseId_productId: { warehouseId: existing.warehouseId, productId: existing.productId } },
            });
            const available = inv?.quantity ?? 0;
            if (!inv || available < existing.quantity) {
              throw new Error("INSUFFICIENT_STOCK");
            }
            await tx.warehouseInventory.update({
              where: { warehouseId_productId: { warehouseId: existing.warehouseId, productId: existing.productId } },
              data: { quantity: available - existing.quantity },
            });
          } else {
            await tx.warehouseInventory.upsert({
              where: { warehouseId_productId: { warehouseId: existing.warehouseId, productId: existing.productId } },
              update: { quantity: { increment: delta } },
              create: { warehouseId: existing.warehouseId, productId: existing.productId, quantity: delta },
            });
          }

          await tx.stockMovement.create({
            data: {
              warehouseId: existing.warehouseId,
              productId: existing.productId,
              quantity: Math.abs(delta),
              movementType: "ADJUSTMENT",
              referenceId: id,
              notes: `حذف مرتجع — ${id}`,
            },
          });
        }

        if (existing.customerId && existing.companyId) {
          await tx.customerLedger.upsert({
            where: { customerId_companyId: { customerId: existing.customerId, companyId: existing.companyId } },
            update: { balance: { increment: existing.total } },
            create: { customerId: existing.customerId, companyId: existing.companyId, balance: existing.total },
          });
        }

        if (existing.type === "PURCHASE_RETURN" && existing.purchaseOrderId && existing.companyId) {
          const purchasedNote = `مرتجع مشتريات — ${existing.purchaseOrderId}`;
          await tx.settlement.deleteMany({
            where: {
              companyId: existing.companyId,
              direction: "ADDITION",
              reason: { contains: purchasedNote },
            },
          });
          const po = await tx.purchaseOrder.findUnique({
            where: { id: existing.purchaseOrderId },
            select: { total: true },
          });
          const restored = Number(((po?.total || 0) + existing.total).toFixed(2));
          await tx.purchaseOrder.update({
            where: { id: existing.purchaseOrderId },
            data: { total: restored },
          });
        }
      });
    }

    await prisma.returnTransaction.delete({ where: { id } });

    // Recalculate payment status for the parent order
    if (existing.salesOrderId) {
      await recalculatePaymentStatus(prisma, existing.salesOrderId);
    }

    return NextResponse.json({ message: "Return deleted" });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json({ error: "الكمية المتاحة لا تكفي لهذه العملية — لا يُسمح برصيد سالب", code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Return not found" }, { status: 404 });
    }
    console.error("Failed to delete return:", error);
    return NextResponse.json({ error: "Failed to delete return" }, { status: 500 });
  }
}
