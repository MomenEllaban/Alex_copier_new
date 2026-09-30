import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/auth-helpers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("workshop", "edit");
    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.workshopPartMovement.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ error: "Movement not found" }, { status: 404 });
    }

    const movement = await prisma.workshopPartMovement.update({
      where: { id },
      data: {
        receivedById: actor.id,
        receivedByName: (actor as { name?: string }).name || null,
        receivedAt: new Date(),
        updatedById: actor.id,
      },
      include: {
        engineer: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        performedBy: { select: { id: true, name: true } },
        receivedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(movement);
  } catch {
    return NextResponse.json({ error: "Failed to confirm receipt" }, { status: 500 });
  }
}
