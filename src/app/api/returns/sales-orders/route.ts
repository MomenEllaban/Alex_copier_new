import { withApiErrors } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

async function GET__raw(request: Request) {
  try {
    const user = await requirePageAccess("returns");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const salesOrders = await prisma.salesOrder.findMany({
      where: { companyId },
      include: {
        customer: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, pricingTiers: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(salesOrders);
  } catch (error) {
    console.error("Failed to fetch sales orders:", error);
    return NextResponse.json({ error: "Failed to fetch sales orders" }, { status: 500 });
  }
}

export const GET = withApiErrors(GET__raw);
