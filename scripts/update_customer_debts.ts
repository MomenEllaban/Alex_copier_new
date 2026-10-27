// scripts/update_customer_debts.ts
// ------------------------------------------------------------
// Reads "عملاء_القطاعي.xlsx" and updates customer debts:
//   - "رصيد مدين": The CURRENT remaining debt owed by the customer right now (remainingDebt).
//   - "قيمة آخر دفعة": The last payment made (dated yesterday).
//   - totalDebt: The full original debt = remainingDebt + lastPayment.
// ------------------------------------------------------------

import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import xlsx from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// Yesterday at midnight
function getYesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

const SKIP_NAMES = new Set(["الاجمالي", "mj"]);

async function main() {
  const excelPath = path.resolve(process.cwd(), "عملاء_القطاعي.xlsx");
  if (!fs.existsSync(excelPath)) {
    console.error(`❌ Excel file not found at ${excelPath}`);
    process.exit(1);
  }

  const workbook = xlsx.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows: Record<string, unknown>[] = xlsx.utils.sheet_to_json(sheet, { defval: null });

  // First row is the Arabic header
  const dataRows = rawRows.slice(1);
  console.log(`📄 Found ${dataRows.length} data rows in Excel.\n`);

  const COL_NAME = "__EMPTY";     // اسم العميل
  const COL_DEBT = "__EMPTY_1";   // رصيد مدين (الرصيد المدين الحالي المطلوب)
  const COL_PAY  = "__EMPTY_2";   // قيمة آخر دفعة

  const yesterday = getYesterday();

  // Clean up any previously imported payments from this sheet to ensure idempotent rerun
  const deletedPrevPayments = await prisma.customerPayment.deleteMany({
    where: { notes: { contains: "عملاء_القطاعي" } },
  });
  console.log(`🧹 Cleaned up ${deletedPrevPayments.count} previously imported test payments for clean rerun.\n`);

  let created = 0;
  let updated = 0;
  let paymentsAdded = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const rawName = String(row[COL_NAME] ?? "").trim();
    if (!rawName || SKIP_NAMES.has(rawName.toLowerCase())) {
      console.warn(`⚠️  Skipping: "${rawName || "(empty)"}"`);
      skipped++;
      continue;
    }

    const currentRemainingDebt = Number(row[COL_DEBT] ?? 0) || 0;
    const lastPayment = Number(row[COL_PAY] ?? 0) || 0;

    // Total debt is the current remaining balance plus whatever was paid in the last payment
    const totalOriginalDebt = currentRemainingDebt + lastPayment;

    // Find customer by case-insensitive name
    let customer = await prisma.customer.findFirst({
      where: { name: { equals: rawName, mode: "insensitive" } },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: rawName,
          totalDebt: totalOriginalDebt,
          remainingDebt: currentRemainingDebt,
          lastPaymentDate: lastPayment > 0 ? yesterday : null,
        },
      });
      created++;
      console.log(`✅ Created: "${rawName}" | الدين الكلي=${totalOriginalDebt} | المتبقي الحالي=${currentRemainingDebt}`);
    } else {
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          totalDebt: totalOriginalDebt,
          remainingDebt: currentRemainingDebt,
          lastPaymentDate: lastPayment > 0 ? yesterday : customer.lastPaymentDate,
        },
      });
      updated++;
      console.log(`🔄 Updated: "${rawName}" | الدين الكلي=${totalOriginalDebt} | المتبقي الحالي=${currentRemainingDebt}`);
    }

    // Insert last payment if amount > 0
    if (lastPayment > 0) {
      await prisma.customerPayment.create({
        data: {
          customerId: customer.id,
          amount: lastPayment,
          paymentDate: yesterday,
          notes: "Imported from عملاء_القطاعي.xlsx – آخر دفعة",
        },
      });
      paymentsAdded++;
      console.log(`  💰 Added Payment: ${lastPayment} ج.م on ${yesterday.toISOString().split("T")[0]}`);
    }
  }

  console.log("\n========== Summary ==========");
  console.log(`  ✅ Created:  ${created}`);
  console.log(`  🔄 Updated:  ${updated}`);
  console.log(`  💰 Payments: ${paymentsAdded}`);
  console.log(`  ⚠️  Skipped:  ${skipped}`);
  console.log("==============================\n");
}

main()
  .catch((e) => {
    console.error("❌ Unexpected error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
