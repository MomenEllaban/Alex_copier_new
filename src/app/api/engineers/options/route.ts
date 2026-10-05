import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { ownEngineerId } from "@/lib/engineer-scope";

/**
 * The engineer pick list for documents - a sales invoice and an intercompany
 * invoice both have to name an engineer.
 *
 * This exists because those screens used to borrow `GET /api/engineers`, which is
 * the *engineers management* feed: gated on the `engineers` page and heavy (areas,
 * skills, the linked login's email, customer counts, every service request). That
 * was wrong twice over. An accountant may raise a sales invoice but cannot open
 * the engineers page, so the call came back 403 and the picker was silently empty.
 * And the screen only ever reads `id` and `name`, so everything else was payload
 * for nothing.
 *
 * So this endpoint answers the question the screens actually ask - "who may I
 * name on this document?" - with two columns, and authorises on any page whose
 * form needs the list rather than on the page that manages engineers.
 */
export async function GET() {
  try {
    const actor = await requireAuth();
    if (!actor) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // An engineer picks themselves only; the list is a pick list, not a roster.
    const isEngineer = actor.role === "ENGINEER";
    const selfId = isEngineer ? await ownEngineerId(actor.id) : null;
    if (isEngineer && !selfId) {
      return NextResponse.json([]);
    }

    const engineers = await prisma.engineer.findMany({
      where: selfId ? { id: selfId } : { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(engineers, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch engineers" }, { status: 500 });
  }
}
