import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { generateStatementToken } from "@/lib/statement-token";

export async function GET() {
  try {
    const user = await requirePageAccess("customers");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    // Engineers only see their assigned customers (Customer.engineerId).
    let engineerFilter: { engineerId: string } | undefined;
    const role = (user as { role?: string }).role;
    if (role === "ENGINEER") {
      const userId = (user as { id?: string }).id ?? "";
      const mine = await prisma.engineer.findUnique({ where: { userId }, select: { id: true } });
      engineerFilter = { engineerId: mine?.id ?? "__none__" };
    }
    const customers = await prisma.customer.findMany({
      where: engineerFilter,
      include: {
        locations: true,
        ledgers: true,
        engineer: { select: { id: true, name: true } },
        payments: { orderBy: { paymentDate: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(customers);
  } catch {
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePageAccess("customers");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const body = await request.json();
    const { companyId, name, phone, email, address, customerType, taxNumber, creditLimit, companyName, contactPerson, whatsapp, city, governorate, gpsLat, gpsLng, tradeRegister, paymentTerms, totalDebt, remainingDebt, notes, engineerId } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "اسم العميل مطلوب", code: "NAME_REQUIRED" }, { status: 400 });
    }

    if (engineerId) {
      const engineer = await prisma.engineer.findUnique({ where: { id: String(engineerId) }, select: { id: true } });
      if (!engineer) {
        return NextResponse.json({ error: "المهندس غير موجود", code: "ENGINEER_NOT_FOUND" }, { status: 400 });
      }
    }

    if (companyId) {
      const company = await prisma.company.findUnique({ where: { id: String(companyId) }, select: { id: true } });
      if (!company) {
        return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 400 });
      }
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        statementToken: generateStatementToken(),
        phone: phone ?? undefined,
        email: email ?? undefined,
        address: address ?? undefined,
        customerType: customerType ?? undefined,
        taxNumber: taxNumber ?? undefined,
        creditLimit: creditLimit != null ? Number(creditLimit) : undefined,
        companyName: companyName ?? undefined,
        contactPerson: contactPerson ?? undefined,
        whatsapp: whatsapp ?? undefined,
        city: city ?? undefined,
        governorate: governorate ?? undefined,
        gpsLat: gpsLat != null ? Number(gpsLat) : undefined,
        gpsLng: gpsLng != null ? Number(gpsLng) : undefined,
        tradeRegister: tradeRegister ?? undefined,
        paymentTerms: paymentTerms ?? undefined,
        notes: notes != null && String(notes).trim() !== "" ? String(notes).trim() : undefined,
        engineerId: engineerId ? String(engineerId) : undefined,
        totalDebt: totalDebt != null ? Math.max(0, Number(totalDebt)) : 0,
        remainingDebt: remainingDebt != null ? Math.max(0, Number(remainingDebt)) : (totalDebt != null ? Math.max(0, Number(totalDebt)) : 0),
      },
      include: {
        locations: true,
        ledgers: true,
      },
    });

    if (companyId) {
      await prisma.customerLedger.upsert({
        where: { customerId_companyId: { customerId: customer.id, companyId: String(companyId) } },
        update: {},
        create: { customerId: customer.id, companyId: String(companyId), balance: 0 },
      });
    }

    const customerWithLedger = await prisma.customer.findUnique({
      where: { id: customer.id },
      include: { locations: true, ledgers: true },
    });

    return NextResponse.json(customerWithLedger ?? customer, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
