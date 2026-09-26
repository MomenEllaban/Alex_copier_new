import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const user = await requirePageAccess("warehouses");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const warehouses = await prisma.warehouse.findMany({
      include: {
        company: true,
        _count: { select: { inventory: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(warehouses);
  } catch (error) {
    console.error("[warehouses] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch warehouses", code: "FETCH_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAction("inventory", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "اسم المستودع مطلوب", code: "NAME_REQUIRED" },
        { status: 400 },
      );
    }

    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      return NextResponse.json(
        { error: "الشركة مطلوبة", code: "COMPANY_REQUIRED" },
        { status: 400 },
      );
    }
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) {
      return NextResponse.json(
        { error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" },
        { status: 400 },
      );
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        name,
        companyId,
        isMain: body.isMain === true,
      },
      include: { company: true },
    });

    return NextResponse.json(warehouse, { status: 201 });
  } catch (error) {
    console.error("[warehouses] POST failed:", error);
    return NextResponse.json({ error: "Failed to create warehouse", code: "CREATE_FAILED" }, { status: 500 });
  }
}
