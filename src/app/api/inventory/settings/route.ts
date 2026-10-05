import { NextResponse } from "next/server";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import {
  getInventorySettings,
  updateInventorySettings,
} from "@/lib/services/inventory/inventory-settings-service";

/**
 * The company's negative-stock policy.
 *
 * Guarded on its own `inventorySettings` page rather than on `inventory`: the
 * flag can only loosen the sales stock guard, so it must not be handed to every
 * role that can read the stock list (workshop managers, maintenance managers).
 * A general manager is never locked out — `canViewPage` short-circuits for them.
 */
export async function GET(request: Request) {
  try {
    const actor = await requirePageAccess("inventorySettings");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    // The general manager has no company of their own, so they may ask for a
    // specific one; everyone else is pinned to their own company.
    const companyId = actor.companyId ?? searchParams.get("companyId");
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const settings = await getInventorySettings(companyId);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("GET /api/inventory/settings error:", error);
    return NextResponse.json({ error: "Failed to fetch inventory settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireAction("inventorySettings", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const body = await request.json();
    // A company manager can only ever write their own company's policy: the
    // body is not allowed to choose the company, so it is read but not trusted
    // when the actor already has one.
    const companyId = actor.companyId ?? body.companyId;
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const updated = await updateInventorySettings(companyId, {
      allowNegativeStock:
        typeof body.allowNegativeStock === "boolean" ? body.allowNegativeStock : undefined,
      warnOnNegativeStock:
        typeof body.warnOnNegativeStock === "boolean" ? body.warnOnNegativeStock : undefined,
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/inventory/settings error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update inventory settings" },
      { status: 400 },
    );
  }
}
