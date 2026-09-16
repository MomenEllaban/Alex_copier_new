import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const actor = await requireAuth();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const where: any = {};
    if (actor.companyId) where.companyId = actor.companyId;

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
    const actor = await requireAuth();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { code, name, nameAr, managerId } = body;
    const companyId = actor.companyId || body.companyId;

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
