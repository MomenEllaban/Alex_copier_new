import { withApiErrors } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

/**
 * Active users holding the ENGINEER role, annotated with the engineer
 * record they are already linked to (if any). Used by the engineers page
 * to link technician records to real login accounts.
 */
async function GET__raw() {
  try {
    const actor = await requirePageAccess("engineers");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }

    const [users, engineers] = await Promise.all([
      prisma.user.findMany({
        where: { role: "ENGINEER", isActive: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
      prisma.engineer.findMany({
        where: { userId: { not: null } },
        select: { id: true, userId: true },
      }),
    ]);

    const engineerIdByUser = new Map(engineers.map((e) => [e.userId, e.id]));
    return NextResponse.json(
      users.map((u) => ({
        ...u,
        linkedEngineerId: engineerIdByUser.get(u.id) ?? null,
      })),
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch engineer users" }, { status: 500 });
  }
}

export const GET = withApiErrors(GET__raw);
