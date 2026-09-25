import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCustomerStatement } from "@/lib/customer-statement";
import { isStatementTokenExpired } from "@/lib/statement-token";

// Public, unauthenticated endpoint: resolves a customer by its secret
// statement token and returns their full account statement. The token is
// unguessable, expires, and dies the moment a new one is issued — so the data
// is only reachable by whoever was given the link, and only for 30 days.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invalid link" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({
      where: { statementToken: token },
      select: { id: true, statementTokenExpiresAt: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }
    if (isStatementTokenExpired(customer.statementTokenExpiresAt)) {
      return NextResponse.json(
        { error: "انتهت صلاحية الرابط", code: "TOKEN_EXPIRED" },
        { status: 410 },
      );
    }

    const statement = await buildCustomerStatement(customer.id);
    if (!statement) {
      return NextResponse.json({ error: "Statement not found" }, { status: 404 });
    }

    return NextResponse.json(statement);
  } catch {
    return NextResponse.json({ error: "Failed to load statement" }, { status: 500 });
  }
}
