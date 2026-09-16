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
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        customer: true,
        machines: {
          include: { machine: true },
        },
        visits: true,
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    return NextResponse.json(contract);
  } catch {
    return NextResponse.json({ error: "Failed to fetch contract" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("contracts");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const {
      machineIds,
      contractType,
      status,
      billingCycle,
      startDate,
      endDate,
      value,
      amountPaid,
      paymentMethod,
      visitLimit,
      costPerCopy,
      earlyTerminationFee,
      notes,
    } = body;

    const VALID_CONTRACT_TYPES = ["ARCHIVE", "RENTAL", "MAINTENANCE", "VISIT", "WARRANTY", "CONTRACT_REQUIRED", "MAINTENANCE_ONLY", "MAINTENANCE_AND_PARTS", "MAINTENANCE_AND_PRINTING", "PENDING"];
    const VALID_CONTRACT_STATUSES = ["ACTIVE", "EXPIRED", "TERMINATED", "SUSPENDED"];
    const VALID_BILLING_CYCLES = ["MONTHLY", "HALF_YEARLY", "QUARTERLY", "YEARLY"];
    const VALID_PAYMENT_METHODS = ["CASH", "CREDIT"];

    if (contractType !== undefined && !VALID_CONTRACT_TYPES.includes(contractType)) {
      return NextResponse.json({ error: "نوع العقد غير صالح", code: "INVALID_CONTRACT_TYPE" }, { status: 400 });
    }
    if (status !== undefined && !VALID_CONTRACT_STATUSES.includes(status)) {
      return NextResponse.json({ error: "حالة العقد غير صالحة", code: "INVALID_CONTRACT_STATUS" }, { status: 400 });
    }
    if (billingCycle !== undefined && !VALID_BILLING_CYCLES.includes(billingCycle)) {
      return NextResponse.json({ error: "دورة الفوترة غير صالحة", code: "INVALID_BILLING_CYCLE" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (contractType !== undefined) updateData.contractType = contractType;
    if (status !== undefined) updateData.status = status;
    if (billingCycle !== undefined) updateData.billingCycle = billingCycle;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = new Date(endDate);
    if (value !== undefined) updateData.value = Number(value);
    if (amountPaid !== undefined) updateData.amountPaid = Number(amountPaid);
    if (paymentMethod !== undefined) updateData.paymentMethod = VALID_PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : undefined;
    if (visitLimit !== undefined) updateData.visitLimit = visitLimit != null ? Number(visitLimit) : null;
    if (costPerCopy !== undefined) updateData.costPerCopy = costPerCopy != null ? Number(costPerCopy) : null;
    if (earlyTerminationFee !== undefined) updateData.earlyTerminationFee = earlyTerminationFee != null ? Number(earlyTerminationFee) : null;
    if (notes !== undefined) updateData.notes = notes;

    if (Array.isArray(machineIds) && machineIds.length > 0) {
      const distinctMachines = new Set(machineIds as string[]);
      const foundMachines = await prisma.machine.count({ where: { id: { in: [...distinctMachines] } } });
      if (foundMachines !== distinctMachines.size) {
        return NextResponse.json({ error: "جهاز غير موجود في سجل الأجهزة", code: "MACHINE_NOT_FOUND" }, { status: 400 });
      }
    }

    const contract = await prisma.$transaction(async (tx) => {
      if (machineIds) {
        await tx.contractMachine.deleteMany({ where: { contractId: id } });
      }

      return tx.contract.update({
        where: { id },
        data: {
          ...updateData,
          ...(machineIds && {
            machines: {
              create: machineIds.map((machineId: string) => ({
                machineId,
              })),
            },
          }),
        },
        include: {
          customer: true,
          machines: {
            include: { machine: true },
          },
          visits: true,
        },
      });
    });

    return NextResponse.json(contract);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Contract not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update contract" }, { status: traceError("[contracts:PUT] update failed", error) });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("contracts");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;
    await prisma.contract.delete({ where: { id } });
    return NextResponse.json({ message: "Contract deleted" });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Contract not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete contract" }, { status: 500 });
  }
}
