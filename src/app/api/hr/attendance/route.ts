import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  try {
    const actor = await requirePageAccess("hrAttendance");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");
    const employeeId = searchParams.get("employeeId");
    const departmentId = searchParams.get("departmentId");

    const where: any = {};
    if (actor.companyId) where.Employee = { companyId: actor.companyId };
    if (employeeId) where.employeeId = employeeId;
    if (departmentId) where.Employee = { ...where.Employee, departmentId };

    if (dateStr) {
      const d = new Date(dateStr);
      const startOfDay = new Date(d.setHours(0, 0, 0, 0));
      const endOfDay = new Date(d.setHours(23, 59, 59, 999));
      where.date = { gte: startOfDay, lte: endOfDay };
    } else if (startDateStr && endDateStr) {
      where.date = {
        gte: new Date(startDateStr),
        lte: new Date(endDateStr),
      };
    }

    const records = await prisma.dailyAttendanceRecord.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        Employee: {
          select: {
            id: true,
            code: true,
            fullName: true,
            fullNameAr: true,
            Department: { select: { id: true, name: true, nameAr: true } },
          },
        },
      },
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error("GET /api/hr/attendance error:", error);
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePageAccess("hrAttendance");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const body = await request.json();
    const { employeeId, date: dateStr, firstIn, lastOut, status, notes } = body;

    if (!employeeId || !dateStr) {
      return NextResponse.json({ error: "employeeId and date are required" }, { status: 400 });
    }

    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);

    const record = await prisma.dailyAttendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date } },
      update: {
        firstIn: firstIn ? new Date(firstIn) : undefined,
        lastOut: lastOut ? new Date(lastOut) : undefined,
        status: status || "PRESENT",
        isManual: true,
        notes: notes || null,
      },
      create: {
        employeeId,
        date,
        firstIn: firstIn ? new Date(firstIn) : null,
        lastOut: lastOut ? new Date(lastOut) : null,
        status: status || "PRESENT",
        isManual: true,
        notes: notes || null,
      },
      include: {
        Employee: {
          select: { id: true, code: true, fullName: true, fullNameAr: true },
        },
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("POST /api/hr/attendance error:", error);
    return NextResponse.json({ error: "Failed to create/update attendance" }, { status: 500 });
  }
}
