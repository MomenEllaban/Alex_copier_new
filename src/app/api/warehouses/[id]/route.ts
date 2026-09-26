import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAction } from "@/lib/auth-helpers";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("inventory", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    const existing = await prisma.warehouse.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "المستودع غير موجود", code: "WAREHOUSE_NOT_FOUND" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if ("name" in body) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "اسم المستودع مطلوب", code: "NAME_REQUIRED" }, { status: 400 });
      }
      data.name = name;
    }
    if ("companyId" in body) {
      const companyId = typeof body.companyId === "string" ? body.companyId : "";
      const company = companyId ? await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } }) : null;
      if (!company) {
        return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 400 });
      }
      data.companyId = companyId;
    }
    if ("isMain" in body) data.isMain = body.isMain === true;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات للتحديث", code: "NO_CHANGES" }, { status: 400 });
    }

    const warehouse = await prisma.warehouse.update({
      where: { id },
      data,
      include: { company: true },
    });
    return NextResponse.json(warehouse);
  } catch (error) {
    console.error("[warehouses] PUT failed:", error);
    return NextResponse.json({ error: "Failed to update warehouse", code: "UPDATE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("inventory", "delete");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { id } = await params;
    const existing = await prisma.warehouse.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "المستودع غير موجود", code: "WAREHOUSE_NOT_FOUND" }, { status: 404 });
    }

    const [inventoryCount, movementCount] = await Promise.all([
      prisma.warehouseInventory.count({ where: { warehouseId: id } }),
      prisma.stockMovement.count({ where: { warehouseId: id } }),
    ]);
    if (inventoryCount > 0 || movementCount > 0) {
      return NextResponse.json(
        { error: "لا يمكن حذف مستودع به مخزون أو حركات سابقة", code: "WAREHOUSE_IN_USE" },
        { status: 409 },
      );
    }

    await prisma.warehouse.delete({ where: { id } });
    return NextResponse.json({ message: "Warehouse deleted" });
  } catch (error) {
    console.error("[warehouses] DELETE failed:", error);
    return NextResponse.json({ error: "Failed to delete warehouse", code: "DELETE_FAILED" }, { status: 500 });
  }
}
