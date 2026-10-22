import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import { Prisma } from "@/generated/prisma/client";
import { companyScopeFilter, resolveCompanyId } from "@/lib/company-scope";

export async function GET(request: Request) {
  try {
    const actor = await requirePageAccess("hrSettings");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const where: Prisma.DepartmentWhereInput = {};
    const scopeCompanyId = companyScopeFilter(actor, searchParams.get("companyId"));
    if (scopeCompanyId) where.companyId = scopeCompanyId;

    const departments = await prisma.department.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { Employees: true } },
      },
    });

    return NextResponse.json(departments);
  } catch (error) {
    console.error("GET /api/hr/departments error:", error);
    return NextResponse.json({ error: "Failed to fetch departments" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAction("hrSettings", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const body = await request.json();
    const { code, name, nameAr, managerId } = body;
    const companyId = resolveCompanyId(actor, body.companyId);

    if (!code || !name || !companyId) {
      return NextResponse.json({ error: "code, name, and companyId are required" }, { status: 400 });
    }

    const existing = await prisma.department.findUnique({
      where: { companyId_code: { companyId, code } },
    });

    if (existing) {
      return NextResponse.json({ error: "كود القسم مكرر" }, { status: 400 });
    }

    const department = await prisma.department.create({
      data: {
        code,
        name,
        nameAr: nameAr || null,
        managerId: managerId || null,
        companyId,
      },
    });

    return NextResponse.json(department, { status: 201 });
  } catch (error) {
    console.error("POST /api/hr/departments error:", error);
    return NextResponse.json({ error: "Failed to create department" }, { status: 500 });
  }
}
