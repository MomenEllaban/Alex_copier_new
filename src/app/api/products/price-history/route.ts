import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export interface ProductPriceHistory {
  lastSalePrice: number | null;
  lastSaleTier: string | null;
  lastSaleAt: string | null;
  lastPurchasePrice: number | null;
  lastPurchaseAt: string | null;
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const productIds = Array.isArray(body?.productIds)
      ? (body.productIds as unknown[]).filter((id): id is string => typeof id === "string" && Boolean(id))
      : [];
    const companyId = typeof body?.companyId === "string" ? body.companyId : "";
    if (!companyId || productIds.length === 0) {
      return NextResponse.json({ error: "Missing companyId or productIds" }, { status: 400 });
    }

    const [productRows, saleItems, purchaseItems] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, pricingTiers: true },
      }),
      prisma.salesOrderItem.findMany({
        where: {
          productId: { in: productIds },
          salesOrder: { companyId, status: { notIn: ["DRAFT", "CANCELLED"] } },
        },
        orderBy: { createdAt: "desc" },
        select: {
          productId: true,
          unitPrice: true,
          salesOrder: { select: { orderDate: true } },
        },
        distinct: ["productId"],
      }),
      prisma.purchaseOrderItem.findMany({
        where: {
          productId: { in: productIds },
          purchaseOrder: { companyId, status: { notIn: ["DRAFT", "CANCELLED"] } },
        },
        orderBy: { createdAt: "desc" },
        select: {
          productId: true,
          unitPrice: true,
          purchaseOrder: { select: { orderDate: true } },
        },
        distinct: ["productId"],
      }),
    ]);

    const tiersByProduct = new Map(
      productRows.map((p) => [p.id, (p.pricingTiers ?? {}) as Record<string, number | null>])
    );

    const inferTier = (productId: string, price: number): string | null => {
      const tiers = tiersByProduct.get(productId) ?? {};
      for (const [key, value] of Object.entries(tiers)) {
        if (typeof value === "number" && Number.isFinite(value) && Math.abs(value - price) < 1e-6) {
          return key;
        }
      }
      return null;
    };

    const prices: Record<string, ProductPriceHistory> = {};
    for (const id of productIds) {
      const sale = saleItems.find((s) => s.productId === id);
      const purchase = purchaseItems.find((p) => p.productId === id);
      prices[id] = {
        lastSalePrice: sale?.unitPrice ?? null,
        lastSaleTier: sale ? inferTier(id, sale.unitPrice) : null,
        lastSaleAt: sale ? (sale.salesOrder.orderDate?.toISOString() ?? null) : null,
        lastPurchasePrice: purchase?.unitPrice ?? null,
        lastPurchaseAt: purchase ? (purchase.purchaseOrder.orderDate?.toISOString() ?? null) : null,
      };
    }

    return NextResponse.json({ prices });
  } catch (error) {
    console.error("Price history POST error:", error);
    return NextResponse.json({ error: "Failed to load price history" }, { status: 500 });
  }
}