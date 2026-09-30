import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/auth-helpers";
import { traceError } from "@/lib/prisma-errors";
import {
  ReplacementError,
  replaceMachine,
  machineDeletionBlockers,
  TRADE_IN_CONDITIONS,
  REPLACEMENT_REASONS,
} from "@/lib/machine-replacement";

/**
 * GET — everything the replace dialog needs, in one round trip:
 *  - the machine being replaced and the contracts it is attached to,
 *  - the contracts that could be scoped to,
 *  - the machines that can replace it (in the warehouse, not already the
 *    replacement target, not scrapped),
 *  - the active companies that can receive the returned machine as stock.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAction("machines", "view");
    if (!user) {
      return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }
    const { id } = await params;

    const machine = await prisma.machine.findUnique({
      where: { id },
      include: {
        currentOwner: { select: { id: true, name: true } },
        customerLocation: { select: { id: true, name: true, address: true } },
        contracts: {
          include: {
            contract: {
              select: {
                id: true,
                contractNumber: true,
                status: true,
                endDate: true,
                customerId: true,
                customer: { select: { id: true, name: true } },
              },
            },
          },
        },
        // The company the machine was last placed out by is the one it goes
        // back to, so it is the sensible default for who takes it in as stock.
        history: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { companyId: true },
        },
      },
    });
    if (!machine) {
      return NextResponse.json(
        { error: "الماكينة غير موجودة", code: "MACHINE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const [candidates, companies, blockers] = await Promise.all([
      prisma.machine.findMany({
        where: {
          id: { not: machine.id },
          currentStatus: { in: ["IN_WAREHOUSE", "UNDER_INSPECTION", "UNDER_MAINTENANCE"] },
        },
        select: {
          id: true,
          serialNumber: true,
          manufacturer: true,
          model: true,
          currentStatus: true,
          isColor: true,
        },
        orderBy: { serialNumber: "asc" },
      }),
      prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      machineDeletionBlockers(machine.id),
    ]);

    return NextResponse.json({
      machine: {
        id: machine.id,
        serialNumber: machine.serialNumber,
        manufacturer: machine.manufacturer,
        model: machine.model,
        currentStatus: machine.currentStatus,
        currentOwner: machine.currentOwner,
        customerLocation: machine.customerLocation,
      },
      contracts: machine.contracts.map((link) => link.contract),
      candidates,
      companies,
      // Preselected in the UI so the common case is confirm, not a dropdown
      // hunt. Null for a machine that has never been placed out.
      suggestedCompanyId: machine.history[0]?.companyId ?? null,
      blockers,
      conditions: TRADE_IN_CONDITIONS,
      reasons: REPLACEMENT_REASONS,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "فشل تحميل بيانات الاستبدال", code: "LOAD_FAILED", detail: traceError("[machines:replace:GET]", error) },
      { status: 500 }
    );
  }
}

/**
 * POST — swap a machine under a contract for another one.
 *
 * The returned machine is not discarded: it is registered as replacement stock
 * under the chosen company, so it appears on the replacement-products page and
 * in that company's warehouse inventory. See `replaceMachine` for the full
 * sequence.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("machines", "edit");
    if (!actor) {
      return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    if (!companyId) {
      return NextResponse.json(
        { error: "اختر الشركة التي تستلم الماكينة المستردة", code: "COMPANY_REQUIRED" },
        { status: 400 }
      );
    }

    const newMachineId =
      typeof body.newMachineId === "string" && body.newMachineId.trim()
        ? body.newMachineId.trim()
        : null;
    const contractId =
      typeof body.contractId === "string" && body.contractId.trim()
        ? body.contractId.trim()
        : null;

    const tradeInValue =
      body.tradeInValue === "" || body.tradeInValue == null
        ? null
        : Number(body.tradeInValue);
    if (tradeInValue !== null && (!Number.isFinite(tradeInValue) || tradeInValue < 0)) {
      return NextResponse.json(
        { error: "قيمة الاستبدال يجب أن تكون رقماً موجباً", code: "INVALID_TRADE_IN_VALUE" },
        { status: 400 }
      );
    }

    const condition =
      typeof body.condition === "string" && TRADE_IN_CONDITIONS.includes(body.condition as never)
        ? (body.condition as (typeof TRADE_IN_CONDITIONS)[number])
        : null;

    const reason =
      typeof body.reason === "string" && REPLACEMENT_REASONS.includes(body.reason as never)
        ? (body.reason as (typeof REPLACEMENT_REASONS)[number])
        : "CUSTOMER_REQUEST";

    const result = await replaceMachine({
      oldMachineId: id,
      newMachineId,
      contractId,
      companyId,
      tradeInValue,
      condition,
      reason,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
      actorId: actor.id,
    });

    return NextResponse.json({ message: "تم تسجيل الاستبدال", replacement: result });
  } catch (error) {
    if (error instanceof ReplacementError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        error: "فشل تنفيذ الاستبدال",
        code: "REPLACE_FAILED",
        detail: traceError("[machines:replace:POST]", error),
      },
      { status: 500 }
    );
  }
}
