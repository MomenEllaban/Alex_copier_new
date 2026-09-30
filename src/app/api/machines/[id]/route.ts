import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import { traceError } from "@/lib/prisma-errors";
import {
  machineDeletionBlockers,
  isMachineDeletable,
  describeMachineBlockers,
} from "@/lib/machine-replacement";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePageAccess("machines");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const { id } = await params;
    const machine = await prisma.machine.findUnique({
      where: { id },
      include: {
        history: { include: { customer: true }, orderBy: { date: "desc" } },
        meterReadings: { orderBy: { readingDate: "desc" } },
        currentOwner: true,
        product: true,
        customerLocation: { include: { customer: true } },
        serviceRequests: {
          include: {
            customer: true,
            location: true,
            engineer: true,
            visits: { include: { engineer: true }, orderBy: { visitedAt: "desc" } },
          },
          orderBy: { createdAt: "desc" },
        },
        contracts: { include: { contract: { include: { customer: true } } } },
        scrapOrder: true,
        warranty: true,
      },
    });

    if (!machine) {
      return NextResponse.json({ error: "Machine not found" }, { status: 404 });
    }

    return NextResponse.json(machine);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch machine" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("machines", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;
    const body = await request.json();

    const allowed = [
      "currentStatus",
      "currentOwnerId",
      "customerLocationId",
      "meterReading",
      "notes",
      "serialNumber",
      "manufacturer",
      "model",
      "paperSize",
      "isColor",
      "isPrinter",
      "deliveryBlack",
      "deliveryColor",
      "purchaseDate",
      "purchasePrice",
      "salePrice",
      "saleDate",
      "productId",
    ] as const;

    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }
    for (const key of ["deliveryBlack", "deliveryColor"] as const) {
      if (data[key] != null && data[key] !== "") data[key] = Number(data[key]);
      else if (key in data) data[key] = null;
    }

    const machine = await prisma.machine.update({
      where: { id },
      data,
      include: {
        history: true,
        meterReadings: true,
        currentOwner: true,
        product: true,
      },
    });

    return NextResponse.json(machine);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update machine" }, { status: traceError("[machines:PUT] update failed", error) });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("machines", "delete");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;

    const existing = await prisma.machine.findUnique({
      where: { id },
      select: { id: true, serialNumber: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "الماكينة غير موجودة", code: "MACHINE_NOT_FOUND" }, { status: 404 });
    }

    // A machine is only deletable when nothing in its life is kept. A machine
    // under a contract is the important case: ContractMachine cascades, so
    // deleting it would silently drop the customer's coverage with no trace.
    // The 409 carries every blocker so the UI can offer the replacement flow
    // instead of a bare "no".
    const blockers = await machineDeletionBlockers(id);
    if (!isMachineDeletable(blockers)) {
      return NextResponse.json(
        {
          error: `لا يمكن حذف الماكينة ${existing.serialNumber}: ${describeMachineBlockers(blockers)}`,
          code: "MACHINE_HAS_HISTORY",
          blockers,
          deletable: false,
          suggestion: blockers.contracts.length > 0 ? "replace" : "archive",
        },
        { status: 409 }
      );
    }

    await prisma.machine.delete({ where: { id } });
    return NextResponse.json({ message: "تم حذف الماكينة", deleted: true });
  } catch (error) {
    console.error("Failed to delete machine:", error);
    return NextResponse.json({ error: "فشل حذف الماكينة", code: "DELETE_FAILED" }, { status: 500 });
  }
}
