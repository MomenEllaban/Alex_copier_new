import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAnyPage } from "@/lib/auth-helpers";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAnyPage("warehouses", "inventory");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const { id } = await params;
    const warehouse = await prisma.warehouse.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!warehouse) return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });

    const [inventory, movements, totalMovements] = await Promise.all([
      prisma.warehouseInventory.findMany({
        where: { warehouseId: id },
        include: { product: { select: { id: true, name: true, sku: true, productType: true } } },
        orderBy: { product: { name: "asc" } },
      }),
      prisma.stockMovement.findMany({
        where: { warehouseId: id },
        include: { product: { select: { id: true, name: true, sku: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.stockMovement.count({ where: { warehouseId: id } }),
    ]);

    return NextResponse.json({ warehouse, inventory, movements, totalMovements });
  } catch (e) {
    console.error("Failed to fetch warehouse inventory:", e);
    return NextResponse.json({ error: "Failed to fetch warehouse inventory" }, { status: 500 });
  }
}
