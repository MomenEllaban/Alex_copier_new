import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

export async function GET() {
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

export async function POST(request: Request) {
  try {

    const actor = await requirePageAccess("investors");
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
