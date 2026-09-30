import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("hrPayroll");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { id } = await params;

    const run = await prisma.payrollRun.findUnique({
      where: { id },
      include: {
        Period: true,
        Items: {
          include: {
            Employee: {
              select: {
                id: true,
                code: true,
                fullName: true,
                fullNameAr: true,
                baseSalary: true,
                Department: { select: { name: true, nameAr: true } },
                JobTitle: { select: { title: true, titleAr: true } },
              },
            },
            Components: true,
          },
          orderBy: [{ Employee: { code: "asc" } }],
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "كشف الرواتب غير موجود" }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (error: any) {
    console.error("GET /api/hr/payroll/[id] error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch payroll run details" }, { status: 500 });
  }
}
