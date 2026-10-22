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
import { errorMessage } from "@/lib/prisma-errors";
import { Prisma } from "@/generated/prisma/client";
import { enumFilter } from "@/lib/enum-filter";
import { ADVANCE_STATUSES } from "@/lib/hr/hr-statuses";
import {
  crossCompanyResponse,
  employeeNotInCompanyResponse,
  findEmployeeForActor,
  findEmployeeInCompany,
  scopedRecord,
} from "@/lib/services/hr/company-scope";
import { companyScopeFilter } from "@/lib/company-scope";

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
    const status = enumFilter(searchParams.get("status"), ADVANCE_STATUSES);
    const summaryOnly = searchParams.get("summaryOnly");

    const scopeCompanyId = companyScopeFilter(actor, searchParams.get("companyId"));

    if (employeeId && summaryOnly === "true") {
      if (scopeCompanyId) {
        const emp = await findEmployeeInCompany(employeeId, scopeCompanyId);
        if (!emp) return employeeNotInCompanyResponse();
      }
      const summary = await getEmployeeLoanSummary(employeeId);
      return NextResponse.json(summary);
    }

    const where: Prisma.EmployeeLoanWhereInput = {};
    if (scopeCompanyId) where.companyId = scopeCompanyId;
    if (employeeId) {
      if (scopeCompanyId) {
        const emp = await findEmployeeInCompany(employeeId, scopeCompanyId);
        if (!emp) return employeeNotInCompanyResponse();
      }
      where.employeeId = employeeId;
    }
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
  } catch (error) {
    console.error("GET /api/hr/loans error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to fetch loans") }, { status: 500 });
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

    if (!body.employeeId || !body.totalAmount || !body.installmentCount || !body.startDate) {
      return NextResponse.json({ error: "Missing required loan fields" }, { status: 400 });
    }

    // The loan belongs to the employee, so the employee's company is the
    // company it is booked in — whatever the body says.
    const employee = await findEmployeeForActor(actor, body.employeeId);
    if (!employee) return employeeNotInCompanyResponse();
    if (body.companyId && String(body.companyId) !== employee.companyId) {
      return employeeNotInCompanyResponse();
    }
    const companyId = employee.companyId;

    const loan = await createLoan(
      {
        companyId,
        employeeId: body.employeeId,
        totalAmount: parseFloat(body.totalAmount),
        installmentCount: parseInt(body.installmentCount),
        startDate: new Date(body.startDate),
        reason: body.reason || "طلب قرض موظف",
      }
    );

    return NextResponse.json(loan, { status: 201 });
  } catch (error) {
    console.error("POST /api/hr/loans error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to create loan") }, { status: 400 });
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

    const targetLoanId = id || loanId;
    if (targetLoanId) {
      const scoped = await scopedRecord(actor, "القرض", () => prisma.employeeLoan.findUnique({ where: { id: targetLoanId } }));
      if ("response" in scoped) return scoped.response;
    }
    if (installmentId) {
      const inst = await prisma.loanInstallment.findUnique({
        where: { id: installmentId },
        include: { Loan: true },
      });
      if (!inst) return NextResponse.json({ error: "القسط غير موجود" }, { status: 404 });
      const denied = crossCompanyResponse(actor, inst.Loan.companyId);
      if (denied) return denied;
    }

    let result;

    if (action === "approve") {
      if (!targetLoanId) return NextResponse.json({ error: "loanId required" }, { status: 400 });
      result = await approveLoan(targetLoanId, actor.id);
    } else if (action === "disburse") {
      if (!targetLoanId) return NextResponse.json({ error: "loanId required" }, { status: 400 });
      result = await disburseLoan(targetLoanId, actor.id, disbursementMethod, treasuryAccountId);
    } else if (action === "reject") {
      if (!targetLoanId) return NextResponse.json({ error: "loanId required" }, { status: 400 });
      result = await rejectLoan(targetLoanId, actor.id, reason);
    } else if (action === "postponeInstallment") {
      if (!installmentId) return NextResponse.json({ error: "installmentId required" }, { status: 400 });
      result = await postponeInstallment(installmentId, actor.id, reason || "تأجيل بطلب الإدارة");
    } else if (action === "earlyPayoffInstallment") {
      if (!installmentId) return NextResponse.json({ error: "installmentId required" }, { status: 400 });
      result = await earlyPayoffInstallment(installmentId, actor.id);
    } else if (action === "earlyPayoffLoan") {
      if (!targetLoanId) return NextResponse.json({ error: "loanId required" }, { status: 400 });
      result = await earlyPayoffLoan(targetLoanId, actor.id);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/hr/loans error:", error);
    return NextResponse.json({ error: errorMessage(error, "Failed to update loan") }, { status: 400 });
  }
}
