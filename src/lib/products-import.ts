import { prisma } from "@/lib/prisma";
import { parseCsvRecords, validateRecords, type ImportError } from "@/lib/import-schemas";

export interface ProductImportResult {
  created: number;
  errors: ImportError[];
}

/**
 * Bulk-creates products from a CSV in the shape the products page exports.
 *
 * Lives outside the route so the API and the one-off catalogue loader run the
 * same code — a seed that drifts from the endpoint it is meant to prove is
 * worse than no seed at all.
 */
export async function importProductsCsv(csv: string): Promise<ProductImportResult> {
  const parsed = parseCsvRecords(csv, "products");
  if (parsed.errors.length > 0) {
    return { created: 0, errors: parsed.errors };
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
    return { created: 0, errors: resolveErrors };
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
    return { created: 0, errors };
  }

  // Each company needs a main warehouse before a product can be stocked, so
  // create any that are missing rather than failing the whole import.
  const companyIds = [...new Set(valid.map((r) => r.companyId as string))];
  const existingWarehouses = await prisma.warehouse.findMany({
    where: { companyId: { in: companyIds } },
    select: { id: true, companyId: true, isMain: true },
  });
  const hasMain = new Set(existingWarehouses.filter((w) => w.isMain).map((w) => w.companyId));
  const companyNameById = new Map(companies.map((c) => [c.id, c.nameAr || c.name]));
  const missing = companyIds
    .filter((id) => !hasMain.has(id))
    .map((id) =>
      prisma.warehouse.create({
        data: { companyId: id, name: companyNameById.get(id) ?? "المخزن الرئيسي", isMain: true },
      })
    );
  if (missing.length > 0) await prisma.$transaction(missing);

  // Map the fields explicitly rather than spreading the parsed row: the CSV
  // keys are only strings, and letting them through unchecked would push
  // unknown columns (and the __row marker) straight into the database.
  const rows = valid.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      name: String(r.name),
      companyId: String(r.companyId),
      productType: (r.productType === "SPARE_PART" ? "SPARE_PART" : "MACHINE") as
        | "MACHINE"
        | "SPARE_PART",
      description: typeof r.description === "string" && r.description !== "" ? r.description : null,
      sku: typeof r.sku === "string" && r.sku !== "" ? r.sku : null,
      brand: typeof r.brand === "string" && r.brand !== "" ? r.brand : null,
      purchasePrice: typeof r.purchasePrice === "number" ? r.purchasePrice : 0,
      wholesalePrice: typeof r.wholesalePrice === "number" ? r.wholesalePrice : 0,
      retailPrice: typeof r.retailPrice === "number" ? r.retailPrice : 0,
      isActive: true,
    };
  });

  return prisma.$transaction(
    async (tx) => {
      // Batched inserts: one round trip per chunk instead of one per row. A
      // full catalogue is a few hundred rows, which overruns the default 5s
      // interactive-transaction budget on a remote database.
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.product.createMany({ data: rows.slice(i, i + CHUNK) });
      }

      const mainByCompany = new Map<string, string>(
        (
          await tx.warehouse.findMany({
            where: { companyId: { in: companyIds }, isMain: true },
            select: { id: true, companyId: true },
          })
        ).map((w) => [w.companyId, w.id])
      );

      // Scoped to the companies being imported. The duplicate check above
      // guarantees none of these (company, name) pairs existed beforehand, so
      // this returns exactly the rows just inserted and cannot pick up a
      // same-named product belonging to some other company.
      const inserted = await tx.product.findMany({
        where: { companyId: { in: companyIds }, name: { in: rows.map((r) => r.name) } },
        select: { id: true, name: true, companyId: true },
      });

      const stockByKey = new Map(
        valid.map((row) => {
          const r = row as Record<string, unknown>;
          return [
            `${String(r.companyId)}|${String(r.name).trim().toLowerCase()}`,
            typeof r.stock === "number" ? Math.trunc(r.stock) : 0,
          ];
        })
      );

      const movements = inserted.flatMap((product) => {
        const warehouseId = mainByCompany.get(product.companyId);
        if (!warehouseId) return [];
        return [
          {
            warehouseId,
            productId: product.id,
            // Stock every imported row in the company's main warehouse so it
            // shows up in the inventory list. A missing quantity means zero —
            // an imported catalogue is not also an opening balance.
            quantity:
              stockByKey.get(`${product.companyId}|${product.name.trim().toLowerCase()}`) ?? 0,
          },
        ];
      });

      if (movements.length > 0) {
        await tx.warehouseInventory.createMany({ data: movements, skipDuplicates: true });
      }

      return { created: rows.length, errors: [] };
    },
    { timeout: 120_000, maxWait: 30_000 }
  );
}
