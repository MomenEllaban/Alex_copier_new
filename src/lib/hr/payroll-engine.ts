/**
 * Payroll Calculation Engine
 *
 * Centralized payroll calculation:
 * - Loads employee salary components
 * - Calculates gross = basic + allowances + overtime + bonuses
 * - Calculates deductions = absences + lates + loans + advances + penalties
 * - Calculates net = gross - deductions
 * - Returns full breakdown for snapshot/audit
 */

export interface PayrollComponentInput {
  id?: string;
  label: string;
  nameAr?: string;
  type: "EARNING" | "DEDUCTION";
  amount: number;
  salaryComponentId?: string | null;
}

export interface AttendanceSummary {
  workedDays: number;
  absentDays: number;
  lateDays: number;
  totalLateMinutes: number;
  totalEarlyLeaveMinutes: number;
  totalOvertimeMinutes: number;
  totalWorkedMinutes: number;
}

export interface PayrollCalcInput {
  employeeId: string;
  employeeName: string;
  basicSalary: number;
  salaryComponents: PayrollComponentInput[];
  attendance: AttendanceSummary;
  approvedOvertimeHours: number;
  overtimeMultiplier: number;
  approvedBonuses: Array<{ amount: number; reason?: string }>;
  approvedDeductions: Array<{ amount: number; reason?: string; type: string }>;
  loanInstallmentDue: number;
  advanceDeductionDue: number;
  contractExpired: boolean;
  isActive: boolean;
}

export interface PayrollCalcResult {
  employeeId: string;
  basicSalary: number;
  totalEarnings: number;
  totalDeductions: number;
  grossSalary: number;
  netSalary: number;
  workedDays: number;
  absentDays: number;
  lateDays: number;
  overtimeHours: number;
  components: PayrollComponentInput[];
  flag: PayrollItemFlagType;
  warnings: string[];
}

export type PayrollItemFlagType =
  | "NONE"
  | "MISSING_ATTENDANCE"
  | "HIGH_OVERTIME"
  | "NEGATIVE_NET"
  | "MISSING_SALARY"
  | "CONTRACT_EXPIRED"
  | "INACTIVE_EMPLOYEE";

/**
 * Calculate daily salary from monthly salary.
 */
export function dailySalary(monthlySalary: number, daysInMonth: number = 30): number {
  return daysInMonth > 0 ? monthlySalary / daysInMonth : 0;
}

/**
 * Calculate hourly salary from monthly salary.
 */
export function hourlySalary(monthlySalary: number, daysInMonth: number = 30, hoursPerDay: number = 8): number {
  return daysInMonth > 0 && hoursPerDay > 0 ? monthlySalary / daysInMonth / hoursPerDay : 0;
}

/**
 * Main payroll calculation for a single employee.
 */
export function calculateEmployeePayroll(input: PayrollCalcInput): PayrollCalcResult {
  const warnings: string[] = [];
  const components: PayrollComponentInput[] = [];
  let flag: PayrollItemFlagType = "NONE";

  // Check for anomalies
  if (!input.isActive) {
    flag = "INACTIVE_EMPLOYEE";
    warnings.push("Employee is not active");
  }
  if (input.contractExpired) {
    flag = "CONTRACT_EXPIRED";
    warnings.push("Employee contract has expired");
  }
  if (input.basicSalary <= 0) {
    flag = "MISSING_SALARY";
    warnings.push("No basic salary defined");
  }

  // ─── EARNINGS ───────────────────────────────
  let totalEarnings = 0;

  // 1. Basic salary
  components.push({
    label: "Basic Salary",
    type: "EARNING",
    amount: input.basicSalary,
  });
  totalEarnings += input.basicSalary;

  // 2. Salary component earnings (allowances, etc.)
  for (const comp of input.salaryComponents) {
    if (comp.type === "EARNING") {
      components.push(comp);
      totalEarnings += comp.amount;
    }
  }

  // 3. Overtime
  const hourlyRate = hourlySalary(input.basicSalary);
  const overtimeAmount = input.approvedOvertimeHours * hourlyRate * input.overtimeMultiplier;
  if (overtimeAmount > 0) {
    components.push({
      label: "Overtime",
      type: "EARNING",
      amount: Math.round(overtimeAmount * 100) / 100,
    });
    totalEarnings += overtimeAmount;

    // Flag high overtime (> 60 hours)
    if (input.approvedOvertimeHours > 60) {
      if (flag === "NONE") flag = "HIGH_OVERTIME";
      warnings.push(`High overtime: ${input.approvedOvertimeHours} hours`);
    }
  }

  // 4. Bonuses
  for (const bonus of input.approvedBonuses) {
    components.push({
      label: bonus.reason || "Bonus",
      type: "EARNING",
      amount: bonus.amount,
    });
    totalEarnings += bonus.amount;
  }

  const grossSalary = totalEarnings;

  // ─── DEDUCTIONS ─────────────────────────────
  let totalDeductions = 0;

  // 1. Salary component deductions
  for (const comp of input.salaryComponents) {
    if (comp.type === "DEDUCTION") {
      components.push(comp);
      totalDeductions += comp.amount;
    }
  }

  // 2. Absence deductions (full daily salary per absent day)
  if (input.attendance.absentDays > 0) {
    const absenceDeduction = input.attendance.absentDays * dailySalary(input.basicSalary);
    components.push({
      label: "Absence Deduction",
      type: "DEDUCTION",
      amount: Math.round(absenceDeduction * 100) / 100,
    });
    totalDeductions += absenceDeduction;
  }

  // 3. Late deductions (configurable — by default proportional)
  if (input.attendance.totalLateMinutes > 0) {
    const minuteRate = hourlySalary(input.basicSalary) / 60;
    const lateDeduction = input.attendance.totalLateMinutes * minuteRate;
    if (lateDeduction > 0) {
      components.push({
        label: "Late Deduction",
        type: "DEDUCTION",
        amount: Math.round(lateDeduction * 100) / 100,
      });
      totalDeductions += lateDeduction;
    }
  }

  // 4. Manual deductions (penalties, etc.)
  for (const ded of input.approvedDeductions) {
    components.push({
      label: ded.reason || ded.type || "Deduction",
      type: "DEDUCTION",
      amount: ded.amount,
    });
    totalDeductions += ded.amount;
  }

  // 5. Loan installment
  if (input.loanInstallmentDue > 0) {
    components.push({
      label: "Loan Installment",
      type: "DEDUCTION",
      amount: input.loanInstallmentDue,
    });
    totalDeductions += input.loanInstallmentDue;
  }

  // 6. Advance deduction
  if (input.advanceDeductionDue > 0) {
    components.push({
      label: "Advance Deduction",
      type: "DEDUCTION",
      amount: input.advanceDeductionDue,
    });
    totalDeductions += input.advanceDeductionDue;
  }

  const netSalary = grossSalary - totalDeductions;

  // Flag negative net
  if (netSalary < 0) {
    if (flag === "NONE") flag = "NEGATIVE_NET";
    warnings.push(`Negative net salary: ${netSalary.toFixed(2)}`);
  }

  // Flag missing attendance data
  if (input.attendance.workedDays === 0 && input.attendance.absentDays === 0) {
    if (flag === "NONE") flag = "MISSING_ATTENDANCE";
    warnings.push("No attendance data found for this period");
  }

  return {
    employeeId: input.employeeId,
    basicSalary: input.basicSalary,
    totalEarnings: Math.round(totalEarnings * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    grossSalary: Math.round(grossSalary * 100) / 100,
    netSalary: Math.round(netSalary * 100) / 100,
    workedDays: input.attendance.workedDays,
    absentDays: input.attendance.absentDays,
    lateDays: input.attendance.lateDays,
    overtimeHours: input.approvedOvertimeHours,
    components,
    flag,
    warnings,
  };
}

/**
 * Summarize a payroll run from individual results.
 */
export function summarizePayrollRun(results: PayrollCalcResult[]): {
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount: number;
  flaggedCount: number;
} {
  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  let flaggedCount = 0;

  for (const r of results) {
    totalGross += r.grossSalary;
    totalDeductions += r.totalDeductions;
    totalNet += r.netSalary;
    if (r.flag !== "NONE") flaggedCount++;
  }

  return {
    totalGross: Math.round(totalGross * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    totalNet: Math.round(totalNet * 100) / 100,
    employeeCount: results.length,
    flaggedCount,
  };
}
