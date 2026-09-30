import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/auth-helpers";
import { z } from "zod";

const updateSchema = z.object({
  date: z.string().optional(),
  engineerId: z.string().optional().nullable(),
  engineerName: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  description: z.string().optional(),
  requestedBy: z.string().optional().nullable(),
  movementType: z.enum(["SALE", "REPLACEMENT", "RETURN"]).optional(),
  performedById: z.string().optional().nullable(),
  performedByName: z.string().optional().nullable(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAction("workshop", "view");
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const movement = await prisma.workshopPartMovement.findFirst({
      where: { id, deletedAt: null },
      include: {
        engineer: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        performedBy: { select: { id: true, name: true } },
        receivedBy: { select: { id: true, name: true } },
      },
    });

    if (!movement) {
      return NextResponse.json({ error: "Movement not found" }, { status: 404 });
    }

    return NextResponse.json(movement);
  } catch {
    return NextResponse.json({ error: "Failed to fetch movement" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("workshop", "edit");
    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Validation failed", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const existing = await prisma.workshopPartMovement.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ error: "Movement not found" }, { status: 404 });
    }

    const movement = await prisma.workshopPartMovement.update({
      where: { id },
      data: {
        ...parsed.data,
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
    return NextResponse.json({ error: "Failed to update movement" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("workshop", "delete");
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

    await prisma.workshopPartMovement.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: actor.id },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete movement" }, { status: 500 });
  }
}
