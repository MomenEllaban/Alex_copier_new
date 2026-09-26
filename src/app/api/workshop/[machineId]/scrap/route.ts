import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/auth-helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ machineId: string }> }
) {
  try {
    const actor = await requireAction("workshop", "scrap");
    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { machineId } = await params;

    const machine = await prisma.machine.findUnique({
      where: { id: machineId },
      select: { id: true, currentStatus: true },
    });
    if (!machine) {
      return NextResponse.json({ error: "Machine not found" }, { status: 404 });
    }
    if (machine.currentStatus === "SCRAPPED") {
      return NextResponse.json({ error: "Machine is already scrapped" }, { status: 400 });
    }

    const body = await request.json();
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const approvedBy = typeof body.approvedBy === "string" ? body.approvedBy.trim() : actor.name || "";
    const scrapValue = body.scrapValue === null || body.scrapValue === undefined || body.scrapValue === ""
      ? null
      : Number(body.scrapValue);

    if (!reason) {
      return NextResponse.json({ error: "Scrap reason is required" }, { status: 400 });
    }
    if (scrapValue !== null && !Number.isFinite(scrapValue)) {
      return NextResponse.json({ error: "Invalid scrap value" }, { status: 400 });
    }

    const orderNumber = `SCRAP-${Date.now()}`;

    const scrapOrder = await prisma.scrapOrder.create({
      data: { orderNumber, machineId, reason, approvedBy, scrapValue },
      include: { machine: true },
    });

    await prisma.machine.update({
      where: { id: machineId },
      data: { currentStatus: "SCRAPPED" },
    });

    return NextResponse.json(scrapOrder, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create scrap order" }, { status: 500 });
  }
}
