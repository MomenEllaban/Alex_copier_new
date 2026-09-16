import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { traceError } from "@/lib/prisma-errors";

export async function GET() {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const contracts = await prisma.contract.findMany({
      include: {
        customer: true,
        machines: {
          include: { machine: true },
        },
        _count: {
          select: { visits: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(contracts);
  } catch {
    return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePageAccess("contracts");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const body = await request.json();
    const {
      machineIds,
      contractType,
      billingCycle,
      customerId,
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
    const VALID_BILLING_CYCLES = ["MONTHLY", "HALF_YEARLY", "QUARTERLY", "YEARLY"];
    const VALID_PAYMENT_METHODS = ["CASH", "CREDIT"];

    if (!customerId) {
      return NextResponse.json({ error: "العميل مطلوب", code: "CONTRACT_FIELDS_REQUIRED" }, { status: 400 });
    }
    if (!VALID_CONTRACT_TYPES.includes(contractType)) {
      return NextResponse.json({ error: "نوع العقد غير صالح", code: "INVALID_CONTRACT_TYPE" }, { status: 400 });
    }
    if (!VALID_BILLING_CYCLES.includes(billingCycle)) {
      return NextResponse.json({ error: "دورة الفوترة غير صالحة", code: "INVALID_BILLING_CYCLE" }, { status: 400 });
    }
    if (!startDate || !endDate) {
      return NextResponse.json({ error: "تاريخ البداية والنهاية مطلوبان", code: "CONTRACT_FIELDS_REQUIRED" }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "تاريخ غير صالح", code: "INVALID_DATE" }, { status: 400 });
    }
    if (end <= start) {
      return NextResponse.json({ error: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية", code: "END_BEFORE_START" }, { status: 400 });
    }

    const normalizedValue = Number(value ?? 0);
    const normalizedPaid = Number(amountPaid ?? 0);
    const normalizedPaymentMethod = paymentMethod && VALID_PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : "CASH";

    if (!Number.isFinite(normalizedValue) || normalizedValue < 0) {
      return NextResponse.json({ error: "قيمة العقد غير صالحة", code: "INVALID_CONTRACT_VALUE" }, { status: 400 });
    }
    if (!Number.isFinite(normalizedPaid) || normalizedPaid < 0) {
      return NextResponse.json({ error: "المبلغ المدفوع غير صالح", code: "INVALID_AMOUNT_PAID" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود", code: "CUSTOMER_NOT_FOUND" }, { status: 400 });
    }
    if (Array.isArray(machineIds) && machineIds.length > 0) {
      const distinctMachines = new Set(machineIds as string[]);
      const foundMachines = await prisma.machine.count({ where: { id: { in: [...distinctMachines] } } });
      if (foundMachines !== distinctMachines.size) {
        return NextResponse.json({ error: "جهاز غير موجود في سجل الأجهزة", code: "MACHINE_NOT_FOUND" }, { status: 400 });
      }
    }

    let contractNumber: string;
    try {
      contractNumber = `CTR-${Date.now()}`;
      const contract = await prisma.contract.create({
        data: {
          contractType,
          billingCycle,
          customerId,
          startDate: start,
          endDate: end,
          value: normalizedValue,
          amountPaid: normalizedPaid,
          paymentMethod: normalizedPaymentMethod,
          visitLimit: visitLimit != null ? Number(visitLimit) : undefined,
          costPerCopy: costPerCopy != null ? Number(costPerCopy) : undefined,
          earlyTerminationFee: earlyTerminationFee != null ? Number(earlyTerminationFee) : undefined,
          notes: notes ?? undefined,
          contractNumber,
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
      },
      });

      return NextResponse.json(contract, { status: 201 });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
        return NextResponse.json({ error: "رقم العقد مكرر، يرجى المحاولة مرة أخرى", code: "DUPLICATE_CONTRACT_NUMBER" }, { status: 409 });
      }
      throw e;
    }
  } catch (error) {
    return NextResponse.json({ error: "Failed to create contract" }, { status: traceError("[contracts:POST] create failed", error) });
  }
}
