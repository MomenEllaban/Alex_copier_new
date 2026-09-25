import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAnyPage } from "@/lib/auth-helpers";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    // An engineer may read their own sales only; everyone else needs the
    // engineers/sales page.
    if ((user as { role?: string }).role === "ENGINEER") {
      const mine = await prisma.engineer.findUnique({
        where: { userId: (user as { id?: string }).id ?? "" },
        select: { id: true },
      });
      if (!mine || mine.id !== id) {
        return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
      }
    }

    const engineer = await prisma.engineer.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!engineer) return NextResponse.json({ error: "Engineer not found" }, { status: 404 });

    const sales = await prisma.salesOrder.findMany({
      where: { engineerId: id },
      include: {
        customer: { select: { id: true, name: true } },
        company: { select: { id: true, name: true, nameAr: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(sales);
  } catch {
    return NextResponse.json({ error: "Failed to fetch engineer sales" }, { status: 500 });
  }
}
