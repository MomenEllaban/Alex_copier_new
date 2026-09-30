import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAction, requireAuth } from "@/lib/auth-helpers";
import { parseCsvRecords, validateRecords, type ImportError } from "@/lib/import-schemas";

/**
 * Bulk-creates products for a single company from a CSV export of the products
 * page. The company comes from the `companyName` column so that one file can
 * carry a whole catalogue and still land each row against the right owner.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAction("products", "import");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const body = await request.json();
    if (typeof body?.csv !== "string" || body.csv.trim() === "") {
      return NextResponse.json({ error: "Missing csv content" }, { status: 400 });
    }

    const parsed = parseCsvRecords(body.csv, "products");
    if (parsed.errors.length > 0) {
      return NextResponse.json({ created: 0, errors: parsed.errors });
    }

    const companies = await prisma.company.findMany({ select: { id: true, name: true, nameAr: true } });
    const companyByName = new Map<string, string>();
    for (const c of companies) {
      companyByName.set(c.name.trim().toLowerCase(), c.id);
      if (c.nameAr) companyByName.set(c.nameAr.trim().toLowerCase(), c.id);
    }

    const records = parsed.records.map((record) => {
      const key = (record.companyName || "").trim().toLowerCase();
      return { record, companyId: companyByName.get(key) };
    });

    const resolveErrors: ImportError[] = [];
    for (const { record, companyId } of records) {
      if (!companyId) {
        resolveErrors.push({
          row: Number(record.__row ?? 0),
          field: "companyName",
          message: `الشركة التابعة غير موجودة (${record.companyName}) — يجب أن تطابق اسم شركة قائمة في النظام`,
        });
      }
    }
    if (resolveErrors.length > 0) {
      return NextResponse.json({ created: 0, errors: resolveErrors });
    }

    const normalized = records.map(({ record, companyId }) => ({ ...record, companyId: companyId as string }));

    // The duplicate key is scoped per company, so the existing names have to be
    // gathered the same way or every row would look like a duplicate.
    const existing = await prisma.product.findMany({ select: { name: true, companyId: true } });
    const existingKeys = new Set(existing.map((p) => `${p.companyId}|${p.name.trim().toLowerCase()}`));

    const { valid, errors } = validateRecords("products", normalized, {
      existingKeys,
      passthroughKeys: ["companyId"],
    });
    if (errors.length > 0 || valid.length === 0) {
      return NextResponse.json({ created: 0, errors });
    }

    // Each company needs a main warehouse before a product can be stocked, so
    // create any that are missing rather than failing the whole import.
    const companyIds = [...new Set(valid.map((r) => r.companyId as string))];
    const existingWarehouses = await prisma.warehouse.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true, companyId: true, name: true, isMain: true },
    });
    const hasMain = new Set(existingWarehouses.filter((w) => w.isMain).map((w) => w.companyId));
    const companyNameById = new Map(companies.map((c) => [c.id, c.nameAr || c.name]));
    const missing = companyIds
      .filter((id) => !hasMain.has(id))
      .map((id) => prisma.warehouse.create({ data: { companyId: id, name: companyNameById.get(id) ?? "المخزن الرئيسي", isMain: true } }));
    if (missing.length > 0) await prisma.$transaction(missing);

    // Map the fields explicitly rather than spreading the parsed row: the CSV
    // keys are only strings, and letting them through unchecked would push
    // unknown columns (and the __row marker) straight into the database.
    const created = await prisma.$transaction(async (tx) => {
      // Created one at a time so the new ids come straight back. Re-querying by
      // name afterwards would also match same-named products that already
      // belonged to another company and would give them a stock row too.
      const mainByCompany = new Map<string, string>(
        (await tx.warehouse.findMany({ where: { companyId: { in: companyIds }, isMain: true }, select: { id: true, companyId: true } }))
          .map((w) => [w.companyId, w.id])
      );

      const stockByKey = new Map(
        valid.map((row) => {
          const r = row as Record<string, unknown>;
          return [
            `${String(r.companyId)}|${String(r.name).trim().toLowerCase()}`,
            typeof r.stock === "number" ? Math.trunc(r.stock) : 0,
          ];
        })
      );

      const movements: { warehouseId: string; productId: string; quantity: number }[] = [];

      for (const row of valid) {
        const r = row as Record<string, unknown>;
        const companyId = String(r.companyId);
        const name = String(r.name);
        const product = await tx.product.create({
          data: {
            name,
            companyId,
            productType: (r.productType === "SPARE_PART" ? "SPARE_PART" : "MACHINE") as "MACHINE" | "SPARE_PART",
            description: typeof r.description === "string" && r.description !== "" ? r.description : null,
            sku: typeof r.sku === "string" && r.sku !== "" ? r.sku : null,
            brand: typeof r.brand === "string" && r.brand !== "" ? r.brand : null,
            purchasePrice: typeof r.purchasePrice === "number" ? r.purchasePrice : 0,
            wholesalePrice: typeof r.wholesalePrice === "number" ? r.wholesalePrice : 0,
            retailPrice: typeof r.retailPrice === "number" ? r.retailPrice : 0,
            isActive: true,
          },
          select: { id: true },
        });

        // Stock every imported row in the company's main warehouse so it shows up
        // in the inventory list. A missing quantity means zero — an imported
        // catalogue is not also an opening balance.
        const warehouseId = mainByCompany.get(companyId);
        if (warehouseId) {
          movements.push({
            warehouseId,
            productId: product.id,
            quantity: stockByKey.get(`${companyId}|${name.trim().toLowerCase()}`) ?? 0,
          });
        }
      }

      if (movements.length > 0) {
        await tx.warehouseInventory.createMany({ data: movements, skipDuplicates: true });
      }

      return { count: valid.length };
    });

    return NextResponse.json({ created: created.count, errors: [] });
  } catch (error) {
    console.error("Product import failed:", error);
    return NextResponse.json({ error: "Failed to import products" }, { status: 500 });
  }
}
