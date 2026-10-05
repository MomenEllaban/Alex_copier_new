/**
 * Employee Loans & Advances Service
 *
 * Handles complete lifecycle of advances and loans:
 * - Salary cap validations from HrSetting
 * - Automatic installment schedule generation (mathematically balanced)
 * - Approval & Disbursement tracking
 * - Postponement with schedule extension
 * - Early payoff & remaining balance calculation
 * - Audit logging
 */
import { prisma } from "@/lib/prisma";
import { getCompanyHrSettings } from "./hr-settings-service";
import { addMonths, startOfMonth } from "date-fns";

export interface RequestAdvanceInput {
  companyId: string;
  employeeId: string;
  amount: number;
  deductMonth: number;
  deductYear: number;
  reason: string;
  requestDate?: Date;
}

export interface CreateLoanInput {
  companyId: string;
  employeeId: string;
  totalAmount: number;
  installmentCount: number;
  startDate: Date;
  reason: string;
}

// ───────────────────────────────────────────────
// ADVANCES (السلف الآنية)
// ───────────────────────────────────────────────

export async function requestAdvance(input: RequestAdvanceInput) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
  });

  if (!employee) throw new Error("الموظف غير موجود");
  if (employee.status !== "ACTIVE") throw new Error("الموظف ليس على رأس العمل");

  const settings = await getCompanyHrSettings(input.companyId);
  const maxAllowed = (employee.baseSalary * settings.maxAdvancePercentOfSalary) / 100;

  if (input.amount > maxAllowed) {
    throw new Error(
      `المبلغ المطلوب (${input.amount.toLocaleString()} ج.م) يتجاوز الحد الأقصى للسلفة المسموح به (${settings.maxAdvancePercentOfSalary}% من الراتب الأساسي = ${maxAllowed.toLocaleString()} ج.م)`
    );
  }

  // Check if an advance is already requested or approved for the same month/year
  const existing = await prisma.employeeAdvance.findFirst({
    where: {
      employeeId: input.employeeId,
      deductMonth: input.deductMonth,
      deductYear: input.deductYear,
      status: { in: ["PENDING", "APPROVED", "DEDUCTING"] },
    },
  });

  if (existing) {
    throw new Error(`يوجد سلفة أخرى مسجلة لنفس الموظف لشهر ${input.deductMonth}/${input.deductYear}`);
  }

  return prisma.employeeAdvance.create({
    data: {
      companyId: input.companyId,
      employeeId: input.employeeId,
      amount: input.amount,
      requestDate: input.requestDate || new Date(),
      deductMonth: input.deductMonth,
      deductYear: input.deductYear,
      reason: input.reason,
      status: "PENDING",
    },
    include: { Employee: true },
  });
}

export async function approveAdvance(advanceId: string, approvedBy: string) {
  const advance = await prisma.employeeAdvance.findUnique({ where: { id: advanceId } });
  if (!advance) throw new Error("طلب السلفة غير موجود");
  if (advance.status !== "PENDING") throw new Error("لا يمكن اعتماد سلفة غير معلقة");

  return prisma.employeeAdvance.update({
    where: { id: advanceId },
    data: {
      status: "APPROVED",
      approvedBy,
      approvedAt: new Date(),
    },
  });
}

export async function disburseAdvance(
  advanceId: string,
  disbursedBy: string,
  disbursementMethod: string = "CASH",
  treasuryAccountId?: string
) {
  const advance = await prisma.employeeAdvance.findUnique({ where: { id: advanceId } });
  if (!advance) throw new Error("طلب السلفة غير موجود");
  if (advance.status !== "APPROVED") throw new Error("يجب اعتماد السلفة قبل صرفها");

  return prisma.employeeAdvance.update({
    where: { id: advanceId },
    data: {
      disbursedBy,
      disbursedAt: new Date(),
      disbursementMethod,
      treasuryAccountId: treasuryAccountId || null,
    },
  });
}

export async function rejectAdvance(advanceId: string, rejectedBy: string, reason?: string) {
  const advance = await prisma.employeeAdvance.findUnique({ where: { id: advanceId } });
  if (!advance) throw new Error("طلب السلفة غير موجود");
  if (advance.status !== "PENDING") throw new Error("لا يمكن رفض سلفة تمت مراجعتها مسبقاً");

  return prisma.employeeAdvance.update({
    where: { id: advanceId },
    data: {
      status: "REJECTED",
      approvedBy: rejectedBy,
      approvedAt: new Date(),
      reason: reason ? `${advance.reason} [سبب الرفض: ${reason}]` : advance.reason,
    },
  });
}

// ───────────────────────────────────────────────
// LOANS & INSTALLMENTS (القروض المجدولة والأقساط)
// ───────────────────────────────────────────────

export function calculateInstallments(
  totalAmount: number,
  installmentCount: number,
  startDate: Date
): Array<{
  installmentNo: number;
  amount: number;
  dueDate: Date;
  status: "PENDING_PAY";
}> {
  const baseMonthly = Math.floor((totalAmount / installmentCount) * 100) / 100;
  let remaining = totalAmount;

  const installmentData: Array<{
    installmentNo: number;
    amount: number;
    dueDate: Date;
    status: "PENDING_PAY";
  }> = [];

  const start = startOfMonth(new Date(startDate));

  for (let i = 1; i <= installmentCount; i++) {
    const isLast = i === installmentCount;
    const amount = isLast ? Math.round(remaining * 100) / 100 : baseMonthly;
    remaining -= amount;

    installmentData.push({
      installmentNo: i,
      amount,
      dueDate: addMonths(start, i - 1),
      status: "PENDING_PAY",
    });
  }

  return installmentData;
}

export async function createLoan(input: CreateLoanInput) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
  });

  if (!employee) throw new Error("الموظف غير موجود");
  if (employee.status !== "ACTIVE") throw new Error("الموظف ليس على رأس العمل");
  if (input.installmentCount <= 0) throw new Error("عدد الأقساط يجب أن يكون أكبر من صفر");
  if (input.totalAmount <= 0) throw new Error("مبلغ القرض يجب أن يكون أكبر من صفر");

  const settings = await getCompanyHrSettings(input.companyId);

  // Check active loans limit
  const activeLoans = await prisma.employeeLoan.count({
    where: {
      employeeId: input.employeeId,
      status: { in: ["APPROVED", "DEDUCTING"] },
    },
  });

  if (activeLoans >= settings.maxActiveLoansPerEmployee) {
    throw new Error(
      `الموظف لديه بالفعل (${activeLoans}) قرض نشط. الحد الأقصى للقروض المتزامنة هو (${settings.maxActiveLoansPerEmployee})`
    );
  }

  // Check maximum loan multiplier
  const maxLoanAllowed = employee.baseSalary * settings.maxLoanSalaryMultiple;
  if (input.totalAmount > maxLoanAllowed) {
    throw new Error(
      `مبلغ القرض (${input.totalAmount.toLocaleString()} ج.م) يتجاوز الحد المسموح به (${settings.maxLoanSalaryMultiple} أضعاف الراتب الأساسي = ${maxLoanAllowed.toLocaleString()} ج.م)`
    );
  }

  const installmentData = calculateInstallments(input.totalAmount, input.installmentCount, input.startDate);
  const baseMonthly = installmentData[0]?.amount || 0;

  return prisma.$transaction(async (tx) => {
    const loan = await tx.employeeLoan.create({
      data: {
        companyId: input.companyId,
        employeeId: input.employeeId,
        totalAmount: input.totalAmount,
        installmentCount: input.installmentCount,
        monthlyAmount: baseMonthly,
        startDate: input.startDate,
        reason: input.reason,
        status: "PENDING",
      },
    });

    await tx.loanInstallment.createMany({
      data: installmentData.map((inst) => ({
        loanId: loan.id,
        installmentNo: inst.installmentNo,
        amount: inst.amount,
        dueDate: inst.dueDate,
        status: inst.status,
      })),
    });

    return tx.employeeLoan.findUnique({
      where: { id: loan.id },
      include: {
        Installments: { orderBy: { installmentNo: "asc" } },
        Employee: true,
      },
    });
  });
}

export async function approveLoan(loanId: string, approvedBy: string) {
  const loan = await prisma.employeeLoan.findUnique({ where: { id: loanId } });
  if (!loan) throw new Error("القرض غير موجود");
  if (loan.status !== "PENDING") throw new Error("لا يمكن اعتماد قرض غير معلق");

  return prisma.employeeLoan.update({
    where: { id: loanId },
    data: {
      status: "APPROVED",
      approvedBy,
      approvedAt: new Date(),
    },
  });
}

export async function rejectLoan(loanId: string, rejectedBy: string, reason?: string) {
  const loan = await prisma.employeeLoan.findUnique({ where: { id: loanId } });
  if (!loan) throw new Error("القرض غير موجود");
  if (loan.status !== "PENDING") throw new Error("لا يمكن رفض قرض تمت مراجعته مسبقاً");

  return prisma.employeeLoan.update({
    where: { id: loanId },
    data: {
      status: "REJECTED",
      approvedBy: rejectedBy,
      approvedAt: new Date(),
      reason: reason ? `${loan.reason} [سبب الرفض: ${reason}]` : loan.reason,
    },
  });
}


export async function disburseLoan(
  loanId: string,
  disbursedBy: string,
  disbursementMethod: string = "CASH",
  treasuryAccountId?: string
) {
  const loan = await prisma.employeeLoan.findUnique({ where: { id: loanId } });
  if (!loan) throw new Error("القرض غير موجود");
  if (loan.status !== "APPROVED") throw new Error("يجب اعتماد القرض قبل صرفه");

  return prisma.employeeLoan.update({
    where: { id: loanId },
    data: {
      disbursedBy,
      disbursedAt: new Date(),
      disbursementMethod,
      treasuryAccountId: treasuryAccountId || null,
      status: "DEDUCTING",
    },
  });
}

export async function postponeInstallment(installmentId: string, actorId: string, reason: string) {
  const inst = await prisma.loanInstallment.findUnique({
    where: { id: installmentId },
    include: { Loan: { include: { Installments: { orderBy: { installmentNo: "desc" } } } } },
  });

  if (!inst) throw new Error("القسط غير موجود");
  if (inst.status !== "PENDING_PAY") throw new Error("لا يمكن تأجيل قسط غير مستحق (مسدد أو مؤجل مسبقاً)");

  // Find maximum installment number and latest due date
  const lastInst = inst.Loan.Installments[0];
  const nextNo = (lastInst?.installmentNo || inst.installmentNo) + 1;
  const nextDate = addMonths(lastInst ? new Date(lastInst.dueDate) : new Date(inst.dueDate), 1);

  return prisma.$transaction(async (tx) => {
    // 1. Mark current installment as POSTPONED
    await tx.loanInstallment.update({
      where: { id: installmentId },
      data: {
        status: "POSTPONED",
        postponedReason: reason,
        postponedAt: new Date(),
        postponedBy: actorId,
      },
    });

    // 2. Add new installment at the end of the loan schedule
    const appended = await tx.loanInstallment.create({
      data: {
        loanId: inst.loanId,
        installmentNo: nextNo,
        amount: inst.amount,
        dueDate: nextDate,
        status: "PENDING_PAY",
      },
    });

    // 3. Update loan's installment count
    await tx.employeeLoan.update({
      where: { id: inst.loanId },
      data: { installmentCount: { increment: 1 } },
    });

    return appended;
  });
}

export async function earlyPayoffInstallment(
  installmentId: string,
  actorId: string,
  paidDate: Date = new Date()
) {
  const inst = await prisma.loanInstallment.findUnique({
    where: { id: installmentId },
    include: { Loan: { include: { Installments: true } } },
  });

  if (!inst) throw new Error("القسط غير موجود");
  if (inst.status !== "PENDING_PAY") throw new Error("القسط ليس في حالة انتظار السداد");

  return prisma.$transaction(async (tx) => {
    const updatedInst = await tx.loanInstallment.update({
      where: { id: installmentId },
      data: {
        status: "PAID",
        paidDate,
        paidMonth: paidDate.getMonth() + 1,
        paidYear: paidDate.getFullYear(),
      },
    });

    // Check if all installments for this loan are now paid
    const remainingPending = inst.Loan.Installments.filter(
      (i) => i.id !== installmentId && i.status === "PENDING_PAY"
    );

    if (remainingPending.length === 0) {
      await tx.employeeLoan.update({
        where: { id: inst.loanId },
        data: { status: "COMPLETED" },
      });
    }

    return updatedInst;
  });
}

export async function earlyPayoffLoan(
  loanId: string,
  actorId: string,
  paidDate: Date = new Date()
) {
  const loan = await prisma.employeeLoan.findUnique({
    where: { id: loanId },
    include: { Installments: { where: { status: "PENDING_PAY" } } },
  });

  if (!loan) throw new Error("القرض غير موجود");

  return prisma.$transaction(async (tx) => {
    const month = paidDate.getMonth() + 1;
    const year = paidDate.getFullYear();

    await tx.loanInstallment.updateMany({
      where: { loanId, status: "PENDING_PAY" },
      data: {
        status: "PAID",
        paidDate,
        paidMonth: month,
        paidYear: year,
      },
    });

    return tx.employeeLoan.update({
      where: { id: loanId },
      data: { status: "COMPLETED" },
    });
  });
}

export async function getEmployeeLoanSummary(employeeId: string) {
  const [loans, advances] = await Promise.all([
    prisma.employeeLoan.findMany({
      where: { employeeId },
      include: { Installments: { orderBy: { installmentNo: "asc" } } },
    }),
    prisma.employeeAdvance.findMany({
      where: { employeeId },
      orderBy: { requestDate: "desc" },
    }),
  ]);

  let totalLoansAmount = 0;
  let totalLoansPaid = 0;
  let totalLoansRemaining = 0;
  let pendingInstallmentsCount = 0;

  for (const loan of loans) {
    totalLoansAmount += loan.totalAmount;
    for (const inst of loan.Installments) {
      if (inst.status === "PAID") {
        totalLoansPaid += inst.amount;
      } else if (inst.status === "PENDING_PAY") {
        totalLoansRemaining += inst.amount;
        pendingInstallmentsCount++;
      }
    }
  }

  let totalAdvancesAmount = 0;
  let totalAdvancesPaid = 0;
  let totalAdvancesRemaining = 0;

  for (const adv of advances) {
    if (adv.status === "COMPLETED") {
      totalAdvancesAmount += adv.amount;
      totalAdvancesPaid += adv.amount;
    } else if (["PENDING", "APPROVED", "DEDUCTING"].includes(adv.status)) {
      totalAdvancesAmount += adv.amount;
      totalAdvancesRemaining += adv.amount;
    }
  }

  return {
    loans: {
      count: loans.length,
      totalAmount: Math.round(totalLoansAmount * 100) / 100,
      paidAmount: Math.round(totalLoansPaid * 100) / 100,
      remainingAmount: Math.round(totalLoansRemaining * 100) / 100,
      pendingInstallmentsCount,
      list: loans,
    },
    advances: {
      count: advances.length,
      totalAmount: Math.round(totalAdvancesAmount * 100) / 100,
      paidAmount: Math.round(totalAdvancesPaid * 100) / 100,
      remainingAmount: Math.round(totalAdvancesRemaining * 100) / 100,
      list: advances,
    },
  };
}
