import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { getPermissionStamp } from "@/lib/permissions-server";

/**
 * A fingerprint of the RBAC state, used by open browsers to notice that the
 * permissions matrix changed and refetch their own permissions.
 *
 * Deliberately does not resolve the user's permission set — that would be three
 * queries every poll. This is two: the auth check the app already does, and one
 * small read of the Role table.
 */
export async function GET() {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const stamp = await getPermissionStamp();
    return NextResponse.json(
      { stamp },
      { headers: { "Cache-Control": "no-store", "X-Permissions-Stamp": stamp } }
    );
  } catch (error) {
    console.error("GET /api/permissions/stamp failed", error);
    return NextResponse.json({ error: "Failed to read stamp" }, { status: 500 });
  }
}
