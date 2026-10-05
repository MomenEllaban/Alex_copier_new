/**
 * Comprehensive Payroll Service
 *
 * Implements end-to-end payroll calculations and atomic transactional lock:
 * - Dynamic config-driven calculations via HrSetting (Zero hardcoding)
 * - Automatic deduction of due LoanInstallments and EmployeeAdvances
 * - Inclusion of approved EmployeeBonuses and EmployeePenalties
 * - Configurable Social Insurance & progressive Income Tax
 * - Strict Idempotency (safe re-calculation without duplication)
 * - Atomic Transactional Lock with complete rollback on failure
 * - Automatic Balanced Journal Entry generation
 * - Detailed Audit Trail (payrollItemId populated on all resolved records)
 */
import { prisma } from "@/lib/prisma";
import { getCompanyHrSettings, validatePayrollAccountMapping, DEFAULT_TAX_BRACKETS } from "./hr-settings-service";
import { PayrollItemFlag } from "@/generated/prisma/client";

export interface CalculatePayrollOptions {
  companyId: string;
  month: number;
  year: number;
  actorId?: string;
}

/**
 * Progressive income tax calculator based on configured tax brackets.
 */
export function calculateAnnualTax(
  taxableIncome: number,
  brackets: Array<{ minAnnual: number; maxAnnual: number; rate: number }>
): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;

  for (const b of brackets) {
    if (taxableIncome > b.minAnnual) {
      const taxableInBracket = Math.min(taxableIncome, b.maxAnnual) - b.minAnnual;
      tax += taxableInBracket * b.rate;
    }
  }

  return Math.round(tax * 100) / 100;
}

export const calculateTaxForTaxableIncome = calculateAnnualTax;

export async function calculateMonthlyPayroll(
  companyId: string,
  month: number,
  year: number,
  actorId?: string
) {
  return calculatePayrollRun({ companyId, month, year, actorId });
}

export async function calculatePayrollRun(options: CalculatePayrollOptions) {
  const { companyId, month, year, actorId } = options;

  if (!month || month < 1 || month > 12) throw new Error("رقم الشهر غير صالح (1-12)");
  if (!year || year < 2000 || year > 2100) throw new Error("السنة غير صالحة");

  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

  // 1. Find or create PayrollPeriod
  let period = await prisma.payrollPeriod.findUnique({
    where: { companyId_month_year: { companyId, month, year } },
  });

  if (!period) {
    period = await prisma.payrollPeriod.create({
      data: {
        companyId,
        month,
        year,
        startDate: periodStart,
        endDate: periodEnd,
      },
    });
  }

  // 2. Check if a PayrollRun already exists for this period
  const existingRun = await prisma.payrollRun.findUnique({
    where: { companyId_periodId: { companyId, periodId: period.id } },
  });

  if (existingRun && existingRun.status === "LOCKED") {
    throw new Error(`كشف رواتب شهر ${month}/${year} مقفل ومصروف بالفعل ولا يمكن إعادة احتسابه`);
  }

  // 3. Load HR policy settings (Zero hardcoding)
  const settings = await getCompanyHrSettings(companyId);
  const taxBrackets = settings.taxBrackets ?? DEFAULT_TAX_BRACKETS;

  // 4. Load Active Employees with recurring salary components
  const employees = await prisma.employee.findMany({
    where: { companyId, status: "ACTIVE" },
    include: {
      SalaryComponents: {
        where: { isActive: true },
        include: { SalaryComponent: true },
      },
    },
  });

  // 5. Load Attendance records in period
  const attendanceRecords = await prisma.dailyAttendanceRecord.findMany({
    where: {
      date: { gte: periodStart, lte: periodEnd },
      Employee: { companyId },
    },
  });

  // 6. Load due Loan Installments for the period
  const loanInstallments = await prisma.loanInstallment.findMany({
    where: {
      status: "PENDING_PAY",
      dueDate: { lte: periodEnd },
      Loan: { companyId },
    },
    include: { Loan: { select: { employeeId: true } } },
  });

  // 7. Load approved Advances for this month/year
  const advances = await prisma.employeeAdvance.findMany({
    where: {
      companyId,
      status: "APPROVED",
      deductMonth: month,
      deductYear: year,
    },
  });

  // 8. Load approved Bonuses for this month/year
  const bonuses = await prisma.employeeBonus.findMany({
    where: {
      companyId,
      status: "APPROVED",
      targetMonth: month,
      targetYear: year,
    },
  });

  // 9. Load approved Penalties for this month/year
  const penalties = await prisma.employeePenalty.findMany({
    where: {
      companyId,
      status: "APPROVED",
      targetMonth: month,
      targetYear: year,
    },
  });

  // 10. Process each employee
  const calculatedItems = employees.map((emp) => {
    const empAttendance = attendanceRecords.filter((a) => a.employeeId === emp.id);
    const empLoanInsts = loanInstallments.filter((li) => li.Loan.employeeId === emp.id);
    const empAdvances = advances.filter((a) => a.employeeId === emp.id);
    const empBonuses = bonuses.filter((b) => b.employeeId === emp.id);
    const empPenalties = penalties.filter((p) => p.employeeId === emp.id);

    const workedDays = empAttendance.filter((a) => ["PRESENT", "LATE", "EARLY_LEAVE"].includes(a.status)).length;
    const absentDays = empAttendance.filter((a) => a.status === "ABSENT").length;
    const lateDays = empAttendance.filter((a) => a.status === "LATE").length;
    const totalLateMinutes = empAttendance.reduce((sum, a) => sum + (a.lateMinutes || 0), 0);
    const totalOvertimeMinutes = empAttendance.reduce((sum, a) => sum + (a.overtimeMin || 0), 0);

    const basicSalary = emp.baseSalary;
    const dailyRate = settings.standardWorkingDays > 0 ? basicSalary / settings.standardWorkingDays : 0;
    const hourlyRate = settings.dailyWorkingHours > 0 ? dailyRate / settings.dailyWorkingHours : 0;
    const minuteRate = hourlyRate / 60;

    // Recurring allowances
    let allowancesAmount = 0;
    const itemComponents: Array<{
      salaryComponentId?: string | null;
      label: string;
      type: "ALLOWANCE" | "DEDUCTION";
      amount: number;
    }> = [];

    for (const sc of emp.SalaryComponents) {
      const val = sc.overrideValue ?? sc.SalaryComponent.defaultValue;
      if (sc.SalaryComponent.type === "ALLOWANCE") {
        allowancesAmount += val;
        itemComponents.push({
          salaryComponentId: sc.salaryComponentId,
          label: sc.SalaryComponent.name,
          type: "ALLOWANCE",
          amount: val,
        });
      } else if (sc.SalaryComponent.type === "DEDUCTION") {
        itemComponents.push({
          salaryComponentId: sc.salaryComponentId,
          label: sc.SalaryComponent.name,
          type: "DEDUCTION",
          amount: val,
        });
      }
    }

    // Overtime
    const overtimeHours = Math.round((totalOvertimeMinutes / 60) * 100) / 100;
    const overtimeAmount = Math.round(overtimeHours * hourlyRate * settings.overtimeWeekdayRate * 100) / 100;
    if (overtimeAmount > 0) {
      itemComponents.push({ label: "عمل إضافي (Overtime)", type: "ALLOWANCE", amount: overtimeAmount });
    }

    // Bonuses
    const bonusesAmount = Math.round(empBonuses.reduce((sum, b) => sum + b.amount, 0) * 100) / 100;
    for (const b of empBonuses) {
      itemComponents.push({ label: b.title || "حافز", type: "ALLOWANCE", amount: b.amount });
    }

    // Absence deduction
    const absenceAmount = Math.round(absentDays * dailyRate * settings.absenceDeductionMultiplier * 100) / 100;
    if (absenceAmount > 0) {
      itemComponents.push({ label: `خصم غياب (${absentDays} يوم)`, type: "DEDUCTION", amount: absenceAmount });
    }

    // Late deduction
    let lateDeductionAmount = 0;
    if (totalLateMinutes > settings.lateGraceMinutes) {
      const chargeableLateMin = totalLateMinutes - settings.lateGraceMinutes;
      lateDeductionAmount = Math.round(chargeableLateMin * minuteRate * 100) / 100;
      if (lateDeductionAmount > 0) {
        itemComponents.push({ label: `خصم تأخير (${chargeableLateMin} دقيقة)`, type: "DEDUCTION", amount: lateDeductionAmount });
      }
    }

    // Administrative Penalties
    const penaltiesAmount = Math.round(empPenalties.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
    for (const p of empPenalties) {
      itemComponents.push({ label: p.title || "جزاء إداري", type: "DEDUCTION", amount: p.amount });
    }

    // Advances
    const advancesAmount = Math.round(empAdvances.reduce((sum, a) => sum + a.amount, 0) * 100) / 100;
    if (advancesAmount > 0) {
      itemComponents.push({ label: "استقطاع سلفة (Advance)", type: "DEDUCTION", amount: advancesAmount });
    }

    // Loans
    const loansAmount = Math.round(empLoanInsts.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;
    if (loansAmount > 0) {
      itemComponents.push({ label: "قسط قرض (Loan Installment)", type: "DEDUCTION", amount: loansAmount });
    }

    // Social Insurance
    let employeeInsuranceAmount = 0;
    let companyInsuranceAmount = 0;
    if (settings.insuranceEnabled) {
      const insurableSalary = Math.min(Math.max(basicSalary, settings.insuranceMinSalary), settings.insuranceMaxSalary);
      employeeInsuranceAmount = Math.round(((insurableSalary * settings.insuranceEmployeeRate) / 100) * 100) / 100;
      companyInsuranceAmount = Math.round(((insurableSalary * settings.insuranceCompanyRate) / 100) * 100) / 100;

      if (employeeInsuranceAmount > 0) {
        itemComponents.push({ label: "تأمينات اجتماعية (حصة العامل)", type: "DEDUCTION", amount: employeeInsuranceAmount });
      }
    }

    // Gross salary
    const grossSalary = Math.round((basicSalary + allowancesAmount + overtimeAmount + bonusesAmount) * 100) / 100;
    const totalEarnings = grossSalary;

    // Income Tax
    let taxAmount = 0;
    if (settings.taxEnabled) {
      const monthlyTaxableBase = grossSalary - employeeInsuranceAmount;
      const annualTaxableBase = monthlyTaxableBase * 12 - settings.taxPersonalExemption;
      if (annualTaxableBase > 0) {
        const annualTax = calculateAnnualTax(annualTaxableBase, taxBrackets);
        taxAmount = Math.round((annualTax / 12) * 100) / 100;
        if (taxAmount > 0) {
          itemComponents.push({ label: "ضريبة كسب العمل (Income Tax)", type: "DEDUCTION", amount: taxAmount });
        }
      }
    }

    const totalDeductions = Math.round(
      (absenceAmount +
        lateDeductionAmount +
        penaltiesAmount +
        advancesAmount +
        loansAmount +
        employeeInsuranceAmount +
        taxAmount) *
        100
    ) / 100;

    const netSalary = Math.round((grossSalary - totalDeductions) * 100) / 100;

    let flag: PayrollItemFlag = "NONE";
    const warnings: string[] = [];

    if (netSalary < 0) {
      flag = "NEGATIVE_NET";
      warnings.push(`صافي الراتب سالب: ${netSalary.toFixed(2)}`);
    }
    if (empAttendance.length === 0) {
      warnings.push("لا توجد سجلات حضور مسجلة لهذا الشهر");
    }

    return {
      employeeId: emp.id,
      basicSalary,
      allowancesAmount,
      bonusesAmount,
      overtimeAmount,
      absenceAmount,
      lateAmount: lateDeductionAmount,
      penaltiesAmount,
      advancesAmount,
      loansAmount,
      employeeInsuranceAmount,
      companyInsuranceAmount,
      taxAmount,
      totalEarnings,
      totalDeductions,
      grossSalary,
      netSalary,
      workedDays,
      absentDays,
      lateDays,
      overtimeHours,
      flag,
      notes: warnings.length > 0 ? warnings.join("; ") : null,
      components: itemComponents,
    };
  });

  // 11. Aggregate totals
  const totalGross = Math.round(calculatedItems.reduce((sum, i) => sum + i.grossSalary, 0) * 100) / 100;
  const totalDeductions = Math.round(calculatedItems.reduce((sum, i) => sum + i.totalDeductions, 0) * 100) / 100;
  const totalNet = Math.round(calculatedItems.reduce((sum, i) => sum + i.netSalary, 0) * 100) / 100;
  const totalBasic = Math.round(calculatedItems.reduce((sum, i) => sum + i.basicSalary, 0) * 100) / 100;
  const totalAllowances = Math.round(calculatedItems.reduce((sum, i) => sum + i.allowancesAmount, 0) * 100) / 100;
  const totalBonuses = Math.round(calculatedItems.reduce((sum, i) => sum + i.bonusesAmount, 0) * 100) / 100;
  const totalOvertime = Math.round(calculatedItems.reduce((sum, i) => sum + i.overtimeAmount, 0) * 100) / 100;
  const totalAbsenceDeductions = Math.round(calculatedItems.reduce((sum, i) => sum + i.absenceAmount, 0) * 100) / 100;
  const totalLateDeductions = Math.round(calculatedItems.reduce((sum, i) => sum + i.lateAmount, 0) * 100) / 100;
  const totalPenalties = Math.round(calculatedItems.reduce((sum, i) => sum + i.penaltiesAmount, 0) * 100) / 100;
  const totalAdvances = Math.round(calculatedItems.reduce((sum, i) => sum + i.advancesAmount, 0) * 100) / 100;
  const totalLoanInstallments = Math.round(calculatedItems.reduce((sum, i) => sum + i.loansAmount, 0) * 100) / 100;
  const totalEmployeeInsurance = Math.round(calculatedItems.reduce((sum, i) => sum + i.employeeInsuranceAmount, 0) * 100) / 100;
  const totalCompanyInsurance = Math.round(calculatedItems.reduce((sum, i) => sum + i.companyInsuranceAmount, 0) * 100) / 100;
  const totalTax = Math.round(calculatedItems.reduce((sum, i) => sum + i.taxAmount, 0) * 100) / 100;

  // 12. Transactional save: delete old items if existingRun, then create/update PayrollRun
  return prisma.$transaction(
    async (tx) => {
      let runId: string;

    if (existingRun) {
      runId = existingRun.id;
      // Delete old components and items for clean recalculation (Idempotency)
      await tx.payrollItemComponent.deleteMany({
        where: { PayrollItem: { payrollRunId: runId } },
      });
      await tx.payrollItem.deleteMany({
        where: { payrollRunId: runId },
      });

      await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: "CALCULATED",
          totalGross,
          totalDeductions,
          totalNet,
          totalBasic,
          totalAllowances,
          totalBonuses,
          totalOvertime,
          totalAbsenceDeductions,
          totalLateDeductions,
          totalPenalties,
          totalAdvances,
          totalLoanInstallments,
          totalEmployeeInsurance,
          totalCompanyInsurance,
          totalTax,
          employeeCount: calculatedItems.length,
          calculatedAt: new Date(),
          calculatedBy: actorId || null,
        },
      });
    } else {
      const createdRun = await tx.payrollRun.create({
        data: {
          periodId: period.id,
          companyId,
          status: "CALCULATED",
          totalGross,
          totalDeductions,
          totalNet,
          totalBasic,
          totalAllowances,
          totalBonuses,
          totalOvertime,
          totalAbsenceDeductions,
          totalLateDeductions,
          totalPenalties,
          totalAdvances,
          totalLoanInstallments,
          totalEmployeeInsurance,
          totalCompanyInsurance,
          totalTax,
          employeeCount: calculatedItems.length,
          calculatedAt: new Date(),
          calculatedBy: actorId || null,
        },
      });
      runId = createdRun.id;
    }

    // Insert items
    for (const item of calculatedItems) {
      const createdItem = await tx.payrollItem.create({
        data: {
          payrollRunId: runId,
          employeeId: item.employeeId,
          basicSalary: item.basicSalary,
          allowancesAmount: item.allowancesAmount,
          bonusesAmount: item.bonusesAmount,
          overtimeAmount: item.overtimeAmount,
          absenceAmount: item.absenceAmount,
          lateAmount: item.lateAmount,
          penaltiesAmount: item.penaltiesAmount,
          advancesAmount: item.advancesAmount,
          loansAmount: item.loansAmount,
          employeeInsuranceAmount: item.employeeInsuranceAmount,
          companyInsuranceAmount: item.companyInsuranceAmount,
          taxAmount: item.taxAmount,
          totalEarnings: item.totalEarnings,
          totalDeductions: item.totalDeductions,
          grossSalary: item.grossSalary,
          netSalary: item.netSalary,
          workedDays: item.workedDays,
          absentDays: item.absentDays,
          lateDays: item.lateDays,
          overtimeHours: item.overtimeHours,
          flag: item.flag,
          notes: item.notes,
        },
      });

      if (item.components && item.components.length > 0) {
        await tx.payrollItemComponent.createMany({
          data: item.components.map((c) => ({
            payrollItemId: createdItem.id,
            salaryComponentId: c.salaryComponentId || null,
            label: c.label,
            type: c.type,
            amount: c.amount,
          })),
        });
      }
    }

    return tx.payrollRun.findUnique({
      where: { id: runId },
      include: {
        Period: true,
        Items: {
          include: {
            Employee: { select: { id: true, code: true, fullName: true, fullNameAr: true } },
            Components: true,
          },
        },
      },
    });
  },
  { timeout: 45000, maxWait: 15000 }
);
}

export async function approvePayrollRun(runId: string, actorId?: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { Period: true },
  });

  if (!run) throw new Error("كشف الرواتب غير موجود");
  if (run.status !== "CALCULATED" && run.status !== "DRAFT") {
    throw new Error("الكشف ليس في حالة انتظار الاعتماد");
  }

  return prisma.payrollRun.update({
    where: { id: runId },
    data: {
      status: "APPROVED",
      approvedBy: actorId || null,
      approvedAt: new Date(),
    },
    include: { Period: true },
  });
}

export async function lockPayrollRun(runId: string, actorId?: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: {
      Period: true,
      Items: true,
    },
  });

  if (!run) throw new Error("كشف الرواتب غير موجود");
  if (run.status !== "APPROVED") {
    throw new Error("يجب اعتماد كشف الرواتب أولاً قبل القفل والصرف النهائي");
  }

  // 1. Strict Accounting Mapping Validation (Zero hardcoding)
  const validation = await validatePayrollAccountMapping(run.companyId);
  if (!validation.isValid) {
    throw new Error(
      `فشل قفل كشف الرواتب! يجب أولاً تحديد الحسابات المحاسبية المرتبطة في شاشة الإعدادات:\n- ${validation.missingAccounts.join("\n- ")}`
    );
  }

  const { accountIds } = validation;

  return prisma.$transaction(
    async (tx) => {
      // 2. Mark PayrollRun as LOCKED
    const lockedRun = await tx.payrollRun.update({
      where: { id: runId },
      data: {
        status: "LOCKED",
        lockedBy: actorId || null,
        lockedAt: new Date(),
      },
    });

    // 3. Mark Advances as COMPLETED and set payrollItemId
    for (const item of run.Items) {
      await tx.employeeAdvance.updateMany({
        where: {
          employeeId: item.employeeId,
          companyId: run.companyId,
          status: "APPROVED",
          deductMonth: run.Period.month,
          deductYear: run.Period.year,
        },
        data: {
          status: "COMPLETED",
          payrollItemId: item.id,
        },
      });

      // 4. Mark due Loan Installments as PAID and set payrollItemId
      const dueInstallments = await tx.loanInstallment.findMany({
        where: {
          status: "PENDING_PAY",
          dueDate: { lte: run.Period.endDate },
          Loan: { employeeId: item.employeeId, companyId: run.companyId },
        },
      });

      for (const inst of dueInstallments) {
        await tx.loanInstallment.update({
          where: { id: inst.id },
          data: {
            status: "PAID",
            paidDate: new Date(),
            paidMonth: run.Period.month,
            paidYear: run.Period.year,
            payrollItemId: item.id,
          },
        });

        // Check if all installments of this loan are paid
        const remainingInsts = await tx.loanInstallment.count({
          where: { loanId: inst.loanId, status: "PENDING_PAY" },
        });
        if (remainingInsts === 0) {
          await tx.employeeLoan.update({
            where: { id: inst.loanId },
            data: { status: "COMPLETED" },
          });
        }
      }

      // 5. Mark Bonuses as COMPLETED and set payrollItemId
      await tx.employeeBonus.updateMany({
        where: {
          employeeId: item.employeeId,
          companyId: run.companyId,
          status: "APPROVED",
          targetMonth: run.Period.month,
          targetYear: run.Period.year,
        },
        data: {
          status: "COMPLETED",
          payrollItemId: item.id,
        },
      });

      // 6. Mark Penalties as COMPLETED and set payrollItemId
      await tx.employeePenalty.updateMany({
        where: {
          employeeId: item.employeeId,
          companyId: run.companyId,
          status: "APPROVED",
          targetMonth: run.Period.month,
          targetYear: run.Period.year,
        },
        data: {
          status: "COMPLETED",
          payrollItemId: item.id,
        },
      });
    }

    // 7. Create Balanced Journal Entry (القيد المحاسبي المتوازن آلياً)
    const entryNumber = `JV-PAY-${run.Period.year}-${String(run.Period.month).padStart(2, "0")}-${run.id.slice(-4).toUpperCase()}`;
    const description = `استحقاق وصرف رواتب وأجور شهر ${run.Period.month}/${run.Period.year}`;

    // Build journal items with strict mathematical balance:
    // Debits:
    //   - Payroll Expense: totalGross
    //   - Company Insurance Expense: totalCompanyInsurance
    // Credits:
    //   - Salaries Payable (Net): totalNet
    //   - Employee Advances: totalAdvances
    //   - Employee Loans: totalLoanInstallments
    //   - Social Insurance Authority: totalEmployeeInsurance + totalCompanyInsurance
    //   - Tax Authority: totalTax
    //   - Penalties / Lateness / Absence (credited to payroll expense or company clearing to balance gross):
    //     residual = totalPenalties + totalAbsenceDeductions + totalLateDeductions

    const journalItems: Array<{ accountId: string; debit: number; credit: number }> = [];

    // DEBITS:
    journalItems.push({
      accountId: accountIds.payrollExpense!,
      debit: run.totalGross,
      credit: 0,
    });

    if (run.totalCompanyInsurance > 0 && accountIds.socialInsurance) {
      journalItems.push({
        accountId: accountIds.payrollExpense!, // Insurance is part of overall personnel expense
        debit: run.totalCompanyInsurance,
        credit: 0,
      });
    }

    // CREDITS:
    if (run.totalNet > 0 && accountIds.salariesPayable) {
      journalItems.push({
        accountId: accountIds.salariesPayable,
        debit: 0,
        credit: run.totalNet,
      });
    }

    if (run.totalAdvances > 0 && accountIds.advances) {
      journalItems.push({
        accountId: accountIds.advances,
        debit: 0,
        credit: run.totalAdvances,
      });
    }

    if (run.totalLoanInstallments > 0 && accountIds.loans) {
      journalItems.push({
        accountId: accountIds.loans,
        debit: 0,
        credit: run.totalLoanInstallments,
      });
    }

    const totalInsurancePayable = run.totalEmployeeInsurance + run.totalCompanyInsurance;
    if (totalInsurancePayable > 0 && accountIds.socialInsurance) {
      journalItems.push({
        accountId: accountIds.socialInsurance,
        debit: 0,
        credit: totalInsurancePayable,
      });
    }

    if (run.totalTax > 0 && accountIds.taxAuthority) {
      journalItems.push({
        accountId: accountIds.taxAuthority,
        debit: 0,
        credit: run.totalTax,
      });
    }

    // Penalties, absences, and late deductions reduce company payroll expense or credit clearing
    const penaltyAndDeductionsCredit = Math.round(
      (run.totalPenalties + run.totalAbsenceDeductions + run.totalLateDeductions) * 100
    ) / 100;

    if (penaltyAndDeductionsCredit > 0) {
      journalItems.push({
        accountId: accountIds.payrollExpense!, // credit back expense or penalties account
        debit: 0,
        credit: penaltyAndDeductionsCredit,
      });
    }

    // Verify balance
    const totalDebit = Math.round(journalItems.reduce((sum, j) => sum + j.debit, 0) * 100) / 100;
    const totalCredit = Math.round(journalItems.reduce((sum, j) => sum + j.credit, 0) * 100) / 100;

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`القيد المحاسبي غير متوازن! إجمالي المدين (${totalDebit}) لا يتطابق مع إجمالي الدائن (${totalCredit})`);
    }

    const journalEntry = await tx.journalEntry.create({
      data: {
        companyId: run.companyId,
        entryNumber,
        date: new Date(),
        description,
        referenceType: "PayrollRun",
        referenceId: run.id,
        isVerified: true,
        items: {
          create: journalItems.map((j) => ({
            accountId: j.accountId,
            debit: j.debit,
            credit: j.credit,
          })),
        },
      },
    });

    // Link JournalEntry to PayrollRun
    await tx.payrollRun.update({
      where: { id: run.id },
      data: { journalEntryId: journalEntry.id },
    });

    // Log approval
    await tx.approvalLog.create({
      data: {
        userId: actorId || "system",
        action: "LOCK",
        entityType: "PayrollRun",
        entityId: run.id,
        notes: `قفل كشف رواتب شهر ${run.Period.month}/${run.Period.year} مع إنشاء القيد المحاسبي ${entryNumber}`,
      },
    });

    return {
      run: lockedRun,
      journalEntry,
    };
  },
  { timeout: 45000, maxWait: 15000 }
);
}
