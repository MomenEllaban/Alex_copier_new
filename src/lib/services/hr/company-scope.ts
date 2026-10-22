import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Company scoping for the HR module.
 *
 * Every employee belongs to exactly one company (`Employee.companyId` is
 * NOT NULL), and every HR record — advance, loan, bonus, penalty, payroll
 * run — belongs to a company too. Without a check, a request could name one
 * company and an employee of another, and the record would land in the wrong
 * company's books. These helpers make "the employee's company" the thing the
 * request is measured against, instead of trusting whatever the body says.
 */

export interface CompanyScopedActor {
  id: string;
  companyId?: string | null;
}

/**
 * The company a request acts on.
 *
 * A user tied to a company can only ever act on that company: their own
 * company wins over anything the body asks for. A group-level user (no
 * company of their own) names the company it wants to work on.
 */
export function resolveCompanyId(
  actor: CompanyScopedActor,
  requested?: string | null
): string | null {
  return actor.companyId || requested || null;
}

/**
 * 403 when the actor is tied to a company and this is not it. Returns null
 * when the request may go ahead.
 */
export function crossCompanyResponse(
  actor: CompanyScopedActor,
  companyId: string | null | undefined
): NextResponse | null {
  if (actor.companyId && companyId && actor.companyId !== companyId) {
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
