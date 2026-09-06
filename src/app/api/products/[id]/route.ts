import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("inventory");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "المنتج غير موجود", code: "PRODUCT_NOT_FOUND" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if ("name" in body) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "اسم المنتج مطلوب", code: "NAME_REQUIRED" }, { status: 400 });
      }
      data.name = name;
    }
    if ("productType" in body) {
      if (!PRODUCT_TYPES.includes(body.productType)) {
        return NextResponse.json(
          { error: "نوع المنتج غير صالح", code: "INVALID_PRODUCT_TYPE" },
          { status: 400 },
        );
      }
      data.productType = body.productType;
    }
    if ("companyId" in body) {
      const companyId = typeof body.companyId === "string" ? body.companyId : "";
      const company = companyId ? await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } }) : null;
      if (!company) {
        return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 400 });
      }
      data.companyId = companyId;
    }
    for (const field of ["description", "sku", "gs1Code", "egsCode"] as const) {
      if (field in body) {
        const value = body[field];
        data[field] = typeof value === "string" && value.trim() !== "" ? value.trim() : null;
      }
    }
    if ("isActive" in body) data.isActive = body.isActive === true;

    const prices = extractPrices(body);
    if ("error" in prices) return prices.error;
    Object.assign(data, prices.values);

    if ("pricingTiers" in body) {
      try {
        const tiers = extractPricingTiers(body);
        data.pricingTiers = tiers && Object.values(tiers).some((value) => value !== null && value !== undefined) ? tiers : undefined;
      } catch {
        return NextResponse.json({ error: "قيم أسعار الشرائح غير صالحة", code: "INVALID_PRICING_TIERS" }, { status: 400 });
      }
    }

    const quantityValue = (() => {
      if (!("quantity" in body) && !("initialQuantity" in body) && !("stockQuantity" in body)) return null;
      const value = body.quantity ?? body.initialQuantity ?? body.stockQuantity;
      if (value === undefined || value === null || value === "") return null;
      const numeric = Number(value);
      if (!Number.isInteger(numeric) || numeric < 0) {
        throw new Error("INVALID_QUANTITY");
      }
      return numeric;
    })();

    if (Object.keys(data).length === 0 && quantityValue === null) {
      return NextResponse.json({ error: "لا توجد بيانات للتحديث", code: "NO_CHANGES" }, { status: 400 });
    }

    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data,
        include: { company: true },
      });

      if (quantityValue !== null) {
        const warehouse = await tx.warehouse.findFirst({
          where: { companyId: updated.companyId, isMain: true },
          orderBy: { createdAt: "asc" },
        });
        const targetWarehouse =
          warehouse ??
          (await tx.warehouse.create({
            data: {
              companyId: updated.companyId,
              name: "المستودع الرئيسي",
              isMain: true,
            },
          }));

        await tx.warehouseInventory.upsert({
          where: { warehouseId_productId: { warehouseId: targetWarehouse.id, productId: updated.id } },
          update: { quantity: quantityValue },
          create: { warehouseId: targetWarehouse.id, productId: updated.id, quantity: quantityValue },
        });

        await tx.stockMovement.create({
          data: {
            warehouseId: targetWarehouse.id,
            productId: updated.id,
            quantity: quantityValue,
            movementType: "ADJUSTMENT",
            notes: "تحديث الكمية من صفحة المنتجات",
          },
        });
      }

      return updated;
    });

    return NextResponse.json(product);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_QUANTITY") {
      return NextResponse.json({ error: "الكمية يجب أن تكون عددًا صحيحًا غير سالب", code: "INVALID_QUANTITY" }, { status: 400 });
    }
    console.error("[products] PUT failed:", error);
    return NextResponse.json({ error: "Failed to update product", code: "UPDATE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("inventory");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { id } = await params;
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "المنتج غير موجود", code: "PRODUCT_NOT_FOUND" }, { status: 404 });
    }

    const [inventoryCount, movementCount, orderItemCount, machineCount, compatibilityCount, custodyCount] =
      await Promise.all([
        prisma.warehouseInventory.count({ where: { productId: id } }),
        prisma.stockMovement.count({ where: { productId: id } }),
        prisma.salesOrderItem.count({ where: { productId: id } }),
        prisma.machine.count({ where: { productId: id } }),
        prisma.sparePartCompatibility.count({
          where: { OR: [{ sparePartId: id }, { machineModelId: id }] },
        }),
        prisma.sparePartCustody.count({ where: { productId: id } }),
      ]);

    const referenced =
      inventoryCount + movementCount + orderItemCount + machineCount + compatibilityCount + custodyCount > 0;

    if (referenced) {
      // Soft-disable instead: history must stay intact for reports.
      await prisma.product.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json(
        { message: "Product archived (in use)", archived: true },
        { status: 200 },
      );
    }

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ message: "Product deleted", archived: false });
  } catch (error) {
    console.error("[products] DELETE failed:", error);
    return NextResponse.json({ error: "Failed to delete product", code: "DELETE_FAILED" }, { status: 500 });
  }
}
