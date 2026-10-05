import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import {
  getCompanyHrSettings,
  updateCompanyHrSettings,
  validatePayrollAccountMapping,
} from "@/lib/services/hr/hr-settings-service";
import { errorMessage } from "@/lib/prisma-errors";

export async function GET(request: Request) {
  try {
    const actor = await requirePageAccess("hrSettings");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const companyId = actor.companyId || searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const [settings, mappingValidation, companyAccounts] = await Promise.all([
      getCompanyHrSettings(companyId),
      validatePayrollAccountMapping(companyId),
      prisma.account.findMany({
        where: { companyId, isActive: true },
        select: { id: true, code: true, name: true, accountType: true },
        orderBy: { code: "asc" },
      }),
    ]);

    return NextResponse.json({
      settings,
      mappingValidation,
      accounts: companyAccounts,
    });
  } catch (error) {
    console.error("GET /api/hr/settings error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to fetch settings") }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireAction("hrSettings", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const body = await request.json();
    const companyId = actor.companyId || body.companyId;

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const updated = await updateCompanyHrSettings(companyId, body);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/hr/settings error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to update settings") }, { status: 400 });
  }
}
