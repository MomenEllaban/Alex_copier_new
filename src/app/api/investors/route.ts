import { withApiErrors } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";

async function GET__raw() {
  try {
    const user = await requirePageAccess("investors");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const investors = await prisma.investor.findMany({
      include: {
        distributions: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(investors);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch investors" }, { status: 500 });
  }
}

async function POST__raw(request: Request) {
  try {

    const actor = await requireAction("investors", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
        const body = await request.json();
    const investor = await prisma.investor.create({
      data: body,
      include: {
        distributions: true,
      },
    });
    return NextResponse.json(investor, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create investor" }, { status: 500 });
  }
}

export const GET = withApiErrors(GET__raw);
export const POST = withApiErrors(POST__raw);
