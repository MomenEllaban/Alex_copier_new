-- AlterEnum
ALTER TYPE "InstallmentPayStatus" ADD VALUE IF NOT EXISTS 'POSTPONED';

-- AlterTable
ALTER TABLE "EmployeeAdvance" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT 'company1',
ADD COLUMN IF NOT EXISTS "disbursedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "disbursedBy" TEXT,
ADD COLUMN IF NOT EXISTS "disbursementMethod" TEXT,
ADD COLUMN IF NOT EXISTS "treasuryAccountId" TEXT;

-- AlterTable
ALTER TABLE "EmployeeLoan" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT 'company1',
ADD COLUMN IF NOT EXISTS "disbursedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "disbursedBy" TEXT,
ADD COLUMN IF NOT EXISTS "disbursementMethod" TEXT,
ADD COLUMN IF NOT EXISTS "treasuryAccountId" TEXT;

-- AlterTable
ALTER TABLE "LoanInstallment" ADD COLUMN IF NOT EXISTS "paidMonth" INTEGER,
ADD COLUMN IF NOT EXISTS "paidYear" INTEGER,
ADD COLUMN IF NOT EXISTS "postponedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "postponedBy" TEXT,
ADD COLUMN IF NOT EXISTS "postponedReason" TEXT;

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "totalAbsenceDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalAdvances" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalAllowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalBasic" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalBonuses" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalCompanyInsurance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalEmployeeInsurance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalLateDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalLoanInstallments" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalOvertime" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalPenalties" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalTax" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PayrollItem" ADD COLUMN IF NOT EXISTS "absenceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "advancesAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "allowancesAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "bonusesAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "companyInsuranceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "employeeInsuranceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lateAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "loansAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "overtimeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "penaltiesAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmployeeAdvance_companyId_status_idx" ON "EmployeeAdvance"("companyId", "status");
CREATE INDEX IF NOT EXISTS "EmployeeLoan_companyId_status_idx" ON "EmployeeLoan"("companyId", "status");
CREATE INDEX IF NOT EXISTS "EmployeeBonus_companyId_targetYear_targetMonth_idx" ON "EmployeeBonus"("companyId", "targetYear", "targetMonth");
CREATE INDEX IF NOT EXISTS "EmployeeBonus_employeeId_status_idx" ON "EmployeeBonus"("employeeId", "status");
CREATE INDEX IF NOT EXISTS "EmployeePenalty_companyId_targetYear_targetMonth_idx" ON "EmployeePenalty"("companyId", "targetYear", "targetMonth");
CREATE INDEX IF NOT EXISTS "EmployeePenalty_employeeId_status_idx" ON "EmployeePenalty"("employeeId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_companyId_periodId_key" ON "PayrollRun"("companyId", "periodId");

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" DROP CONSTRAINT IF EXISTS "EmployeeAdvance_companyId_fkey",
ADD CONSTRAINT "EmployeeAdvance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeAdvance" DROP CONSTRAINT IF EXISTS "EmployeeAdvance_payrollItemId_fkey",
ADD CONSTRAINT "EmployeeAdvance_payrollItemId_fkey" FOREIGN KEY ("payrollItemId") REFERENCES "PayrollItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeLoan" DROP CONSTRAINT IF EXISTS "EmployeeLoan_companyId_fkey",
ADD CONSTRAINT "EmployeeLoan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoanInstallment" DROP CONSTRAINT IF EXISTS "LoanInstallment_payrollItemId_fkey",
ADD CONSTRAINT "LoanInstallment_payrollItemId_fkey" FOREIGN KEY ("payrollItemId") REFERENCES "PayrollItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
