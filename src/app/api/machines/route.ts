import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import { traceError } from "@/lib/prisma-errors";

export async function GET() {
  try {
    const user = await requirePageAccess("machines");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const machines = await prisma.machine.findMany({
      include: {
        history: true,
        meterReadings: true,
        currentOwner: true,
        product: true,
        customerLocation: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(machines);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch machines" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {

    const actor = await requireAction("machines", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
        const body = await request.json();
    const { currentOwnerId, companyId, ...data } = body;

    for (const key of ["deliveryBlack", "deliveryColor"] as const) {
      if (data[key] != null && data[key] !== "") data[key] = Number(data[key]);
      else if (key in data) data[key] = null;
    }

    if (currentOwnerId) {
      const owner = await prisma.customer.findUnique({ where: { id: currentOwnerId }, select: { id: true } });
      if (!owner) {
        return NextResponse.json({ error: "المالك الحالي غير موجود", code: "CUSTOMER_NOT_FOUND" }, { status: 400 });
      }
    }
    if (companyId) {
      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
      if (!company) {
        return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 400 });
      }
    }
    if (data.productId) {
      const product = await prisma.product.findUnique({ where: { id: data.productId }, select: { id: true } });
      if (!product) {
        return NextResponse.json({ error: "المنتج غير موجود", code: "PRODUCT_NOT_FOUND" }, { status: 400 });
      }
    }

    const machine = await prisma.machine.create({
      data: { ...data, currentOwnerId: currentOwnerId || null },
      include: {
        history: true,
        meterReadings: true,
        currentOwner: true,
        product: true,
      },
    });

    // Ownership is part of the machine's lifecycle.  Only create a history
    // event when the caller has a real company context for the event.
    if (currentOwnerId && companyId) {
      await prisma.machineOwnerHistory.create({
        data: {
          machineId: machine.id,
          transactionType: "SALE",
          customerId: currentOwnerId,
          companyId,
        },
      });
    }

    return NextResponse.json(machine, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create machine" }, { status: traceError("[machines:POST] create failed", error) });
  }
}
