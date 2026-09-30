/**
 * Employee Bonuses & Penalties Service
 *
 * Manages incentives, performance bonuses, administrative penalties,
 * disciplinary deductions, percentage/fixed calculations, and approval flows.
 */
import { prisma } from "@/lib/prisma";
import { getCompanyHrSettings } from "./hr-settings-service";

export interface CreateBonusInput {
  companyId: string;
  employeeId: string;
  title: string;
  bonusType?: string;
  calcType: "FIXED_AMOUNT" | "PERCENTAGE_OF_BASIC";
  percentage?: number;
  amount?: number;
  targetMonth: number;
  targetYear: number;
  reason?: string;
}

export interface CreatePenaltyInput {
  companyId: string;
  employeeId: string;
  title: string;
  penaltyType?: string;
  calcType: "FIXED_AMOUNT" | "DAILY_RATE";
  deductionDays?: number;
  amount?: number;
  targetMonth: number;
  targetYear: number;
  reason: string;
}

// ───────────────────────────────────────────────
// BONUSES (الحوافز والمكافآت)
// ───────────────────────────────────────────────

export async function createBonus(input: CreateBonusInput, actorId?: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
  });

  if (!employee) throw new Error("الموظف غير موجود");
  if (employee.status !== "ACTIVE") throw new Error("الموظف ليس على رأس العمل");

  let calculatedAmount = input.amount || 0;

  if (input.calcType === "PERCENTAGE_OF_BASIC") {
    if (!input.percentage || input.percentage <= 0) {
      throw new Error("نسبة الحافز يجب أن تكون أكبر من صفر");
    }
    calculatedAmount = Math.round(((employee.baseSalary * input.percentage) / 100) * 100) / 100;
  } else {
    if (calculatedAmount <= 0) {
      throw new Error("مبلغ الحافز يجب أن يكون أكبر من صفر");
    }
  }

  return prisma.employeeBonus.create({
    data: {
      companyId: input.companyId,
      employeeId: input.employeeId,
      title: input.title,
      bonusType: input.bonusType || "PERFORMANCE",
      calcType: input.calcType,
      percentage: input.percentage || null,
      amount: calculatedAmount,
      targetMonth: input.targetMonth,
      targetYear: input.targetYear,
      reason: input.reason || null,
      status: "PENDING",
    },
    include: { Employee: true },
  });
}

export async function approveBonus(bonusId: string, approvedBy: string) {
  const bonus = await prisma.employeeBonus.findUnique({ where: { id: bonusId } });
  if (!bonus) throw new Error("الحافز غير موجود");
  if (bonus.status !== "PENDING") throw new Error("لا يمكن اعتماد حافز غير معلق");

  return prisma.employeeBonus.update({
    where: { id: bonusId },
    data: {
      status: "APPROVED",
      approvedBy,
      approvedAt: new Date(),
    },
  });
}

export async function rejectBonus(bonusId: string, rejectedBy: string, reason?: string) {
  const bonus = await prisma.employeeBonus.findUnique({ where: { id: bonusId } });
  if (!bonus) throw new Error("الحافز غير موجود");
  if (bonus.status !== "PENDING") throw new Error("لا يمكن رفض حافز تمت مراجعته مسبقاً");

  return prisma.employeeBonus.update({
    where: { id: bonusId },
    data: {
      status: "REJECTED",
      approvedBy: rejectedBy,
      approvedAt: new Date(),
      reason: reason ? `${bonus.reason || ""} [سبب الرفض: ${reason}]`.trim() : bonus.reason,
    },
  });
}

export async function getBonuses(
  companyId: string,
  filters: { employeeId?: string; month?: number; year?: number; status?: string }
) {
  const where: any = { companyId };
  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.month) where.targetMonth = filters.month;
  if (filters.year) where.targetYear = filters.year;
  if (filters.status) where.status = filters.status;

  return prisma.employeeBonus.findMany({
    where,
    orderBy: [{ targetYear: "desc" }, { targetMonth: "desc" }, { createdAt: "desc" }],
    include: {
      Employee: {
        select: { id: true, code: true, fullName: true, fullNameAr: true, baseSalary: true },
      },
    },
  });
}

// ───────────────────────────────────────────────
// PENALTIES (الخصومات والجزاءات)
// ───────────────────────────────────────────────

export async function createPenalty(input: CreatePenaltyInput, actorId?: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
  });

  if (!employee) throw new Error("الموظف غير موجود");
  if (employee.status !== "ACTIVE") throw new Error("الموظف ليس على رأس العمل");

  let calculatedAmount = input.amount || 0;

  if (input.calcType === "DAILY_RATE") {
    if (!input.deductionDays || input.deductionDays <= 0) {
      throw new Error("عدد أيام الخصم يجب أن يكون أكبر من صفر");
    }
    const settings = await getCompanyHrSettings(input.companyId);
    const dailyRate = settings.standardWorkingDays > 0 ? employee.baseSalary / settings.standardWorkingDays : 0;
    calculatedAmount = Math.round(dailyRate * input.deductionDays * 100) / 100;
  } else {
    if (calculatedAmount <= 0) {
      throw new Error("مبلغ الخصم يجب أن يكون أكبر من صفر");
    }
  }

  return prisma.employeePenalty.create({
    data: {
      companyId: input.companyId,
      employeeId: input.employeeId,
      title: input.title,
      penaltyType: input.penaltyType || "ADMINISTRATIVE",
      calcType: input.calcType,
      deductionDays: input.deductionDays || null,
      amount: calculatedAmount,
      targetMonth: input.targetMonth,
      targetYear: input.targetYear,
      reason: input.reason,
      status: "PENDING",
    },
    include: { Employee: true },
  });
}

export async function approvePenalty(penaltyId: string, approvedBy: string) {
  const penalty = await prisma.employeePenalty.findUnique({ where: { id: penaltyId } });
  if (!penalty) throw new Error("الجزاء غير موجود");
  if (penalty.status !== "PENDING") throw new Error("لا يمكن اعتماد جزاء غير معلق");

  return prisma.employeePenalty.update({
    where: { id: penaltyId },
    data: {
      status: "APPROVED",
      approvedBy,
      approvedAt: new Date(),
    },
  });
}

export async function rejectPenalty(penaltyId: string, rejectedBy: string, reason?: string) {
  const penalty = await prisma.employeePenalty.findUnique({ where: { id: penaltyId } });
  if (!penalty) throw new Error("الجزاء غير موجود");
  if (penalty.status !== "PENDING") throw new Error("لا يمكن إلغاء أو رفض جزاء تمت مراجعته مسبقاً");

  return prisma.employeePenalty.update({
    where: { id: penaltyId },
    data: {
      status: "REJECTED",
      approvedBy: rejectedBy,
      approvedAt: new Date(),
      reason: reason ? `${penalty.reason} [سبب الرفض: ${reason}]` : penalty.reason,
    },
  });
}

export async function getPenalties(
  companyId: string,
  filters: { employeeId?: string; month?: number; year?: number; status?: string }
) {
  const where: any = { companyId };
  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.month) where.targetMonth = filters.month;
  if (filters.year) where.targetYear = filters.year;
  if (filters.status) where.status = filters.status;

  return prisma.employeePenalty.findMany({
    where,
    orderBy: [{ targetYear: "desc" }, { targetMonth: "desc" }, { createdAt: "desc" }],
    include: {
      Employee: {
        select: { id: true, code: true, fullName: true, fullNameAr: true, baseSalary: true },
      },
    },
  });
}
