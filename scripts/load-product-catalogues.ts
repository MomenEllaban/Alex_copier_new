// Loads the two company product catalogues from their workbooks.
//
//   npx tsx scripts/load-product-catalogues.ts            dry run, writes nothing
//   npx tsx scripts/load-product-catalogues.ts --write    actually import
//   npx tsx scripts/load-product-catalogues.ts --write --archive-stale
//
// The workbooks are bare name lists, so they are turned into the same CSV shape
// the products page exports and then handed to the very function the import
// endpoint uses, so this cannot drift from what the app does.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { importProductsCsv } from "../src/lib/products-import";
import { prisma } from "../src/lib/prisma";

const TEMP = "C:/Users/Momen/AppData/Local/Temp/opencode";

interface Catalogue {
  company: string;
  productType: "MACHINE" | "SPARE_PART";
  workbook: string;
  column: string;
}

const CATALOGUES: Catalogue[] = [
  { company: "شركة جملة آلات", productType: "MACHINE", workbook: `${TEMP}/xlsx2/x`, column: "B" },
  { company: "شركة جملة قطع غيار", productType: "SPARE_PART", workbook: `${TEMP}/xlsx3/x`, column: "A" },
];

function sharedStrings(base: string): string[] {
  try {
    const xml = readFileSync(`${base}/xl/sharedStrings.xml`, "utf8");
    return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) =>
      [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("").trim()
    );
  } catch {
    return [];
  }
}

function columnNames(base: string, column: string): string[] {
  const strings = sharedStrings(base);
  const xml = readFileSync(`${base}/xl/worksheets/sheet1.xml`, "utf8");
  const out: string[] = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    for (const cell of row[1].matchAll(/<c\b([^>]*?)\/?>(?:([\s\S]*?)<\/c>)?/g)) {
      const attrs = cell[1];
      const body = cell[2] ?? "";
      if (!new RegExp(`\\sr="${column}\\d+"`).test(attrs)) continue;
      const value = /\st="s"/.test(attrs)
        ? strings[Number(body.replace(/<[^>]*>/g, ""))] ?? ""
        : [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("").trim() ||
          body.replace(/<[^>]*>/g, "").trim();
      if (value) out.push(value.trim());
    }
  }
  return out;
}

function quote(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(names: string[], company: string, type: string): string {
  const typeLabel = type === "MACHINE" ? "آلة" : "قطعة غيار";
  const header = "اسم المنتج,الشركة التابعة,النوع,سعر الشراء,سعر الجملة,سعر التجزئة,الكمية";
  const rows = names.map((n) => [n, company, typeLabel, "0", "0", "0", "0"].map(quote).join(","));
  return [header, ...rows].join("\n");
}

async function main() {
  const write = process.argv.includes("--write");
  const archiveStale = process.argv.includes("--archive-stale");
  const purge = process.argv.includes("--purge-archived");
  // Re-applies which products are active without importing anything, so a
  // previously run import can be corrected without creating duplicates.
  const syncOnly = process.argv.includes("--sync-only");
  console.log(
    syncOnly
      ? "MODE: SYNC ONLY (activation state only, nothing imported)\n"
      : purge
        ? "MODE: PURGE ARCHIVED (permanent delete, no undo)\n"
        : write
          ? "MODE: WRITE\n"
          : "MODE: DRY RUN (nothing will be written)\n"
  );

  for (const catalogue of CATALOGUES) {
    const raw = columnNames(catalogue.workbook, catalogue.column);
    // The spare-parts sheet repeats one name; the importer rejects the repeat,
    // so drop it here and say so rather than failing the whole file.
    const names = [...new Set(raw.map((n) => n.trim()))].filter(Boolean);

    console.log(`=== ${catalogue.company} (${catalogue.productType}) ===`);
    console.log(`  workbook rows : ${raw.length}`);
    console.log(`  unique names  : ${names.length}${raw.length !== names.length ? `  (dropped ${raw.length - names.length} repeat(s))` : ""}`);

    if (!write && !syncOnly) {
      console.log("  would import  : " + names.length + " products at zero price and zero stock");
      if (purge) {
        const company = await prisma.company.findFirst({
          where: { OR: [{ nameAr: catalogue.company }, { name: catalogue.company }] },
          select: { id: true },
        });
        const archived = company
          ? await prisma.product.count({ where: { companyId: company.id, isActive: false } })
          : 0;
        console.log(`  would purge   : ${archived} archived product(s) and their stock history`);
      }
      console.log("");
      continue;
    }

    if (syncOnly) {
      console.log("  import        : skipped (sync only)");
    } else {
      const result = await importProductsCsv(toCsv(names, catalogue.company, catalogue.productType));
      if (result.errors.length > 0) {
        console.log(`  FAILED with ${result.errors.length} error(s):`);
        for (const e of result.errors.slice(0, 10)) console.log(`    row ${e.row} ${e.field}: ${e.message}`);
        process.exitCode = 1;
        continue;
      }
      console.log(`  imported      : ${result.created}`);
    }

    if (archiveStale) {
      // Make the catalogue match the workbook, in both directions: anything the
      // workbook lists is active, anything it does not list is not.
      //
      // The comparison is done in JS on ids. Filtering with `name: { notIn }`
      // looks simpler but Postgres compares case-sensitively, so a product
      // stored as "MPC 3050" against a lowercased keep-list would be judged
      // stale and archived the moment it was imported.
      const company = await prisma.company.findFirst({
        where: { OR: [{ nameAr: catalogue.company }, { name: catalogue.company }] },
        select: { id: true },
      });
      if (company) {
        const keep = new Set(names.map((n) => n.trim().toLowerCase()));
        const all = await prisma.product.findMany({
          where: { companyId: company.id },
          select: { id: true, name: true, isActive: true },
        });

        const toArchive = all.filter((p) => !keep.has(p.name.trim().toLowerCase()) && p.isActive);
        const toRestore = all.filter((p) => keep.has(p.name.trim().toLowerCase()) && !p.isActive);

        if (toArchive.length > 0) {
          // Archive rather than delete: every one of these is referenced by
          // stock movements, and the product endpoint archives for the same reason.
          await prisma.product.updateMany({
            where: { id: { in: toArchive.map((p) => p.id) } },
            data: { isActive: false },
          });
        }
        if (toRestore.length > 0) {
          await prisma.product.updateMany({
            where: { id: { in: toRestore.map((p) => p.id) } },
            data: { isActive: true },
          });
        }

        console.log(`  archived        : ${toArchive.length} product(s) not in the workbook`);
        if (toRestore.length > 0) {
          console.log(`  reactivated     : ${toRestore.length} workbook product(s) that were inactive`);
        }
      }
    }
    if (purge && write) {
      // Hard delete. Every relation to Product cascades, so this also takes the
      // product's stock movements, stock rows, custodies and compatibility links
      // with it. Only run it once the archive has been reviewed.
      const company = await prisma.company.findFirst({
        where: { OR: [{ nameAr: catalogue.company }, { name: catalogue.company }] },
        select: { id: true },
      });
      if (company) {
        const archived = await prisma.product.findMany({
          where: { companyId: company.id, isActive: false },
          select: { id: true, name: true },
        });
        if (archived.length > 0) {
          const gone = await prisma.product.deleteMany({
            where: { id: { in: archived.map((p) => p.id) } },
          });
          console.log(`  purged         : ${gone.count} archived product(s), with their stock history`);
        } else {
          console.log("  purged         : 0 (nothing archived)");
        }
      }
    }

    const kept = await prisma.product.count({
      where: { companyId: (await prisma.company.findFirst({
        where: { OR: [{ nameAr: catalogue.company }, { name: catalogue.company }] },
        select: { id: true },
      }))?.id },
    });
    console.log(`  products now   : ${kept}`);
    console.log("");
  }

  const counts = await prisma.product.groupBy({ by: ["companyId"], _count: { _all: true } });
  const companies = await prisma.company.findMany({ select: { id: true, name: true, nameAr: true } });
  console.log("=== products per company now ===");
  for (const c of companies) {
    const row = counts.find((x) => x.companyId === c.id);
    const active = await prisma.product.count({ where: { companyId: c.id, isActive: true } });
    console.log(`  ${(c.nameAr || c.name).padEnd(24)} active: ${String(active).padStart(4)}   total: ${row?._count._all ?? 0}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
