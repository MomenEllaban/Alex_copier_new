import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAnyPage } from "@/lib/auth-helpers";
import { buildEngineerStatement } from "@/lib/engineer-statement";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAnyPage("engineers", "sales");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const { id } = await params;
    // An engineer may read their own statement only; everyone else needs the
    // engineers/sales page. Without this, any engineer could read any other
    // engineer's earnings.
    if ((user as { role?: string }).role === "ENGINEER") {
      const mine = await prisma.engineer.findUnique({
        where: { userId: (user as { id?: string }).id ?? "" },
        select: { id: true },
      });
      if (!mine || mine.id !== id) {
        return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
      }
    }

    const engineer = await prisma.engineer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!engineer) return NextResponse.json({ error: "Engineer not found" }, { status: 404 });

    const statement = await buildEngineerStatement(id);
    if (!statement) return NextResponse.json({ error: "Statement not found" }, { status: 404 });

    return NextResponse.json(statement);
  } catch {
    return NextResponse.json({ error: "Failed to generate engineer statement" }, { status: 500 });
  }
}