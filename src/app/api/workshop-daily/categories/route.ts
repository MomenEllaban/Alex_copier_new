import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAction } from "@/lib/auth-helpers";
import { getWorkshopCompany } from "@/lib/workshop-daily";

/**
 * The categories the workshop files its movements under — transfers,
 * electricity, water… They are the company's own expense categories, so a
 * confirmed outgoing entry posts to the books under the very same category.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const actor = await requireAction("workshopDaily", "view");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const company = await getWorkshopCompany();
    if (!company) {
      return NextResponse.json({ error: "شركة القطاعى غير موجودة", code: "WORKSHOP_COMPANY_NOT_FOUND" }, { status: 500 });
    }

    const categories = await prisma.expenseCategory.findMany({
      where: { companyId: company.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(categories);
  } catch {
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireAction("workshopDaily", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const company = await getWorkshopCompany();
    if (!company) {
      return NextResponse.json({ error: "شركة القطاعى غير موجودة", code: "WORKSHOP_COMPANY_NOT_FOUND" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "اسم التصنيف مطلوب", code: "CATEGORY_NAME_REQUIRED" }, { status: 400 });
    }

    const existing = await prisma.expenseCategory.findFirst({
      where: { companyId: company.id, name },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "هذا التصنيف موجود بالفعل", code: "CATEGORY_EXISTS" }, { status: 409 });
    }

    const category = await prisma.expenseCategory.create({
      data: { name, companyId: company.id },
      select: { id: true, name: true },
    });
    return NextResponse.json(category, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
