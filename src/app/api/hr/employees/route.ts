import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  try {
    const actor = await requireAuth();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const departmentId = searchParams.get("departmentId");
    const status = searchParams.get("status");

    const where: any = {};
    if (actor.companyId) where.companyId = actor.companyId;
    if (departmentId) where.departmentId = departmentId;
    if (status) where.status = status;

    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { fullName: { contains: search, mode: "insensitive" } },
        { fullNameAr: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { nationalId: { contains: search } },
      ];
    }

    const employees = await prisma.employee.findMany({
      where,
      orderBy: { code: "asc" },
      include: {
        JobTitle: { select: { id: true, title: true, titleAr: true } },
        Shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        User: { select: { id: true, email: true, name: true, role: true } },
      },
    });

    return NextResponse.json(employees);
  } catch (error) {
    console.error("GET /api/hr/employees error:", error);
    return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAuth();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const {
      code,
      fingerprintId,
      fullName,
      fullNameAr,
      nationalId,
      phone,
      email,
      hireDate,
      employmentType,
      status,
      baseSalary,
      jobTitleId,
      shiftId,
      userId,
      engineerId,
      notes,
    } = body;

    const companyId = actor.companyId || body.companyId;

    if (!code || !fullName || !hireDate || !companyId) {
      return NextResponse.json(
        { error: "كود الموظف، الاسم الكامل، تاريخ التعيين، والشركة مطلوبة" },
        { status: 400 }
      );
    }

    // Duplicate check
    const existingCode = await prisma.employee.findUnique({ where: { code } });
    if (existingCode) {
      return NextResponse.json({ error: "كود الموظف مكرر" }, { status: 400 });
    }

    if (fingerprintId) {
      const existingFp = await prisma.employee.findUnique({ where: { fingerprintId } });
      if (existingFp) {
        return NextResponse.json({ error: "رقم البصمة مكرر" }, { status: 400 });
      }
    }

    const employee = await prisma.employee.create({
      data: {
        code,
        fingerprintId: fingerprintId || null,
        fullName,
        fullNameAr: fullNameAr || null,
        nationalId: nationalId || null,
        phone: phone || null,
        email: email || null,
        hireDate: new Date(hireDate),
        employmentType: employmentType || "FULL_TIME",
        status: status || "ACTIVE",
        baseSalary: parseFloat(baseSalary || "0"),
        jobTitleId: jobTitleId || null,
        shiftId: shiftId || null,
        companyId,
        userId: userId || null,
        engineerId: engineerId || null,
        notes: notes || null,
      },
      include: {
        JobTitle: { select: { id: true, title: true, titleAr: true } },
        Shift: { select: { id: true, name: true } },
      },
    });

    await prisma.approvalLog.create({
      data: {
        userId: actor.id,
        action: "CREATE",
        entityType: "Employee",
        entityId: employee.id,
        notes: `Created employee ${employee.fullName} (${employee.code})`,
      },
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    console.error("POST /api/hr/employees error:", error);
    return NextResponse.json({ error: "Failed to create employee" }, { status: 500 });
  }
}
