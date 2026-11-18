import { withApiErrors } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

/** Dropdown data for the simplified return form, scoped to the chosen company. */
async function GET__raw(request: Request) {
  try {
    const user = await requirePageAccess("returns");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const companyId = new URL(request.url).searchParams.get("companyId")?.trim() || "";
    if (!companyId) {
      return NextResponse.json({ error: "اختيار الشركة مطلوب", code: "COMPANY_REQUIRED" }, { status: 400 });
    }

    const [customers, suppliers, products] = await Promise.all([
      prisma.customer.findMany({
        where: {
          isActive: true,
          OR: [
            { ledgers: { some: { companyId } } },
            { orders: { some: { companyId } } },
          ],
        },
        select: { id: true, name: true, companyName: true, phone: true },
        orderBy: { name: "asc" },
      }),
      prisma.supplier.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, phone: true },
        orderBy: { name: "asc" },
      }),
      prisma.product.findMany({
        where: { companyId, isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          purchasePrice: true,
          wholesalePrice: true,
          retailPrice: true,
          inventoryItems: { where: { warehouse: { companyId } }, select: { quantity: true } },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      customers,
      suppliers,
      products: products.map((p) => ({
        ...p,
        stock: p.inventoryItems.reduce((sum, row) => sum + row.quantity, 0),
      })),
    });
  } catch (error) {
    console.error("[returns:options] failed", error);
    return NextResponse.json({ error: "Failed to load return options" }, { status: 500 });
  }
}

export const GET = withApiErrors(GET__raw);
