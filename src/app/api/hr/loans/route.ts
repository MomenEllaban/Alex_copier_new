import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import {
  createLoan,
  approveLoan,
  disburseLoan,
  rejectLoan,
  postponeInstallment,
  earlyPayoffInstallment,
  earlyPayoffLoan,
  getEmployeeLoanSummary,
} from "@/lib/services/hr/loan-advance-service";

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
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");
    const summaryOnly = searchParams.get("summaryOnly");

    if (employeeId && summaryOnly === "true") {
      const summary = await getEmployeeLoanSummary(employeeId);
      return NextResponse.json(summary);
    }

    const where: any = {};
    if (actor.companyId) where.companyId = actor.companyId;
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    const loans = await prisma.employeeLoan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        Employee: {
          select: {
            id: true,
            code: true,
            fullName: true,
            fullNameAr: true,
            baseSalary: true,
            Department: { select: { name: true, nameAr: true } },
          },
        },
        Installments: {
          orderBy: { installmentNo: "asc" },
        },
      },
    });

    return NextResponse.json(loans);
  } catch (error: any) {
    console.error("GET /api/hr/loans error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch loans" }, { status: 500 });
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
    const companyId = actor.companyId || body.companyId;

    if (!companyId || !body.employeeId || !body.totalAmount || !body.installmentCount || !body.startDate) {
      return NextResponse.json({ error: "Missing required loan fields" }, { status: 400 });
    }

    const loan = await createLoan(
      {
        companyId,
        employeeId: body.employeeId,
        totalAmount: parseFloat(body.totalAmount),
        installmentCount: parseInt(body.installmentCount),
        startDate: new Date(body.startDate),
        reason: body.reason || "طلب قرض موظف",
      },
      actor.id
    );

    return NextResponse.json(loan, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/hr/loans error:", error);
    return NextResponse.json({ error: error.message || "Failed to create loan" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAction("hrPayroll", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const body = await request.json();
    const { action, id, installmentId, loanId, reason, disbursementMethod, treasuryAccountId } = body;

    let result;

    if (action === "approve") {
      if (!id && !loanId) return NextResponse.json({ error: "loanId required" }, { status: 400 });
      result = await approveLoan(id || loanId, actor.id);
    } else if (action === "disburse") {
      if (!id && !loanId) return NextResponse.json({ error: "loanId required" }, { status: 400 });
      result = await disburseLoan(id || loanId, actor.id, disbursementMethod, treasuryAccountId);
    } else if (action === "reject") {
      if (!id && !loanId) return NextResponse.json({ error: "loanId required" }, { status: 400 });
      result = await rejectLoan(id || loanId, actor.id, reason);
    } else if (action === "postponeInstallment") {
      if (!installmentId) return NextResponse.json({ error: "installmentId required" }, { status: 400 });
      result = await postponeInstallment(installmentId, actor.id, reason || "تأجيل بطلب الإدارة");
    } else if (action === "earlyPayoffInstallment") {
      if (!installmentId) return NextResponse.json({ error: "installmentId required" }, { status: 400 });
      result = await earlyPayoffInstallment(installmentId, actor.id);
    } else if (action === "earlyPayoffLoan") {
      if (!id && !loanId) return NextResponse.json({ error: "loanId required" }, { status: 400 });
      result = await earlyPayoffLoan(id || loanId, actor.id);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("PATCH /api/hr/loans error:", error);
    return NextResponse.json({ error: error.message || "Failed to update loan" }, { status: 400 });
  }
}
