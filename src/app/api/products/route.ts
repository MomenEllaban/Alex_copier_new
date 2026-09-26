import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";

const PRODUCT_TYPES = ["MACHINE", "SPARE_PART"];
const PRICE_FIELDS = ["purchasePrice"] as const;
const PRICE_TIER_KEYS = ["legacyCustomer", "newCustomer", "jumlaMachines", "jumlaParts", "sectori", "engineer"] as const;

function extractPrices(body: Record<string, unknown>): { values: Record<string, number | null> } | { error: NextResponse } {
  const values: Record<string, number | null> = {};
  for (const field of PRICE_FIELDS) {
    if (!(field in body)) continue;
    const raw = body[field];
    if (raw === null || raw === "") {
      values[field] = null;
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      return {
        error: NextResponse.json(
          { error: "الأسعار يجب أن تكون أرقامًا موجبة", code: "INVALID_PRICE" },
          { status: 400 },
        ),
      };
    }
    values[field] = value;
  }
  return { values };
}

function extractPricingTiers(body: Record<string, unknown>): Record<string, number | null> | null {
  const raw = body.pricingTiers;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("INVALID_PRICING_TIERS");
  }
  const tiers: Record<string, number | null> = {};
  for (const key of PRICE_TIER_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === "") {
      tiers[key] = null;
      continue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error("INVALID_PRICING_TIERS");
    }
    tiers[key] = numeric;
  }
  return tiers;
}

export async function GET(request: Request) {
  try {
    const user = await requirePageAccess("products");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const includeInactive = new URL(request.url).searchParams.get("all") === "true";
    const tradeInOnly = new URL(request.url).searchParams.get("tradeIn") === "true";
    const products = await prisma.product.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(tradeInOnly ? { isTradeIn: true } : {}),
      },
      include: { company: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(products);
  } catch (error) {
    console.error("[products] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch products", code: "FETCH_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAction("inventory", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "اسم المنتج مطلوب", code: "NAME_REQUIRED" }, { status: 400 });
    }

    const productType = typeof body.productType === "string" ? body.productType : "";
    if (!PRODUCT_TYPES.includes(productType)) {
      return NextResponse.json(
        { error: "نوع المنتج غير صالح", code: "INVALID_PRODUCT_TYPE" },
        { status: 400 },
      );
    }

    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      return NextResponse.json({ error: "الشركة مطلوبة", code: "COMPANY_REQUIRED" }, { status: 400 });
    }
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) {
      return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 400 });
    }

    const prices = extractPrices(body);
    if ("error" in prices) return prices.error;

    let pricingTiers: Record<string, number | null> | null = null;
    try {
      pricingTiers = extractPricingTiers(body);
    } catch {
      return NextResponse.json({ error: "قيم أسعار الشرائح غير صالحة", code: "INVALID_PRICING_TIERS" }, { status: 400 });
    }

    const optionalText = (value: unknown): string | null =>
      typeof value === "string" && value.trim() !== "" ? value.trim() : null;

    const quantityValue = (() => {
      const value = body.quantity ?? body.initialQuantity ?? body.stockQuantity;
      if (value === undefined || value === null || value === "") return null;
      const numeric = Number(value);
      if (!Number.isInteger(numeric) || numeric < 0) {
        throw new Error("INVALID_QUANTITY");
      }
      return numeric;
    })();

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name,
          description: optionalText(body.description),
          productType,
          companyId,
          sku: optionalText(body.sku),
          gs1Code: optionalText(body.gs1Code),
          egsCode: optionalText(body.egsCode),
          isActive: body.isActive !== false,
          pricingTiers: pricingTiers && Object.values(pricingTiers).some((value) => value !== null && value !== undefined) ? pricingTiers : undefined,
          ...prices.values,
        },
        include: { company: true },
      });

      if (quantityValue !== null) {
        const warehouse = await tx.warehouse.findFirst({
          where: { companyId, isMain: true },
          orderBy: { createdAt: "asc" },
        });
        const targetWarehouse =
          warehouse ??
          (await tx.warehouse.create({
            data: {
              companyId,
              name: "المستودع الرئيسي",
              isMain: true,
            },
          }));

        await tx.warehouseInventory.upsert({
          where: { warehouseId_productId: { warehouseId: targetWarehouse.id, productId: created.id } },
          update: { quantity: quantityValue },
          create: { warehouseId: targetWarehouse.id, productId: created.id, quantity: quantityValue },
        });

        await tx.stockMovement.create({
          data: {
            warehouseId: targetWarehouse.id,
            productId: created.id,
            quantity: quantityValue,
            movementType: "PURCHASE_IN",
            notes: "إدخال أولي من صفحة المنتجات",
          },
        });
      }

      return created;
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_QUANTITY") {
      return NextResponse.json({ error: "الكمية يجب أن تكون عددًا صحيحًا غير سالب", code: "INVALID_QUANTITY" }, { status: 400 });
    }
    console.error("[products] POST failed:", error);
    return NextResponse.json({ error: "Failed to create product", code: "CREATE_FAILED" }, { status: 500 });
  }
}
