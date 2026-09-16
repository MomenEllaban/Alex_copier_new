import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        Department: { select: { id: true, name: true, nameAr: true } },
        JobTitle: { select: { id: true, title: true, titleAr: true } },
        Shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        User: { select: { id: true, email: true, name: true, role: true } },
        SalaryHistory: { orderBy: { createdAt: "desc" } },
        SalaryComponents: { include: { SalaryComponent: true } },
        TraineeInfo: true,
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "الموظف غير موجود" }, { status: 404 });
    }

    return NextResponse.json(employee);
  } catch (error) {
    console.error("GET /api/hr/employees/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch employee" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "الموظف غير موجود" }, { status: 404 });
    }

    const newBaseSalary = body.baseSalary !== undefined ? parseFloat(body.baseSalary) : existing.baseSalary;

    // Track salary history if baseSalary changed
    if (newBaseSalary !== existing.baseSalary) {
      await prisma.employeeSalaryHistory.create({
        data: {
          employeeId: id,
          oldBaseSalary: existing.baseSalary,
          newBaseSalary,
          effectiveDate: new Date(),
          reason: body.salaryChangeReason || "تعديل الراتب الأساسي",
          changedBy: actor.id,
        },
      });
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        fullName: body.fullName ?? existing.fullName,
        fullNameAr: body.fullNameAr ?? existing.fullNameAr,
        nationalId: body.nationalId ?? existing.nationalId,
        phone: body.phone ?? existing.phone,
        email: body.email ?? existing.email,
        employmentType: body.employmentType ?? existing.employmentType,
        status: body.status ?? existing.status,
        baseSalary: newBaseSalary,
        departmentId: body.departmentId ?? existing.departmentId,
        jobTitleId: body.jobTitleId ?? existing.jobTitleId,
        shiftId: body.shiftId ?? existing.shiftId,
        userId: body.userId ?? existing.userId,
        engineerId: body.engineerId ?? existing.engineerId,
        notes: body.notes ?? existing.notes,
        annualLeaveBalance: body.annualLeaveBalance !== undefined ? parseFloat(body.annualLeaveBalance) : existing.annualLeaveBalance,
        sickLeaveBalance: body.sickLeaveBalance !== undefined ? parseFloat(body.sickLeaveBalance) : existing.sickLeaveBalance,
        emergencyLeaveBalance: body.emergencyLeaveBalance !== undefined ? parseFloat(body.emergencyLeaveBalance) : existing.emergencyLeaveBalance,
      },
      include: {
        Department: { select: { id: true, name: true, nameAr: true } },
        JobTitle: { select: { id: true, title: true, titleAr: true } },
        Shift: { select: { id: true, name: true } },
      },
    });

    await prisma.approvalLog.create({
      data: {
        userId: actor.id,
        action: "UPDATE",
        entityType: "Employee",
        entityId: id,
        notes: `Updated employee ${updated.fullName} (${updated.code})`,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/hr/employees/[id] error:", error);
    return NextResponse.json({ error: "Failed to update employee" }, { status: 500 });
  }
}
