import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAction } from "@/lib/auth-helpers";
import { getWorkshopCompany } from "@/lib/workshop-daily";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireAction("workshopDaily", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }
    const { id } = await params;

    const company = await getWorkshopCompany();
    if (!company) {
      return NextResponse.json({ error: "شركة القطاعى غير موجودة", code: "WORKSHOP_COMPANY_NOT_FOUND" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "اسم التصنيف مطلوب", code: "CATEGORY_NAME_REQUIRED" }, { status: 400 });
    }

    const category = await prisma.expenseCategory.findFirst({
      where: { id, companyId: company.id },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json({ error: "التصنيف غير موجود", code: "CATEGORY_NOT_FOUND" }, { status: 404 });
    }

    const duplicate = await prisma.expenseCategory.findFirst({
      where: { companyId: company.id, name, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: "هذا التصنيف موجود بالفعل", code: "CATEGORY_EXISTS" }, { status: 409 });
    }

    const updated = await prisma.expenseCategory.update({
      where: { id },
      data: { name },
      select: { id: true, name: true },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireAction("workshopDaily", "delete");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }
    const { id } = await params;

    const company = await getWorkshopCompany();
    if (!company) {
      return NextResponse.json({ error: "شركة القطاعى غير موجودة", code: "WORKSHOP_COMPANY_NOT_FOUND" }, { status: 500 });
    }

    const category = await prisma.expenseCategory.findFirst({
      where: { id, companyId: company.id },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json({ error: "التصنيف غير موجود", code: "CATEGORY_NOT_FOUND" }, { status: 404 });
    }

    // A category that entries or expenses are filed under cannot go: the
    // history would lose the name it was booked with.
    const [usedByTransactions, usedByExpenses] = await Promise.all([
      prisma.workshopTransaction.count({ where: { categoryId: id } }),
      prisma.expense.count({ where: { categoryId: id } }),
    ]);
    if (usedByTransactions > 0 || usedByExpenses > 0) {
      return NextResponse.json(
        { error: "التصنيف مستخدم في حركات مسجلة — لا يمكن حذفه", code: "CATEGORY_IN_USE" },
        { status: 409 },
      );
    }

    await prisma.expenseCategory.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
