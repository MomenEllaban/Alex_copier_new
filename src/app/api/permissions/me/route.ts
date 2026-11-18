import { withApiErrors } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { requireAuthWithPermissions, requireAuth } from "@/lib/auth-helpers";
import { getPermissionStamp } from "@/lib/permissions-server";
import { ALL_PAGES, isFullAccessRole } from "@/lib/permissions";
import { ACTION_KEYS } from "@/lib/rbac-catalog";

/**
 * The signed-in user's resolved permissions, plus a fingerprint of the whole
 * RBAC state in the `X-Permissions-Stamp` header.
 *
 * The sidebar and every guarded button read the payload from here, so hiding a
 * control in the UI and refusing it on the server are driven by one answer.
 * The client polls the stamp and refetches when it moves, which is how a
 * permission change reaches users who are already online without a logout.
 *
 * no-store throughout: a cached response would hide the very change being
 * delivered.
 */
async function GET__raw() {
  try {
    const user = await requireAuthWithPermissions();
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const stamp = await getPermissionStamp();

    return NextResponse.json(
      {
        role: { key: user.permissions.roleKey, isSystem: user.permissions.isSystem },
        pages: isFullAccessRole(user.permissions.roleKey)
          ? ALL_PAGES
          : [...user.permissions.pages],
        actions: isFullAccessRole(user.permissions.roleKey)
          ? ALL_PAGES.flatMap((p) => ACTION_KEYS.map((a) => `${p}:${a}`))
          : [...user.permissions.actions],
      },
      { headers: { "Cache-Control": "no-store", "X-Permissions-Stamp": stamp } }
    );
  } catch (error) {
    console.error("GET /api/permissions/me failed", error);
    return NextResponse.json(
      { error: "Failed to fetch permissions" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export const GET = withApiErrors(GET__raw);
