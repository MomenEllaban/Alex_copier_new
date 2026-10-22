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
    const where: Prisma.JobTitleWhereInput = {};
    const scopeCompanyId = companyScopeFilter(actor, searchParams.get("companyId"));
    if (scopeCompanyId) where.companyId = scopeCompanyId;

    const titles = await prisma.jobTitle.findMany({
      where,
      orderBy: { title: "asc" },
      include: {
        _count: { select: { Employees: true } },
      },
    });

    return NextResponse.json(titles);
  } catch (error) {
    console.error("GET /api/hr/job-titles error:", error);
    return NextResponse.json({ error: "Failed to fetch job titles" }, { status: 500 });
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
    const { title, titleAr } = body;
    const companyId = resolveCompanyId(actor, body.companyId);

    if (!title || !companyId) {
      return NextResponse.json({ error: "title and companyId are required" }, { status: 400 });
    }

    const jobTitle = await prisma.jobTitle.create({
      data: {
        title,
        titleAr: titleAr || null,
        companyId,
      },
    });

    return NextResponse.json(jobTitle, { status: 201 });
  } catch (error) {
    console.error("POST /api/hr/job-titles error:", error);
    return NextResponse.json({ error: "Failed to create job title" }, { status: 500 });
  }
}
