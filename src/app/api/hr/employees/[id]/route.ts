import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("hrEmployees");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { id } = await params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
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
    const actor = await requireAction("hrEmployees", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "الموظف غير موجود" }, { status: 404 });
    }

    const nullable = (v: unknown, fallback: string | null | undefined) =>
      v === undefined ? fallback : v === "" || v === null ? null : String(v);

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
        fullNameAr: nullable(body.fullNameAr, existing.fullNameAr),
        hireDate: body.hireDate ? new Date(body.hireDate) : existing.hireDate,
        nationalId: nullable(body.nationalId, existing.nationalId),
        phone: nullable(body.phone, existing.phone),
        email: nullable(body.email, existing.email),
        employmentType: body.employmentType ?? existing.employmentType,
        status: body.status ?? existing.status,
        baseSalary: newBaseSalary,
        jobTitleId: nullable(body.jobTitleId, existing.jobTitleId),
        shiftId: nullable(body.shiftId, existing.shiftId),
        userId: nullable(body.userId, existing.userId),
        engineerId: nullable(body.engineerId, existing.engineerId),
        notes: nullable(body.notes, existing.notes),
        annualLeaveBalance: body.annualLeaveBalance !== undefined ? parseFloat(body.annualLeaveBalance) : existing.annualLeaveBalance,
        sickLeaveBalance: body.sickLeaveBalance !== undefined ? parseFloat(body.sickLeaveBalance) : existing.sickLeaveBalance,
        emergencyLeaveBalance: body.emergencyLeaveBalance !== undefined ? parseFloat(body.emergencyLeaveBalance) : existing.emergencyLeaveBalance,
      },
      include: {
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("hrEmployees", "delete");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { id } = await params;

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "الموظف غير موجود" }, { status: 404 });
    }

    await prisma.employee.delete({ where: { id } });

    await prisma.approvalLog.create({
      data: {
        userId: actor.id,
        action: "DELETE",
        entityType: "Employee",
        entityId: id,
        notes: `Deleted employee ${existing.fullName} (${existing.code})`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/hr/employees/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete employee" }, { status: 500 });
  }
}
