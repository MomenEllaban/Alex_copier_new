import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAction } from "@/lib/auth-helpers";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("companies", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if ("name" in body) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "اسم الشركة مطلوب", code: "NAME_REQUIRED" }, { status: 400 });
      }
      data.name = name;
    }
    for (const field of ["nameAr", "taxNumber", "tradeRegister", "address", "phone", "email"] as const) {
      if (field in body) {
        const value = body[field];
        data[field] = typeof value === "string" && value.trim() !== "" ? value.trim() : null;
      }
    }
    if ("isActive" in body) data.isActive = body.isActive === true;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات للتحديث", code: "NO_CHANGES" }, { status: 400 });
    }

    const company = await prisma.company.update({ where: { id }, data });
    return NextResponse.json(company);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "اسم الشركة مستخدم بالفعل", code: "DUPLICATE_COMPANY_NAME" },
        { status: 409 },
      );
    }
    console.error("[companies] PUT failed:", error);
    return NextResponse.json({ error: "Failed to update company", code: "UPDATE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("companies", "delete");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { id } = await params;
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" }, { status: 404 });
    }

    const [usersCount, productsCount, warehousesCount, machinesCount, customersLedgerCount, expensesCount] =
      await Promise.all([
        prisma.user.count({ where: { companyId: id } }),
        prisma.product.count({ where: { companyId: id } }),
        prisma.warehouse.count({ where: { companyId: id } }),
        prisma.machine.count({ where: { product: { companyId: id } } }),
        prisma.customerLedger.count({ where: { companyId: id } }),
        prisma.expense.count({ where: { companyId: id } }),
      ]);

    // The three seeded companies are the multi-company backbone; block deletion
    // when anything references them (business rule: never orphan master data).
    if (usersCount + productsCount + warehousesCount + machinesCount + customersLedgerCount + expensesCount > 0) {
      return NextResponse.json(
        { error: "لا يمكن حذف شركة مرتبطة ببيانات أخرى", code: "COMPANY_IN_USE" },
        { status: 409 },
      );
    }

    await prisma.company.delete({ where: { id } });
    return NextResponse.json({ message: "Company deleted" });
  } catch (error) {
    console.error("[companies] DELETE failed:", error);
    return NextResponse.json({ error: "Failed to delete company", code: "DELETE_FAILED" }, { status: 500 });
  }
}
