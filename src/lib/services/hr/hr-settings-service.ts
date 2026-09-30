/**
 * HR Settings & Configuration Service
 *
 * Centralized service to manage company-specific HR settings, policies,
 * social insurance, income tax brackets, and chart of accounts mapping.
 * Ensures zero hardcoding across all HR operations.
 */
import { prisma } from "@/lib/prisma";

export interface HrPolicyConfig {
  id: string;
  companyId: string;
  standardWorkingDays: number;
  dailyWorkingHours: number;
  overtimeWeekdayRate: number;
  overtimeWeekendRate: number;
  absenceDeductionMultiplier: number;
  lateGraceMinutes: number;
  lateDeductionTiers?: any;
  annualLeaveDefaultDays: number;
  sickLeaveDefaultDays: number;
  emergencyLeaveDefaultDays: number;
  maxAdvancePercentOfSalary: number;
  maxActiveLoansPerEmployee: number;
  maxLoanSalaryMultiple: number;
  insuranceEnabled: boolean;
  insuranceEmployeeRate: number;
  insuranceCompanyRate: number;
  insuranceMinSalary: number;
  insuranceMaxSalary: number;
  taxEnabled: boolean;
  taxPersonalExemption: number;
  taxBrackets?: any;
  payrollExpenseAccountId?: string | null;
  salariesPayableAccountId?: string | null;
  treasuryAccountId?: string | null;
  advancesAccountId?: string | null;
  loansAccountId?: string | null;
  socialInsuranceAccountId?: string | null;
  taxAuthorityAccountId?: string | null;
}

/**
 * Default tax brackets based on standard progressive tax scale.
 */
export const DEFAULT_TAX_BRACKETS = [
  { minAnnual: 0, maxAnnual: 40000, rate: 0.0 },
  { minAnnual: 40000, maxAnnual: 55000, rate: 0.10 },
  { minAnnual: 55000, maxAnnual: 70000, rate: 0.15 },
  { minAnnual: 70000, maxAnnual: 200000, rate: 0.20 },
  { minAnnual: 200000, maxAnnual: 400000, rate: 0.225 },
  { minAnnual: 400000, maxAnnual: Infinity, rate: 0.25 },
];

/**
 * Get HR Settings for a company. If none exists, creates default settings.
 */
export async function getCompanyHrSettings(companyId: string): Promise<HrPolicyConfig> {
  let settings = await prisma.hrSetting.findUnique({
    where: { companyId },
  });

  if (!settings) {
    settings = await prisma.hrSetting.create({
      data: {
        companyId,
        standardWorkingDays: 30,
        dailyWorkingHours: 8.0,
        overtimeWeekdayRate: 1.5,
        overtimeWeekendRate: 2.0,
        absenceDeductionMultiplier: 1.0,
        lateGraceMinutes: 15,
        annualLeaveDefaultDays: 21.0,
        sickLeaveDefaultDays: 7.0,
        emergencyLeaveDefaultDays: 5.0,
        maxAdvancePercentOfSalary: 50.0,
        maxActiveLoansPerEmployee: 1,
        maxLoanSalaryMultiple: 3.0,
        insuranceEnabled: true,
        insuranceEmployeeRate: 11.0,
        insuranceCompanyRate: 18.75,
        insuranceMinSalary: 2000.0,
        insuranceMaxSalary: 12600.0,
        taxEnabled: true,
        taxPersonalExemption: 20000.0,
        taxBrackets: DEFAULT_TAX_BRACKETS,
      },
    });
  }

  return settings;
}

/**
 * Update HR Settings for a company.
 */
export async function updateCompanyHrSettings(
  companyId: string,
  data: Partial<Omit<HrPolicyConfig, "id" | "companyId">>
): Promise<HrPolicyConfig> {
  const existing = await getCompanyHrSettings(companyId);

  return prisma.hrSetting.update({
    where: { id: existing.id },
    data,
  });
}

/**
 * Validate that all required accounting accounts are mapped for payroll closing.
 */
export async function validatePayrollAccountMapping(companyId: string): Promise<{
  isValid: boolean;
  missingAccounts: string[];
  accountIds: {
    payrollExpense?: string;
    salariesPayable?: string;
    treasury?: string;
    advances?: string;
    loans?: string;
    socialInsurance?: string;
    taxAuthority?: string;
  };
}> {
  const settings = await getCompanyHrSettings(companyId);
  const missing: string[] = [];

  if (!settings.payrollExpenseAccountId) missing.push("حساب مصروف الرواتب والأجور (Payroll Expense)");
  if (!settings.salariesPayableAccountId) missing.push("حساب مستحقات العاملين/الرواتب الدائنة (Salaries Payable)");
  if (!settings.treasuryAccountId) missing.push("حساب الخزينة / البنك (Treasury/Bank)");
  if (!settings.advancesAccountId) missing.push("حساب سلف الموظفين (Advances)");
  if (!settings.loansAccountId) missing.push("حساب قروض الموظفين (Loans)");
  if (settings.insuranceEnabled && !settings.socialInsuranceAccountId) {
    missing.push("حساب الهيئة القومية للتأمينات الاجتماعية (Social Insurance Authority)");
  }
  if (settings.taxEnabled && !settings.taxAuthorityAccountId) {
    missing.push("حساب مصلحة الضرائب / كسب العمل (Tax Authority)");
  }

  // Also verify that the accounts exist in the Account table
  const accountIdsToCheck = [
    settings.payrollExpenseAccountId,
    settings.salariesPayableAccountId,
    settings.treasuryAccountId,
    settings.advancesAccountId,
    settings.loansAccountId,
    settings.socialInsuranceAccountId,
    settings.taxAuthorityAccountId,
  ].filter(Boolean) as string[];

  if (accountIdsToCheck.length > 0) {
    const existingAccounts = await prisma.account.findMany({
      where: { id: { in: accountIdsToCheck }, companyId },
      select: { id: true, name: true },
    });
    const foundSet = new Set(existingAccounts.map((a) => a.id));

    if (settings.payrollExpenseAccountId && !foundSet.has(settings.payrollExpenseAccountId)) {
      missing.push(`حساب مصروف الرواتب المحدد غير موجود برقم (${settings.payrollExpenseAccountId})`);
    }
    if (settings.salariesPayableAccountId && !foundSet.has(settings.salariesPayableAccountId)) {
      missing.push(`حساب مستحقات الرواتب المحدد غير موجود برقم (${settings.salariesPayableAccountId})`);
    }
    if (settings.treasuryAccountId && !foundSet.has(settings.treasuryAccountId)) {
      missing.push(`حساب الخزينة المحدد غير موجود برقم (${settings.treasuryAccountId})`);
    }
  }

  return {
    isValid: missing.length === 0,
    missingAccounts: missing,
    accountIds: {
      payrollExpense: settings.payrollExpenseAccountId ?? undefined,
      salariesPayable: settings.salariesPayableAccountId ?? undefined,
      treasury: settings.treasuryAccountId ?? undefined,
      advances: settings.advancesAccountId ?? undefined,
      loans: settings.loansAccountId ?? undefined,
      socialInsurance: settings.socialInsuranceAccountId ?? undefined,
      taxAuthority: settings.taxAuthorityAccountId ?? undefined,
    },
  };
}
