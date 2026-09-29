import { NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth-helpers";
import { isDataResetEnabled } from "@/lib/data-reset";

/**
 * GET /api/data-reset
 *
 * Whether this deployment allows wiping transactions. The POST endpoints
 * themselves answer 404 while the wipe is off, so the companies and settings
 * pages ask here first and disable their button with a reason instead of
 * firing a request that can only fail.
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

    return NextResponse.json({ enabled: isDataResetEnabled() });
  } catch (error) {
    console.error("[data-reset] GET failed:", error);
    return NextResponse.json({ error: "فشل قراءة حالة التصفير" }, { status: 500 });
  }
}
