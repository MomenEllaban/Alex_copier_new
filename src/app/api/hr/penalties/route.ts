import { NextResponse } from "next/server";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import {
  createPenalty,
  approvePenalty,
  rejectPenalty,
  getPenalties,
} from "@/lib/services/hr/bonus-penalty-service";
import { errorMessage } from "@/lib/prisma-errors";
import { enumFilter } from "@/lib/enum-filter";
import { ADVANCE_STATUSES } from "@/lib/hr/hr-statuses";

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
    const companyId = actor.companyId || searchParams.get("companyId");
    if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

    const employeeId = searchParams.get("employeeId") || undefined;
    const status = enumFilter(searchParams.get("status"), ADVANCE_STATUSES);
    const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : undefined;
    const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined;

    const penalties = await getPenalties(companyId, { employeeId, status, month, year });
    return NextResponse.json(penalties);
  } catch (error) {
    console.error("GET /api/hr/penalties error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to fetch penalties") }, { status: 500 });
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
    const companyId = actor.companyId || body.companyId;

    if (!companyId || !body.employeeId || !body.title || !body.targetMonth || !body.targetYear || !body.reason) {
      return NextResponse.json({ error: "Missing required penalty fields" }, { status: 400 });
    }

    const penalty = await createPenalty(
      {
        companyId,
        employeeId: body.employeeId,
        title: body.title,
        penaltyType: body.penaltyType,
        calcType: body.calcType || "FIXED_AMOUNT",
        deductionDays: body.deductionDays ? parseFloat(body.deductionDays) : undefined,
        amount: body.amount ? parseFloat(body.amount) : undefined,
        targetMonth: parseInt(body.targetMonth),
        targetYear: parseInt(body.targetYear),
        reason: body.reason,
      }
    );

    return NextResponse.json(penalty, { status: 201 });
  } catch (error) {
    console.error("POST /api/hr/penalties error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to create penalty") }, { status: 400 });
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

    let result;
    if (action === "approve") {
      result = await approvePenalty(id, actor.id);
    } else if (action === "reject") {
      result = await rejectPenalty(id, actor.id, reason);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/hr/penalties error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to update penalty") }, { status: 400 });
  }
}
