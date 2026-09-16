import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { traceError } from "@/lib/prisma-errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const actor = await requirePageAccess("machines");
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
    const actor = await requirePageAccess("machines");
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
      return NextResponse.json({ error: "Machine not found" }, { status: 404 });
    }

    // Check for service requests referencing this machine
    const serviceRequestCount = await prisma.serviceRequest.count({
      where: { machineId: id },
    });
    if (serviceRequestCount > 0) {
      return NextResponse.json(
        { error: `لا يمكن حذف الجهاز لأنه مرتبط بـ ${serviceRequestCount} طلب صيانة`, code: "HAS_SERVICE_REQUESTS" },
        { status: 400 }
      );
    }

    await prisma.machine.delete({ where: { id } });
    return NextResponse.json({ message: "Machine deleted" });
  } catch (error) {
    console.error("Failed to delete machine:", error);
    return NextResponse.json({ error: "Failed to delete machine" }, { status: 500 });
  }
}
