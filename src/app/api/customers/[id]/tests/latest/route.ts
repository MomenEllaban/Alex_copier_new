import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePageAccess("copierTests");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const { id: customerId } = await params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, engineerId: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });
    }

    // Engineers may only read tests of their assigned customers.
    const role = (user as { role?: string }).role;
    if (role === "ENGINEER") {
      const userId = (user as { id?: string }).id ?? "";
      const mine = await prisma.engineer.findUnique({ where: { userId }, select: { id: true } });
      if (!mine || customer.engineerId !== mine.id) {
        return NextResponse.json({ error: "هذا العميل غير مسند إليك", code: "CUSTOMER_NOT_ASSIGNED" }, { status: 403 });
      }
    }

    const latest = await prisma.copierTest.findFirst({
      where: { customerId },
      include: {
        engineer: { select: { id: true, name: true } },
        machine: { select: { id: true, serialNumber: true, model: true } },
      },
      orderBy: [{ testDate: "desc" }, { createdAt: "desc" }],
    });
    if (!latest) {
      return NextResponse.json({ error: "لا يوجد اختبارات لهذا العميل", code: "NO_TESTS" }, { status: 404 });
    }
    return NextResponse.json(latest);
  } catch {
    return NextResponse.json({ error: "Failed to fetch latest test" }, { status: 500 });
  }
}
