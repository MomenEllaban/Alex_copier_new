import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

async function guardMutations() {
  const actor = await requirePageAccess("customers");
  if (actor) return { actor };
  const authed = await requireAuth();
  return {
    actor: null,
    response: NextResponse.json(
      { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
      { status: authed ? 403 : 401 },
    ),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        locations: true,
        ledgers: true,
        orders: true,
        contracts: true,
        serviceRequests: true,
        machines: true,
        engineer: { select: { id: true, name: true } },
        payments: { orderBy: { paymentDate: "desc" } },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // Engineers may only open their assigned customers.
    const role = (user as { role?: string }).role;
    if (role === "ENGINEER") {
      const userId = (user as { id?: string }).id ?? "";
      const mine = await prisma.engineer.findUnique({ where: { userId }, select: { id: true } });
      if (!mine || customer.engineerId !== mine.id) {
        return NextResponse.json({ error: "هذا العميل غير مسند إليك", code: "CUSTOMER_NOT_ASSIGNED" }, { status: 403 });
      }
    }

    return NextResponse.json(customer);
  } catch {
    return NextResponse.json({ error: "Failed to fetch customer" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { actor, response } = await guardMutations();
    if (!actor && response) return response;
    const { id } = await params;
    const body = await request.json();

    if ("name" in body && (typeof body.name !== "string" || body.name.trim() === "")) {
      return NextResponse.json({ error: "اسم العميل مطلوب", code: "NAME_REQUIRED" }, { status: 400 });
    }

    const {
      name, phone, email, address, customerType, taxNumber, creditLimit,
      companyName, contactPerson, whatsapp, city, governorate, gpsLat, gpsLng, tradeRegister, paymentTerms,
      totalDebt, remainingDebt, notes, engineerId,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (address !== undefined) updateData.address = address;
    if (customerType !== undefined) updateData.customerType = customerType;
    if (taxNumber !== undefined) updateData.taxNumber = taxNumber;
    if (creditLimit !== undefined) updateData.creditLimit = Number(creditLimit);
    if (companyName !== undefined) updateData.companyName = companyName;
    if (contactPerson !== undefined) updateData.contactPerson = contactPerson;
    if (whatsapp !== undefined) updateData.whatsapp = whatsapp;
    if (city !== undefined) updateData.city = city;
    if (governorate !== undefined) updateData.governorate = governorate;
    if (gpsLat !== undefined) updateData.gpsLat = gpsLat != null ? Number(gpsLat) : null;
    if (gpsLng !== undefined) updateData.gpsLng = gpsLng != null ? Number(gpsLng) : null;
    if (tradeRegister !== undefined) updateData.tradeRegister = tradeRegister;
    if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms;
    if (totalDebt !== undefined) updateData.totalDebt = Math.max(0, Number(totalDebt));
    if (remainingDebt !== undefined) updateData.remainingDebt = Math.max(0, Number(remainingDebt));
    if (notes !== undefined) updateData.notes = notes != null && String(notes).trim() !== "" ? String(notes).trim() : null;
    if (engineerId !== undefined) {
      if (engineerId == null || String(engineerId).trim() === "") {
        updateData.engineerId = null;
      } else {
        const engineer = await prisma.engineer.findUnique({ where: { id: String(engineerId) }, select: { id: true } });
        if (!engineer) {
          return NextResponse.json({ error: "المهندس غير موجود", code: "ENGINEER_NOT_FOUND" }, { status: 400 });
        }
        updateData.engineerId = engineer.id;
      }
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: updateData,
      include: {
        locations: true,
        ledgers: true,
      },
    });

    return NextResponse.json(customer);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Customer not found", code: "NOT_FOUND" }, { status: 404 });
    }
    console.error("[customers] PUT failed:", error);
    return NextResponse.json({ error: "Failed to update customer", code: "UPDATE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { actor, response } = await guardMutations();
    if (!actor && response) return response;
    const { id } = await params;

    const [machinesCount, requestsCount, contractsCount, salesOrdersCount, settlementsCount] = await Promise.all([
      prisma.machine.count({ where: { currentOwnerId: id } }),
      prisma.serviceRequest.count({ where: { customerId: id } }),
      prisma.contract.count({ where: { customerId: id } }),
      prisma.salesOrder.count({ where: { customerId: id } }),
      prisma.settlement.count({ where: { customerId: id } }),
    ]);
    if (machinesCount + requestsCount + contractsCount + salesOrdersCount + settlementsCount > 0) {
      return NextResponse.json(
        { error: "لا يمكن حذف عميل مرتبط بماكينات أو عقود أو طلبات صيانة أو أوامر بيع أو تسوية", code: "CUSTOMER_IN_USE" },
        { status: 409 },
      );
    }

    await prisma.customer.delete({ where: { id } });
    return NextResponse.json({ message: "Customer deleted" });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Customer not found", code: "NOT_FOUND" }, { status: 404 });
    }
    console.error("[customers] DELETE failed:", error);
    return NextResponse.json({ error: "Failed to delete customer", code: "DELETE_FAILED" }, { status: 500 });
  }
}
