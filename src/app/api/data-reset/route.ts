import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth-helpers";
import { isCompanyResetEnabled, isDataResetEnabled } from "@/lib/data-reset";

/**
 * GET /api/data-reset
 *
 * Whether this deployment allows the two wipes. The POST endpoints themselves
 * answer 404 while a wipe is off, so the companies and settings pages ask here
 * first and disable their button with a reason instead of firing a request that
 * can only fail.
 *
 *   wipeAll     the system-wide database wipe (opt-in via ENABLE_DATA_RESET=1)
 *   wipeCompany zeroing one company (on by default)
 *
 * GM-only, same as the resets it describes.
 */
export async function GET() {
  try {
    const admin = await requireRole("GENERAL_MANAGER");
    if (!admin) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    return NextResponse.json({
      enabled: isDataResetEnabled(),
      companyEnabled: isCompanyResetEnabled(),
    });
  } catch (error) {
    console.error("[data-reset] GET failed:", error);
    return NextResponse.json({ error: "فشل قراءة حالة التصفير" }, { status: 500 });
  }
}
