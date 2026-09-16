import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { calculateEmployeePayroll, summarizePayrollRun, type PayrollCalcInput, type PayrollComponentInput } from "@/lib/hr/payroll-engine";
import { notifyPayrollReady, notifyPayrollApproved } from "@/lib/hr/hr-notifications";
import { PayrollItemFlag } from "@/generated/prisma/client";

export async function GET(request: Request) {
  try {
    const actor = await requireAuth();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get("month");
    const yearStr = searchParams.get("year");

    const where: any = {};
    if (actor.companyId) where.companyId = actor.companyId;
    if (monthStr && yearStr) {
      where.Period = {
        month: parseInt(monthStr),
        year: parseInt(yearStr),
      };
    }

    const runs = await prisma.payrollRun.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        Period: true,
        _count: { select: { Items: true } },
      },
    });

    return NextResponse.json(runs);
  } catch (error) {
    console.error("GET /api/hr/payroll error:", error);
    return NextResponse.json({ error: "Failed to fetch payroll runs" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAuth();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { action, companyId: requestedCompanyId, month, year } = body;
    const companyId = actor.companyId || requestedCompanyId;
    const actorId = actor.id;

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    // ─── CALCULATE ────────────────────────────────
    if (action === "calculate") {
      if (!month || !year) {
        return NextResponse.json({ error: "month and year are required" }, { status: 400 });
      }

      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0);

      // Find or create payroll period
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

      // Load active employees
      const employees = await prisma.employee.findMany({
        where: { companyId, status: "ACTIVE" },
        include: {
          SalaryComponents: {
            where: { isActive: true },
            include: { SalaryComponent: true },
          },
        },
      });

      // Attendance records for the period
      const attendanceRecords = await prisma.dailyAttendanceRecord.findMany({
        where: {
          date: { gte: periodStart, lte: periodEnd },
          Employee: { companyId },
        },
      });

      // Loan installments due
      const loanInstallments = await prisma.loanInstallment.findMany({
        where: {
          status: "PENDING_PAY",
          dueDate: { lte: periodEnd },
          Loan: { Employee: { companyId } },
        },
        include: { Loan: { select: { employeeId: true } } },
      });

      // Employee advances for this month/year
      const advances = await prisma.employeeAdvance.findMany({
        where: {
          Employee: { companyId },
          status: "APPROVED",
          deductMonth: month,
          deductYear: year,
        },
      });

      // Calculate for each employee
      const results = employees.map((emp) => {
        const empAttendance = attendanceRecords.filter((a) => a.employeeId === emp.id);
        const empLoanInstallments = loanInstallments.filter((li) => li.Loan.employeeId === emp.id);
        const empAdvances = advances.filter((a) => a.employeeId === emp.id);

        const workedDays = empAttendance.filter((a) => ["PRESENT", "LATE", "EARLY_LEAVE"].includes(a.status)).length;
        const absentDays = empAttendance.filter((a) => a.status === "ABSENT").length;
        const lateDays = empAttendance.filter((a) => a.status === "LATE").length;
        const totalLateMinutes = empAttendance.reduce((sum, a) => sum + (a.lateMinutes || 0), 0);
        const totalEarlyLeaveMinutes = empAttendance.reduce((sum, a) => sum + (a.earlyLeaveMin || 0), 0);
        const totalOvertimeMinutes = empAttendance.reduce((sum, a) => sum + (a.overtimeMin || 0), 0);
        const totalWorkedMinutes = empAttendance.reduce((sum, a) => sum + (a.workedMinutes || 0), 0);

        const salaryComponents: PayrollComponentInput[] = emp.SalaryComponents.map((sc) => ({
          salaryComponentId: sc.salaryComponentId,
          label: sc.SalaryComponent.name,
          nameAr: sc.SalaryComponent.name,
          type: sc.SalaryComponent.type === "DEDUCTION" || sc.SalaryComponent.type === "PENALTY" ? "DEDUCTION" : "EARNING",
          amount: sc.overrideValue ?? sc.SalaryComponent.defaultValue,
        }));

        const input: PayrollCalcInput = {
          employeeId: emp.id,
          employeeName: emp.fullNameAr || emp.fullName,
          basicSalary: emp.baseSalary,
          salaryComponents,
          attendance: {
            workedDays,
            absentDays,
            lateDays,
            totalLateMinutes,
            totalEarlyLeaveMinutes,
            totalOvertimeMinutes,
            totalWorkedMinutes,
          },
          approvedOvertimeHours: totalOvertimeMinutes / 60,
          overtimeMultiplier: 1.5,
          approvedBonuses: [],
          approvedDeductions: [],
          loanInstallmentDue: empLoanInstallments.reduce((sum, li) => sum + li.amount, 0),
          advanceDeductionDue: empAdvances.reduce((sum, a) => sum + a.amount, 0),
          contractExpired: false,
          isActive: emp.status === "ACTIVE",
        };

        return calculateEmployeePayroll(input);
      });

      const summary = summarizePayrollRun(results);

      // Create the run with items
      const payrollRun = await prisma.payrollRun.create({
        data: {
          periodId: period.id,
          companyId,
          status: "CALCULATED",
          totalGross: summary.totalGross,
          totalDeductions: summary.totalDeductions,
          totalNet: summary.totalNet,
          employeeCount: summary.employeeCount,
          calculatedAt: new Date(),
          calculatedBy: actorId,
          Items: {
            create: results.map((r) => ({
              Employee: { connect: { id: r.employeeId } },
              basicSalary: r.basicSalary,
              totalEarnings: r.totalEarnings,
              totalDeductions: r.totalDeductions,
              grossSalary: r.grossSalary,
              netSalary: r.netSalary,
              workedDays: r.workedDays,
              absentDays: r.absentDays,
              lateDays: r.lateDays,
              overtimeHours: r.overtimeHours,
              flag: r.flag as PayrollItemFlag,
              notes: r.warnings.length > 0 ? r.warnings.join("; ") : null,
              Components: {
                create: r.components.map((c) => ({
                  salaryComponentId: c.salaryComponentId || null,
                  label: c.label,
                  type: c.type === "DEDUCTION" ? "DEDUCTION" : "ALLOWANCE",
                  amount: c.amount,
                })),
              },
            })),
          },
        },
        include: {
          Period: true,
          _count: { select: { Items: true } },
        },
      });

      notifyPayrollReady({ month, year, actorId }).catch(() => {});

      return NextResponse.json(payrollRun, { status: 201 });
    }

    // ─── APPROVE ──────────────────────────────────
    if (action === "approve") {
      const { runId } = body;
      if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

      const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { Period: true } });
      if (!run || run.status !== "CALCULATED") {
        return NextResponse.json({ error: "الكشف غير موجود أو غير قابل للاعتماد" }, { status: 400 });
      }

      const updated = await prisma.payrollRun.update({
        where: { id: runId },
        data: { status: "APPROVED", approvedBy: actorId, approvedAt: new Date() },
      });

      notifyPayrollApproved({ month: run.Period.month, year: run.Period.year, actorId }).catch(() => {});

      return NextResponse.json(updated);
    }

    // ─── LOCK ─────────────────────────────────────
    if (action === "lock") {
      const { runId } = body;
      if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

      const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
      if (!run || run.status !== "APPROVED") {
        return NextResponse.json({ error: "يجب اعتماد الكشف أولاً قبل القفل" }, { status: 400 });
      }

      const updated = await prisma.payrollRun.update({
        where: { id: runId },
        data: { status: "LOCKED", lockedBy: actorId, lockedAt: new Date() },
      });

      // Mark advances & loan installments as completed / paid
      const items = await prisma.payrollItem.findMany({ where: { payrollRunId: runId } });
      for (const item of items) {
        await prisma.employeeAdvance.updateMany({
          where: {
            employeeId: item.employeeId,
            status: "APPROVED",
            deductMonth: run.createdAt.getMonth() + 1,
            deductYear: run.createdAt.getFullYear(),
          },
          data: { status: "COMPLETED" },
        });
      }

      await prisma.approvalLog.create({
        data: {
          userId: actorId,
          action: "LOCK",
          entityType: "PayrollRun",
          entityId: runId,
          notes: `Locked payroll run`,
        },
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/hr/payroll error:", error);
    return NextResponse.json({ error: "Failed to process payroll" }, { status: 500 });
  }
}
