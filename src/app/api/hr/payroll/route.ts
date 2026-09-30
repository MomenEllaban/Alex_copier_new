import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import { notifyPayrollReady, notifyPayrollApproved } from "@/lib/hr/hr-notifications";
import {
  calculatePayrollRun,
  approvePayrollRun,
  lockPayrollRun,
} from "@/lib/services/hr/payroll-service";

export async function GET(request: Request) {
  try {
    const actor = await requirePageAccess("hrPayroll");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");
    const monthStr = searchParams.get("month");
    const yearStr = searchParams.get("year");

    if (runId) {
      const run = await prisma.payrollRun.findUnique({
        where: { id: runId },
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
    }

    const where: any = {};
    if (actor.companyId) where.companyId = actor.companyId;
    if (monthStr && yearStr) {
      where.Period = {
        month: parseInt(monthStr),
        year: parseInt(yearStr),
      };
    }

    const runs = await prisma.payrollRun.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        Period: true,
        _count: { select: { Items: true } },
      },
    });

    return NextResponse.json(runs);
  } catch (error) {
    console.error("GET /api/hr/payroll error:", error);
    return NextResponse.json({ error: "Failed to fetch payroll runs" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAction("hrPayroll", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const body = await request.json();
    const { action, companyId: requestedCompanyId, month, year, runId } = body;
    const companyId = actor.companyId || requestedCompanyId;
    const actorId = actor.id;

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    // ─── CALCULATE ────────────────────────────────
    if (action === "calculate") {
      if (!month || !year) {
        return NextResponse.json({ error: "month and year are required" }, { status: 400 });
      }

      const payrollRun = await calculatePayrollRun({
        companyId,
        month: Number(month),
        year: Number(year),
        actorId,
      });

      notifyPayrollReady({ month: Number(month), year: Number(year), actorId }).catch(() => {});

      return NextResponse.json(payrollRun, { status: 201 });
    }

    // ─── APPROVE ──────────────────────────────────
    if (action === "approve") {
      if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

      const updated = await approvePayrollRun(runId, actorId);
      notifyPayrollApproved({ month: updated.Period.month, year: updated.Period.year, actorId }).catch(() => {});

      return NextResponse.json(updated);
    }

    // ─── LOCK ─────────────────────────────────────
    if (action === "lock") {
      if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

      const result = await lockPayrollRun(runId, actorId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("POST /api/hr/payroll error:", error);
    return NextResponse.json({ error: error.message || "Failed to process payroll" }, { status: 400 });
  }
}
