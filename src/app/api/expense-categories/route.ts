import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { traceError } from "@/lib/prisma-errors";

export async function GET() {
  try {
    const user = await requirePageAccess("finance");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const categories = await prisma.expenseCategory.findMany({
      include: { company: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(categories);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch expense categories" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePageAccess("finance");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const companyId = typeof body.companyId === "string" ? body.companyId : "";

    if (!name || !companyId) {
      return NextResponse.json({ error: "اسم الفئة والشركة مطلوبان" }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) {
      return NextResponse.json({ error: "الشركة غير موجودة" }, { status: 400 });
    }

    const existing = await prisma.expenseCategory.findFirst({ where: { companyId, name } });
    if (existing) {
      return NextResponse.json({ error: "هذه الفئة موجودة بالفعل" }, { status: 409 });
    }

    const category = await prisma.expenseCategory.create({
      data: { name, companyId },
      include: { company: { select: { id: true, name: true } } },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create expense category" }, { status: traceError("[expense-categories:POST] create failed", error) });
  }
}
