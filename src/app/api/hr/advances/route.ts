import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import {
  requestAdvance,
  approveAdvance,
  disburseAdvance,
  rejectAdvance,
} from "@/lib/services/hr/loan-advance-service";
import { errorMessage } from "@/lib/prisma-errors";
import { Prisma } from "@/generated/prisma/client";
import { enumFilter } from "@/lib/enum-filter";
import { ADVANCE_STATUSES } from "@/lib/hr/hr-statuses";
import {
  employeeNotInCompanyResponse,
  findEmployeeInCompany,
  resolveCompanyId,
  scopedRecord,
} from "@/lib/services/hr/company-scope";

export async function GET(request: Request) {
  try {
    const actor = await requirePageAccess("hrPayroll");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const status = enumFilter(searchParams.get("status"), ADVANCE_STATUSES);
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    const where: Prisma.EmployeeAdvanceWhereInput = {};
    if (actor.companyId) where.companyId = actor.companyId;
    if (employeeId) {
      if (actor.companyId) {
        const emp = await findEmployeeInCompany(employeeId, actor.companyId);
        if (!emp) return employeeNotInCompanyResponse();
      }
      where.employeeId = employeeId;
    }
    if (status) where.status = status;
    if (month) where.deductMonth = parseInt(month);
    if (year) where.deductYear = parseInt(year);

    const advances = await prisma.employeeAdvance.findMany({
      where,
      orderBy: [{ deductYear: "desc" }, { deductMonth: "desc" }, { createdAt: "desc" }],
      include: {
        Employee: {
          select: {
            id: true,
            code: true,
            fullName: true,
            fullNameAr: true,
            baseSalary: true,
            Department: { select: { name: true, nameAr: true } },
          },
        },
      },
    });

    return NextResponse.json(advances);
  } catch (error) {
    console.error("GET /api/hr/advances error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to fetch advances") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAction("hrPayroll", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const body = await request.json();
    const companyId = resolveCompanyId(actor, body.companyId);

    if (!companyId || !body.employeeId || !body.amount || !body.deductMonth || !body.deductYear) {
      return NextResponse.json({ error: "Missing required advance fields" }, { status: 400 });
    }

    const employee = await findEmployeeInCompany(body.employeeId, companyId);
    if (!employee) return employeeNotInCompanyResponse();

    const advance = await requestAdvance({
      companyId,
      employeeId: body.employeeId,
      amount: parseFloat(body.amount),
      deductMonth: parseInt(body.deductMonth),
      deductYear: parseInt(body.deductYear),
      reason: body.reason || "طلب سلفة موظف",
    });

    return NextResponse.json(advance, { status: 201 });
  } catch (error) {
    console.error("POST /api/hr/advances error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to request advance") }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAction("hrPayroll", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const body = await request.json();
    const { id, action, reason, disbursementMethod, treasuryAccountId } = body;

    if (!id || !action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    const scoped = await scopedRecord(actor, "السلفة", () =>
      prisma.employeeAdvance.findUnique({ where: { id } })
    );
    if ("response" in scoped) return scoped.response;

    let result;
    if (action === "approve") {
      result = await approveAdvance(id, actor.id);
    } else if (action === "disburse") {
      result = await disburseAdvance(id, actor.id, disbursementMethod, treasuryAccountId);
    } else if (action === "reject") {
      result = await rejectAdvance(id, actor.id, reason);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/hr/advances error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to update advance") }, { status: 400 });
  }
}
