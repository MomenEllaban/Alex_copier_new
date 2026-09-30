import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Applying HR module schema updates safely via DDL...");

  // 1. Enum value for InstallmentPayStatus
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "InstallmentPayStatus" ADD VALUE IF NOT EXISTS 'POSTPONED';`);
    console.log("✔ InstallmentPayStatus.POSTPONED added");
  } catch (err: any) {
    console.log("  Note on enum:", err.message);
  }

  // 2. HrSetting table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "HrSetting" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL UNIQUE,
      "standardWorkingDays" INTEGER NOT NULL DEFAULT 30,
      "dailyWorkingHours" DOUBLE PRECISION NOT NULL DEFAULT 8.0,
      "overtimeWeekdayRate" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
      "overtimeWeekendRate" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
      "absenceDeductionMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
      "lateGraceMinutes" INTEGER NOT NULL DEFAULT 15,
      "lateDeductionTiers" JSONB,
      "annualLeaveDefaultDays" DOUBLE PRECISION NOT NULL DEFAULT 21.0,
      "sickLeaveDefaultDays" DOUBLE PRECISION NOT NULL DEFAULT 7.0,
      "emergencyLeaveDefaultDays" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
      "maxAdvancePercentOfSalary" DOUBLE PRECISION NOT NULL DEFAULT 50.0,
      "maxActiveLoansPerEmployee" INTEGER NOT NULL DEFAULT 1,
      "maxLoanSalaryMultiple" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
      "insuranceEnabled" BOOLEAN NOT NULL DEFAULT true,
      "insuranceEmployeeRate" DOUBLE PRECISION NOT NULL DEFAULT 11.0,
      "insuranceCompanyRate" DOUBLE PRECISION NOT NULL DEFAULT 18.75,
      "insuranceMinSalary" DOUBLE PRECISION NOT NULL DEFAULT 2000.0,
      "insuranceMaxSalary" DOUBLE PRECISION NOT NULL DEFAULT 12600.0,
      "taxEnabled" BOOLEAN NOT NULL DEFAULT true,
      "taxPersonalExemption" DOUBLE PRECISION NOT NULL DEFAULT 20000.0,
      "taxBrackets" JSONB,
      "payrollExpenseAccountId" TEXT,
      "salariesPayableAccountId" TEXT,
      "treasuryAccountId" TEXT,
      "advancesAccountId" TEXT,
      "loansAccountId" TEXT,
      "socialInsuranceAccountId" TEXT,
      "taxAuthorityAccountId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "HrSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  console.log("✔ HrSetting table created/verified");

  // 3. EmployeeBonus table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EmployeeBonus" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "bonusType" TEXT NOT NULL DEFAULT 'PERFORMANCE',
      "calcType" "CalculationType" NOT NULL DEFAULT 'FIXED_AMOUNT',
      "percentage" DOUBLE PRECISION,
      "amount" DOUBLE PRECISION NOT NULL,
      "targetMonth" INTEGER NOT NULL,
      "targetYear" INTEGER NOT NULL,
      "reason" TEXT,
      "status" "AdvanceStatus" NOT NULL DEFAULT 'PENDING',
      "approvedBy" TEXT,
      "approvedAt" TIMESTAMP(3),
      "payrollItemId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EmployeeBonus_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "EmployeeBonus_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "EmployeeBonus_payrollItemId_fkey" FOREIGN KEY ("payrollItemId") REFERENCES "PayrollItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeBonus_companyId_targetYear_targetMonth_idx" ON "EmployeeBonus"("companyId", "targetYear", "targetMonth");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeBonus_employeeId_status_idx" ON "EmployeeBonus"("employeeId", "status");`);
  console.log("✔ EmployeeBonus table created/verified");

  // 4. EmployeePenalty table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EmployeePenalty" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "penaltyType" TEXT NOT NULL DEFAULT 'ADMINISTRATIVE',
      "calcType" "CalculationType" NOT NULL DEFAULT 'FIXED_AMOUNT',
      "deductionDays" DOUBLE PRECISION,
      "amount" DOUBLE PRECISION NOT NULL,
      "targetMonth" INTEGER NOT NULL,
      "targetYear" INTEGER NOT NULL,
      "reason" TEXT NOT NULL,
      "status" "AdvanceStatus" NOT NULL DEFAULT 'PENDING',
      "approvedBy" TEXT,
      "approvedAt" TIMESTAMP(3),
      "payrollItemId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EmployeePenalty_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "EmployeePenalty_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "EmployeePenalty_payrollItemId_fkey" FOREIGN KEY ("payrollItemId") REFERENCES "PayrollItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePenalty_companyId_targetYear_targetMonth_idx" ON "EmployeePenalty"("companyId", "targetYear", "targetMonth");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePenalty_employeeId_status_idx" ON "EmployeePenalty"("employeeId", "status");`);
  console.log("✔ EmployeePenalty table created/verified");

  // 5. Update EmployeeAdvance table columns
  await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeAdvance" ADD COLUMN IF NOT EXISTS "companyId" TEXT;`);
  // Backfill companyId from Employee if null
  await prisma.$executeRawUnsafe(`UPDATE "EmployeeAdvance" a SET "companyId" = e."companyId" FROM "Employee" e WHERE a."employeeId" = e."id" AND a."companyId" IS NULL;`);
  // If still any null, fallback to company1
  await prisma.$executeRawUnsafe(`UPDATE "EmployeeAdvance" SET "companyId" = 'company1' WHERE "companyId" IS NULL;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeAdvance" ALTER COLUMN "companyId" SET NOT NULL;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeAdvance" ADD COLUMN IF NOT EXISTS "disbursedAt" TIMESTAMP(3);`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeAdvance" ADD COLUMN IF NOT EXISTS "disbursedBy" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeAdvance" ADD COLUMN IF NOT EXISTS "disbursementMethod" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeAdvance" ADD COLUMN IF NOT EXISTS "treasuryAccountId" TEXT;`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeAdvance_companyId_status_idx" ON "EmployeeAdvance"("companyId", "status");`);
  console.log("✔ EmployeeAdvance columns updated");

  // 6. Update EmployeeLoan table columns
  await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeLoan" ADD COLUMN IF NOT EXISTS "companyId" TEXT;`);
  await prisma.$executeRawUnsafe(`UPDATE "EmployeeLoan" l SET "companyId" = e."companyId" FROM "Employee" e WHERE l."employeeId" = e."id" AND l."companyId" IS NULL;`);
  await prisma.$executeRawUnsafe(`UPDATE "EmployeeLoan" SET "companyId" = 'company1' WHERE "companyId" IS NULL;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeLoan" ALTER COLUMN "companyId" SET NOT NULL;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeLoan" ADD COLUMN IF NOT EXISTS "disbursedAt" TIMESTAMP(3);`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeLoan" ADD COLUMN IF NOT EXISTS "disbursedBy" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeLoan" ADD COLUMN IF NOT EXISTS "disbursementMethod" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeLoan" ADD COLUMN IF NOT EXISTS "treasuryAccountId" TEXT;`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeLoan_companyId_status_idx" ON "EmployeeLoan"("companyId", "status");`);
  console.log("✔ EmployeeLoan columns updated");

  // 7. Update LoanInstallment table columns
  await prisma.$executeRawUnsafe(`ALTER TABLE "LoanInstallment" ADD COLUMN IF NOT EXISTS "paidMonth" INTEGER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "LoanInstallment" ADD COLUMN IF NOT EXISTS "paidYear" INTEGER;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "LoanInstallment" ADD COLUMN IF NOT EXISTS "postponedReason" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "LoanInstallment" ADD COLUMN IF NOT EXISTS "postponedAt" TIMESTAMP(3);`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "LoanInstallment" ADD COLUMN IF NOT EXISTS "postponedBy" TEXT;`);
  console.log("✔ LoanInstallment columns updated");

  // 8. Update PayrollRun table columns
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalBasic" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalAllowances" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalBonuses" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalOvertime" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalAbsenceDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalLateDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalPenalties" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalAdvances" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalLoanInstallments" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalEmployeeInsurance" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalCompanyInsurance" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalTax" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_companyId_periodId_key" ON "PayrollRun"("companyId", "periodId");`);
  console.log("✔ PayrollRun columns and unique index updated");

  // 9. Update PayrollItem table columns
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "allowancesAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "bonusesAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "overtimeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "absenceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "lateAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "penaltiesAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "advancesAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "loansAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "employeeInsuranceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "companyInsuranceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;`);
  console.log("✔ PayrollItem columns updated");

  console.log("\nAll HR schema changes applied successfully and cleanly!");
}

main()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
