import { NextResponse } from "next/server";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import {
  createBonus,
  approveBonus,
  rejectBonus,
  getBonuses,
} from "@/lib/services/hr/bonus-penalty-service";

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
    const status = searchParams.get("status") || undefined;
    const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : undefined;
    const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined;

    const bonuses = await getBonuses(companyId, { employeeId, status, month, year });
    return NextResponse.json(bonuses);
  } catch (error: any) {
    console.error("GET /api/hr/bonuses error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch bonuses" }, { status: 500 });
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

    if (!companyId || !body.employeeId || !body.title || !body.targetMonth || !body.targetYear) {
      return NextResponse.json({ error: "Missing required bonus fields" }, { status: 400 });
    }

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
      },
      actor.id
    );

    return NextResponse.json(bonus, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/hr/bonuses error:", error);
    return NextResponse.json({ error: error.message || "Failed to create bonus" }, { status: 400 });
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
      result = await approveBonus(id, actor.id);
    } else if (action === "reject") {
      result = await rejectBonus(id, actor.id, reason);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("PATCH /api/hr/bonuses error:", error);
    return NextResponse.json({ error: error.message || "Failed to update bonus" }, { status: 400 });
  }
}
