import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import { notifyLeaveRequested, notifyLeaveReviewed } from "@/lib/hr/hr-notifications";

export async function GET(request: Request) {
  try {
    const actor = await requirePageAccess("hrLeaves");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");

    const where: any = {};
    if (actor.companyId) where.Employee = { companyId: actor.companyId };
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    const leaves = await prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        Employee: {
          select: {
            id: true,
            fullName: true,
            fullNameAr: true,
            code: true,
            userId: true,
          },
        },
      },
    });

    return NextResponse.json(leaves);
  } catch (error) {
    console.error("GET /api/hr/leaves error:", error);
    return NextResponse.json({ error: "Failed to fetch leaves" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAction("hrLeaves", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const body = await request.json();
    const { employeeId, category, startDate: startStr, endDate: endStr, reason } = body;

    if (!employeeId || !startStr || !endStr) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Check overlap
    const existing = await prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: ["PENDING", "APPROVED"] },
        OR: [
          { startDate: { lte: endDate }, endDate: { gte: startDate } },
        ],
      },
    });

    if (existing) {
      return NextResponse.json({ error: "يوجد طلب إجازة متداخل مع هذه الفترة" }, { status: 400 });
    }

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        employeeId,
        category: category || "ANNUAL",
        startDate,
        endDate,
        daysCount,
        reason: reason || "",
        status: "PENDING",
      },
      include: {
        Employee: { select: { id: true, fullName: true, fullNameAr: true, userId: true } },
      },
    });

    notifyLeaveRequested({
      employeeId: leaveRequest.employeeId,
      employeeName: leaveRequest.Employee.fullNameAr || leaveRequest.Employee.fullName,
      leaveType: category || "ANNUAL",
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      totalDays: daysCount,
      actorId: actor.id,
    }).catch(() => {});

    return NextResponse.json(leaveRequest, { status: 201 });
  } catch (error) {
    console.error("POST /api/hr/leaves error:", error);
    return NextResponse.json({ error: "Failed to create leave request" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAction("hrLeaves", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const body = await request.json();
    const { id, action, rejectReason } = body;

    if (!id || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        Employee: { select: { id: true, userId: true, fullName: true, fullNameAr: true } },
      },
    });

    if (!leaveRequest || leaveRequest.status !== "PENDING") {
      return NextResponse.json({ error: "طلب الإجازة غير موجود أو تمت مراجعته بالفعل" }, { status: 400 });
    }

    const approved = action === "approve";

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: approved ? "APPROVED" : "REJECTED",
        approvedBy: actor.id,
        approvedAt: new Date(),
        rejectReason: approved ? null : (rejectReason || null),
      },
    });

    // Update Employee leave balance if approved
    if (approved) {
      if (leaveRequest.category === "ANNUAL") {
        await prisma.employee.update({
          where: { id: leaveRequest.employeeId },
          data: { annualLeaveBalance: { decrement: leaveRequest.daysCount } },
        });
      } else if (leaveRequest.category === "SICK") {
        await prisma.employee.update({
          where: { id: leaveRequest.employeeId },
          data: { sickLeaveBalance: { decrement: leaveRequest.daysCount } },
        });
      } else if (leaveRequest.category === "EMERGENCY") {
        await prisma.employee.update({
          where: { id: leaveRequest.employeeId },
          data: { emergencyLeaveBalance: { decrement: leaveRequest.daysCount } },
        });
      }
    }

    if (leaveRequest.Employee.userId) {
      notifyLeaveReviewed({
        employeeUserId: leaveRequest.Employee.userId,
        employeeName: leaveRequest.Employee.fullNameAr || leaveRequest.Employee.fullName,
        approved,
        leaveType: leaveRequest.category,
        reviewerId: actor.id,
      }).catch(() => {});
    }

    await prisma.approvalLog.create({
      data: {
        userId: actor.id,
        action: approved ? "APPROVE_LEAVE" : "REJECT_LEAVE",
        entityType: "LeaveRequest",
        entityId: id,
        notes: rejectReason || null,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/hr/leaves error:", error);
    return NextResponse.json({ error: "Failed to update leave request" }, { status: 500 });
  }
}
