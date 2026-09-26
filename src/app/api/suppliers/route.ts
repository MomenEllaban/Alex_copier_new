import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const user = await requirePageAccess("suppliers");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const suppliers = await prisma.supplier.findMany({
      include: {
        company: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(suppliers);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch suppliers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAction("suppliers", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";

    if (!name || !companyId) {
      return NextResponse.json({ error: "Supplier name and company are required" }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) {
      return NextResponse.json({ error: "Selected company does not exist" }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        name,
        companyId,
        contactName: typeof body.contactName === "string" ? body.contactName.trim() : null,
        phone: typeof body.phone === "string" ? body.phone.trim() : null,
        email: typeof body.email === "string" ? body.email.trim() : null,
        address: typeof body.address === "string" ? body.address.trim() : null,
        taxNumber: typeof body.taxNumber === "string" ? body.taxNumber.trim() : null,
      },
      include: {
        company: true,
      },
    });
    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 });
  }
}
