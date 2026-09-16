import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const actor = await requireAuth();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const where: any = {};
    if (actor.companyId) where.companyId = actor.companyId;

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
    const actor = await requireAuth();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { title, titleAr } = body;
    const companyId = actor.companyId || body.companyId;

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
