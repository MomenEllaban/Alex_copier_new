import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const user = await requirePageAccess("workshop");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const machines = await prisma.machine.findMany({
      where: {
        currentStatus: { in: ["UNDER_INSPECTION", "UNDER_MAINTENANCE"] },
      },
      include: {
        product: true,
        currentOwner: true,
        customerLocation: true,
        history: true,
        meterReadings: true,
        scrapOrder: true,
        warranty: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(machines);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch workshop machines" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {

    const actor = await requirePageAccess("workshop");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
        const body = await request.json();

    const orderNumber = `SCRAP-${Date.now()}`;

    const scrapOrder = await prisma.scrapOrder.create({
      data: {
        ...body,
        orderNumber,
      },
      include: {
        machine: true,
      },
    });

    await prisma.machine.update({
      where: { id: body.machineId },
      data: { currentStatus: "SCRAPPED" },
    });

    return NextResponse.json(scrapOrder, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create scrap order" }, { status: 500 });
  }
}
