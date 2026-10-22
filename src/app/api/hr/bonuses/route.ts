import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import {
  createBonus,
  approveBonus,
  rejectBonus,
  getBonuses,
} from "@/lib/services/hr/bonus-penalty-service";
import { errorMessage } from "@/lib/prisma-errors";
import { enumFilter } from "@/lib/enum-filter";
import { ADVANCE_STATUSES } from "@/lib/hr/hr-statuses";
import {
  employeeNotInCompanyResponse,
  findEmployeeForActor,
  findEmployeeInCompany,
  scopedRecord,
} from "@/lib/services/hr/company-scope";
import { companyScopeFilter } from "@/lib/company-scope";

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
    const companyId = companyScopeFilter(actor, searchParams.get("companyId"));

    const employeeId = searchParams.get("employeeId") || undefined;
    if (employeeId && companyId) {
      const emp = await findEmployeeInCompany(employeeId, companyId);
      if (!emp) return employeeNotInCompanyResponse();
    }
    const status = enumFilter(searchParams.get("status"), ADVANCE_STATUSES);
    const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : undefined;
    const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined;

    const bonuses = await getBonuses(companyId, { employeeId, status, month, year });
    return NextResponse.json(bonuses);
  } catch (error) {
    console.error("GET /api/hr/bonuses error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to fetch bonuses") }, { status: 500 });
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

    if (!body.employeeId || !body.title || !body.targetMonth || !body.targetYear) {
      return NextResponse.json({ error: "Missing required bonus fields" }, { status: 400 });
    }

    // The bonus belongs to the employee, so the employee's company is the
    // company it is booked in — whatever the body says.
    const employee = await findEmployeeForActor(actor, body.employeeId);
    if (!employee) return employeeNotInCompanyResponse();
    if (body.companyId && String(body.companyId) !== employee.companyId) {
      return employeeNotInCompanyResponse();
    }
    const companyId = employee.companyId;

    const bonus = await createBonus(
      {
        companyId,
        employeeId: body.employeeId,
        title: body.title,
        bonusType: body.bonusType,
        calcType: body.calcType || "FIXED_AMOUNT",
        percentage: body.percentage ? parseFloat(body.percentage) : undefined,
        amount: body.amount ? parseFloat(body.amount) : undefined,
        targetMonth: parseInt(body.targetMonth),
        targetYear: parseInt(body.targetYear),
        reason: body.reason,
      }
    );

    return NextResponse.json(bonus, { status: 201 });
  } catch (error) {
    console.error("POST /api/hr/bonuses error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to create bonus") }, { status: 400 });
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
    const { id, action, reason } = body;

    if (!id || !action) return NextResponse.json({ error: "id and action required" }, { status: 400 });

    const scoped = await scopedRecord(actor, "الحافز", () => prisma.employeeBonus.findUnique({ where: { id } }));
    if ("response" in scoped) return scoped.response;

    let result;
    if (action === "approve") {
      result = await approveBonus(id, actor.id);
    } else if (action === "reject") {
      result = await rejectBonus(id, actor.id, reason);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/hr/bonuses error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to update bonus") }, { status: 400 });
  }
}
