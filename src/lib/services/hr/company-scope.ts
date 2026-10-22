import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canActOnCompany, type CompanyScopedActor } from "@/lib/company-scope";

/**
 * Company scoping for the HR module.
 *
 * Every employee belongs to exactly one company (`Employee.companyId` is
 * NOT NULL), and every HR record — advance, loan, bonus, penalty, payroll
 * run — belongs to a company too. Without a check, a request could name one
 * company and an employee of another, and the record would land in the wrong
 * company's books. These helpers make "the employee's company" the thing the
 * request is measured against, instead of trusting whatever the body says.
 *
 * Who may touch which company is decided by the shared rules in
 * `@/lib/company-scope`: a group-level user (the general manager) works
 * across the group, a company-scoped user stays inside their own company.
 */

export type { CompanyScopedActor };

/**
 * 403 when the actor is tied to a company and this is not it. Returns null
 * when the request may go ahead.
 */
export function crossCompanyResponse(
  actor: CompanyScopedActor,
  companyId: string | null | undefined
): NextResponse | null {
  if (!canActOnCompany(actor, companyId)) {
    return NextResponse.json(
      { error: "هذا السجل يخص شركة أخرى", code: "CROSS_COMPANY" },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Looks an employee up inside one company only. Returns null when the
 * employee does not exist there — which covers both "no such employee" and
 * "the employee belongs to another company", because the caller must not be
 * able to tell the two apart.
 */
export async function findEmployeeInCompany(employeeId: string, companyId: string) {
  return prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: {
      id: true,
      code: true,
      fullName: true,
      fullNameAr: true,
      companyId: true,
      baseSalary: true,
      status: true,
    },
  });
}

/**
 * Looks an employee up for an actor that may work on several companies.
 *
 * The employee's own company decides whether the actor may act on them: a
 * company-scoped user only reaches their own employees, a group-level user
 * (the general manager) reaches every employee. Returns null when the
 * employee does not exist or is out of the actor's reach.
 */
export async function findEmployeeForActor(
  actor: CompanyScopedActor,
  employeeId: string
) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId },
    select: {
      id: true,
      code: true,
      fullName: true,
      fullNameAr: true,
      companyId: true,
      baseSalary: true,
      status: true,
    },
  });
  if (!employee) return null;
  if (!canActOnCompany(actor, employee.companyId)) return null;
  return employee;
}

/** 400 when the employee is not part of the company the request works on. */
export function employeeNotInCompanyResponse(): NextResponse {
  return NextResponse.json(
    { error: "الموظف غير مسجل في هذه الشركة", code: "EMPLOYEE_NOT_IN_COMPANY" },
    { status: 400 },
  );
}

/**
 * Fetches a record by id and refuses it when it belongs to another company.
 *
 * The lookup is passed in rather than the id, because the record may live in
 * a child table (a loan installment) whose company sits on the parent row.
 */
export async function scopedRecord<T extends { companyId: string }>(
  actor: CompanyScopedActor,
  label: string,
  findUnique: () => Promise<T | null>
): Promise<{ record: T } | { response: NextResponse }> {
  const record = await findUnique();

  if (!record) {
    return {
      response: NextResponse.json({ error: `${label} غير موجود` }, { status: 404 }),
    };
  }

  const denied = crossCompanyResponse(actor, record.companyId);
  if (denied) return { response: denied };

  return { record };
}
