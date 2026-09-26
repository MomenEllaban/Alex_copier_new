import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAction } from "@/lib/auth-helpers";

// Locations belong to a customer; service requests and machines reference them.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("customers", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود", code: "CUSTOMER_NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "اسم الفرع مطلوب", code: "LOCATION_NAME_REQUIRED" }, { status: 400 });
    }

    const optionalText = (value: unknown): string | null =>
      typeof value === "string" && value.trim() !== "" ? value.trim() : null;

    const location = await prisma.customerLocation.create({
      data: {
        customerId: id,
        name,
        address: optionalText(body.address),
        city: optionalText(body.city),
        governorate: optionalText(body.governorate),
        phone: optionalText(body.phone),
      },
    });

    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    console.error("[customer-locations] POST failed:", error);
    return NextResponse.json({ error: "Failed to create location", code: "CREATE_FAILED" }, { status: 500 });
  }
}
