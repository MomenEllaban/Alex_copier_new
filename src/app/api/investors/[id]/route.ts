import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePageAccess("investors");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const { id } = await params;
    const investor = await prisma.investor.findUnique({ where: { id } });

    if (!investor) {
      return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    }

    return NextResponse.json(investor);
  } catch {
    return NextResponse.json({ error: "Failed to fetch investor" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("investors");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const investor = await prisma.investor.update({
      where: { id },
      data: body,
    });

    return NextResponse.json(investor);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update investor" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("investors");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }

    const { id } = await params;

    const existing = await prisma.investor.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    }

    // Check for distributions
    const distCount = await prisma.investorDistribution.count({
      where: { investorId: id },
    });

    if (distCount > 0) {
      return NextResponse.json(
        { error: `لا يمكن حذف المستثمر لأنه مرتبط بـ ${distCount} توزيعة`, code: "HAS_DISTRIBUTIONS" },
        { status: 400 }
      );
    }

    await prisma.investor.delete({ where: { id } });
    return NextResponse.json({ message: "Investor deleted" });
  } catch (error) {
    console.error("Failed to delete investor:", error);
    return NextResponse.json({ error: "Failed to delete investor" }, { status: 500 });
  }
}
