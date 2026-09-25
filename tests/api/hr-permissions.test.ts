import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROLE_PERMISSIONS, type Page, type Role } from "@/lib/permissions";

const mocks = vi.hoisted(() => {
  const db = {
    payrollRun: { findMany: vi.fn() },
    payrollPeriod: { findUnique: vi.fn() },
    employee: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    leaveRequest: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    attendance: { findMany: vi.fn(), create: vi.fn() },
    department: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    jobTitle: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    approvalLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { requirePageAccess: vi.fn(), requireAuth: vi.fn(), db };
});

vi.mock("@/lib/auth-helpers", () => ({
  requirePageAccess: mocks.requirePageAccess,
  requireAuth: mocks.requireAuth,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/hr/hr-notifications", () => ({
  notifyPayrollReady: vi.fn(async () => {}),
  notifyPayrollApproved: vi.fn(async () => {}),
  notifyLeaveRequested: vi.fn(async () => {}),
  notifyLeaveReviewed: vi.fn(async () => {}),
}));

import * as payroll from "@/app/api/hr/payroll/route";
import * as employees from "@/app/api/hr/employees/route";
import * as employeeById from "@/app/api/hr/employees/[id]/route";
import * as leaves from "@/app/api/hr/leaves/route";
import * as attendance from "@/app/api/hr/attendance/route";
import * as departments from "@/app/api/hr/departments/route";
import * as jobTitles from "@/app/api/hr/job-titles/route";

const GET = () => new Request("http://localhost/api/hr");
const POST = () => new Request("http://localhost/api/hr", { method: "POST" });
const PATCH = () => new Request("http://localhost/api/hr", { method: "PATCH" });
const params = (id = "e1") => ({ params: Promise.resolve({ id }) });

/** Every HR endpoint paired with the page it is supposed to require. */
const ENDPOINTS: {
  label: string;
  page: Page;
  call: () => Promise<Response>;
  /** Prisma model that must stay untouched when access is denied. */
  model: keyof typeof mocks.db;
}[] = [
  { label: "GET /api/hr/payroll", page: "hrPayroll", model: "payrollRun", call: () => payroll.GET(GET()) },
  { label: "POST /api/hr/payroll", page: "hrPayroll", model: "payrollRun", call: () => payroll.POST(POST()) },
  { label: "GET /api/hr/employees", page: "hrEmployees", model: "employee", call: () => employees.GET(GET()) },
  { label: "POST /api/hr/employees", page: "hrEmployees", model: "employee", call: () => employees.POST(POST()) },
  { label: "GET /api/hr/employees/[id]", page: "hrEmployees", model: "employee", call: () => employeeById.GET(GET(), params()) },
  { label: "PUT /api/hr/employees/[id]", page: "hrEmployees", model: "employee", call: () => employeeById.PUT(POST(), params()) },
  { label: "DELETE /api/hr/employees/[id]", page: "hrEmployees", model: "employee", call: () => employeeById.DELETE(GET(), params()) },
  { label: "GET /api/hr/leaves", page: "hrLeaves", model: "leaveRequest", call: () => leaves.GET(GET()) },
  { label: "POST /api/hr/leaves", page: "hrLeaves", model: "leaveRequest", call: () => leaves.POST(POST()) },
  { label: "PATCH /api/hr/leaves", page: "hrLeaves", model: "leaveRequest", call: () => leaves.PATCH(PATCH()) },
  { label: "GET /api/hr/attendance", page: "hrAttendance", model: "attendance", call: () => attendance.GET(GET()) },
  { label: "POST /api/hr/attendance", page: "hrAttendance", model: "attendance", call: () => attendance.POST(POST()) },
  { label: "GET /api/hr/departments", page: "hrSettings", model: "department", call: () => departments.GET() },
  { label: "POST /api/hr/departments", page: "hrSettings", model: "department", call: () => departments.POST(POST()) },
  { label: "GET /api/hr/job-titles", page: "hrSettings", model: "jobTitle", call: () => jobTitles.GET() },
  { label: "POST /api/hr/job-titles", page: "hrSettings", model: "jobTitle", call: () => jobTitles.POST(POST()) },
];

describe("HR API — page access is enforced on every endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "u1", role: "GENERAL_MANAGER", companyId: "c1" });
    mocks.requirePageAccess.mockResolvedValue({ id: "u1", role: "GENERAL_MANAGER", companyId: "c1" });
  });

  describe.each(ENDPOINTS)("$label", ({ page, call, model }) => {
    /** No method on the guarded model may be reached when access is denied. */
    const expectModelUntouched = () => {
      const methods = Object.values(mocks.db[model] as Record<string, { mock: { calls: unknown[] } }>);
      expect(methods.length).toBeGreaterThan(0);
      expect(methods.filter((m) => m.mock.calls.length > 0)).toEqual([]);
    };

    it("rejects unauthenticated requests with 401", async () => {
      mocks.requireAuth.mockResolvedValue(null);
      mocks.requirePageAccess.mockResolvedValue(null);

      const res = await call();

      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe("UNAUTHORIZED");
      expectModelUntouched();
    });

    it("rejects an authenticated user without the page with 403", async () => {
      // EMPLOYEE is a real role that is authenticated but has no HR page access.
      mocks.requireAuth.mockResolvedValue({ id: "u9", role: "EMPLOYEE", companyId: "c1" });
      mocks.requirePageAccess.mockResolvedValue(null);

      const res = await call();

      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("FORBIDDEN");
      expectModelUntouched();
    });
  });

  it("requires the page key the endpoint claims (guard is not a blanket requireAuth)", async () => {
    await payroll.GET(GET());
    expect(mocks.requirePageAccess).toHaveBeenCalledWith("hrPayroll");

    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue({ id: "u1", role: "HR_MANAGER" });
    await attendance.GET(GET());
    expect(mocks.requirePageAccess).toHaveBeenCalledWith("hrAttendance");
  });

  it("lets a role that holds the page through", async () => {
    mocks.db.department.findMany.mockResolvedValue([]);
    mocks.requireAuth.mockResolvedValue({ id: "u2", role: "HR_MANAGER", companyId: "c1" });
    mocks.requirePageAccess.mockImplementation(async (p: Page) =>
      (ROLE_PERMISSIONS.HR_MANAGER as Page[]).includes(p)
        ? { id: "u2", role: "HR_MANAGER", companyId: "c1" }
        : null,
    );

    const res = await departments.GET();

    expect(res.status).toBe(200);
    expect(mocks.db.department.findMany).toHaveBeenCalled();
  });

  it("blocks an ACCOUNTANT from employee records even though they hold hrPayroll", async () => {
    const role: Role = "ACCOUNTANT";
    mocks.requireAuth.mockResolvedValue({ id: "u3", role, companyId: "c1" });
    mocks.requirePageAccess.mockImplementation(async (p: Page) =>
      (ROLE_PERMISSIONS[role] as Page[]).includes(p)
        ? { id: "u3", role, companyId: "c1" }
        : null,
    );

    const res = await employees.GET(GET());

    expect(res.status).toBe(403);
    expect(mocks.db.employee.findMany).not.toHaveBeenCalled();
  });
});
