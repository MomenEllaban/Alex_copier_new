import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePageAccess, requireAuth } from "@/lib/auth-helpers";
import { issueStatementToken } from "@/lib/statement-token";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePageAccess("engineers");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        {
          error: authed ? "Forbidden" : "Unauthorized",
          code: authed ? "FORBIDDEN" : "UNAUTHORIZED",
        },
        { status: authed ? 403 : 401 },
      );
    }
    const { id } = await params;
    const engineer = await prisma.engineer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!engineer) {
      return NextResponse.json({ error: "المهندس غير موجود", code: "NOT_FOUND" }, { status: 404 });
    }
    // Always re-issue: this endpoint doubles as the "cancel the link" button,
    // because issuing a new token kills the previous one.
    const issued = issueStatementToken();
    await prisma.engineer.update({ where: { id }, data: issued });
    return NextResponse.json({
      token: issued.statementToken,
      expiresAt: issued.statementTokenExpiresAt.toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate statement link", code: "FAILED" },
      { status: 500 },
    );
  }
}