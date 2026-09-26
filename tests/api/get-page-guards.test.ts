import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasPageAccess, ROLE_PERMISSIONS } from "@/lib/permissions";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
  requireAnyPage: vi.fn(),
  db: {
    engineer: { findUnique: vi.fn() },
    company: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  // Action guards delegate to the page guard: these tests decide who is
  // allowed, not which action, and the page answer is what they mean.
  requireAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyPage: mocks.requireAnyPage,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/customer-statement", () => ({ buildCustomerStatement: vi.fn() }));
vi.mock("@/lib/engineer-statement", () => ({ buildEngineerStatement: vi.fn() }));

/**
 * route module -> the pages that are allowed to read it. This is the contract
 * from CODE-AUDIT 1.7: an ordinary EMPLOYEE must not be able to read money.
 */
const ROUTES: Array<[string, () => Promise<Response>, string[]]> = [
  ["reports", async () => (await import("@/app/api/reports/route")).GET(), ["reports"]],
  [
    "companies/[id]/report",
    async () => (await import("@/app/api/companies/[id]/report/route")).GET(new Request("http://x"), { params: Promise.resolve({ id: "c1" }) }),
    ["reports", "companies"],
  ],
  ["settlements", async () => (await import("@/app/api/settlements/route")).GET(), ["settlements"]],
  [
    "settlements/[id]",
    async () => (await import("@/app/api/settlements/[id]/route")).GET(new Request("http://x"), { params: Promise.resolve({ id: "s1" }) }),
    ["settlements"],
  ],
  ["invoices", async () => (await import("@/app/api/invoices/route")).GET(new Request("http://x")), ["finance"]],
  ["expenses", async () => (await import("@/app/api/expenses/route")).GET(), ["finance"]],
  ["investors", async () => (await import("@/app/api/investors/route")).GET(), ["investors"]],
  [
    "investors/[id]",
    async () => (await import("@/app/api/investors/[id]/route")).GET(new Request("http://x"), { params: Promise.resolve({ id: "i1" }) }),
    ["investors"],
  ],
  ["companies", async () => (await import("@/app/api/companies/route")).GET(), ["companies"]],
  ["customers", async () => (await import("@/app/api/customers/route")).GET(), ["customers"]],
  [
    "customers/[id]",
    async () => (await import("@/app/api/customers/[id]/route")).GET(new Request("http://x"), { params: Promise.resolve({ id: "c1" }) }),
    ["customers"],
  ],
  ["contracts", async () => (await import("@/app/api/contracts/route")).GET(), ["contracts"]],
  ["machines", async () => (await import("@/app/api/machines/route")).GET(), ["machines"]],
  ["sales", async () => (await import("@/app/api/sales/route")).GET(), ["sales"]],
  ["purchases", async () => (await import("@/app/api/purchases/route")).GET(), ["purchases"]],
  ["returns", async () => (await import("@/app/api/returns/route")).GET(), ["returns"]],
  ["suppliers", async () => (await import("@/app/api/suppliers/route")).GET(), ["suppliers"]],
  ["service-requests", async () => (await import("@/app/api/service-requests/route")).GET(), ["serviceRequests"]],
  ["workshop", async () => (await import("@/app/api/workshop/route")).GET(), ["workshop"]],
  ["warehouses", async () => (await import("@/app/api/warehouses/route")).GET(), ["warehouses"]],
  ["inventory", async () => (await import("@/app/api/inventory/route")).GET(new Request("http://x")), ["inventory"]],
  ["products", async () => (await import("@/app/api/products/route")).GET(new Request("http://x")), ["products"]],
  [
    "engineers",
    async () => (await import("@/app/api/engineers/route")).GET(),
    ["engineers"],
  ],
  [
    "engineers/[id]/statement",
    async () => (await import("@/app/api/engineers/[id]/statement/route")).GET(new Request("http://x"), { params: Promise.resolve({ id: "e1" }) }),
    ["engineers", "sales"],
  ],
  ["dashboard", async () => (await import("@/app/api/dashboard/route")).GET(), ["dashboard"]],
];

/** An ordinary employee: signed in, active, and holding almost nothing. */
const EMPLOYEE = { id: "u1", role: "EMPLOYEE" };
const GM = { id: "u2", role: "GENERAL_MANAGER" };

/** Emulates the real helpers, driven by the real permission table. */
function wireGuardsFor(user: { id: string; role: string } | null) {
  mocks.requireAuth.mockImplementation(async () => user);
  mocks.requirePageAccess.mockImplementation(async (page: string) =>
    user && hasPageAccess(user.role, page as never) ? user : null,
  );
  mocks.requireAnyPage.mockImplementation(async (...pages: string[]) =>
    user && pages.some((p) => hasPageAccess(user.role, p as never)) ? user : null,
  );
}

describe("CODE-AUDIT 1.7 — every read is page-checked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks only clears call history, not implementations, so a guard
    // left wired for a previous user leaks into the next test.
    mocks.requireAuth.mockReset();
    mocks.requirePageAccess.mockReset();
    mocks.requireAnyPage.mockReset();
    mocks.db.engineer.findUnique.mockResolvedValue({ id: "e1", name: "x" });
    mocks.db.company.findUnique.mockResolvedValue({ id: "c1", name: "x" });
  });

  // The guard stubs above are module-level singletons shared by every case in
  // this file, and each route is imported lazily. The cases therefore cannot
  // overlap: one test's wireGuardsFor() would otherwise replace the stubs while
  // another test's route was still awaiting them, and the route would answer
  // with the wrong user's permissions.
  describe.sequential.each(ROUTES)("%s", (_name, call, pages) => {
    /** Does the employee role legitimately hold any of this route's pages? */
    const employeeAllowed = pages.some((p) => hasPageAccess("EMPLOYEE", p as never));

    it("401s an anonymous caller", async () => {
      wireGuardsFor(null);
      // the routes do real work only after the guard, so a 401 is enough proof
      const res = await call();
      expect([401, 404]).toContain(res.status);
    });

    it("403s a signed-in employee who lacks the page", async () => {
      // dashboard is the one page every role holds, so an employee is meant to
      // read it — everywhere else the employee must be turned away.
      if (employeeAllowed) {
        wireGuardsFor(EMPLOYEE);
        const res = await call();
        expect([401, 403]).not.toContain(res.status);
        return;
      }
      wireGuardsFor(EMPLOYEE);
      const res = await call();
      expect([403, 404]).toContain(res.status);
    });

    it("lets the general manager through", async () => {
      wireGuardsFor(GM);
      const res = await call();
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it("declares only pages that exist in the permission table", () => {
      for (const page of pages) {
        const known = Object.values(ROLE_PERMISSIONS).flat().includes(page as never);
        expect(known, `${page} is not a known page`).toBe(true);
      }
    });
  });

  it("keeps the money reads closed to an ordinary employee", async () => {
    // The concrete breach from the audit: an EMPLOYEE reading everyone's
    // salaries, settlements and profits.
    wireGuardsFor(EMPLOYEE);

    for (const [name, call] of ROUTES.filter(([n]) =>
      ["reports", "settlements", "invoices", "companies/[id]/report", "investors"].includes(n),
    )) {
      mocks.requirePageAccess.mockClear();
      mocks.requireAnyPage.mockClear();
      const res = await call();
      expect(res.status, `${name} leaked to EMPLOYEE`).toBe(403);
    }
  });

  it("keeps a company manager working on the pages it was just granted", () => {
    // 1.7 granted these so a company manager is not locked out of data the
    // API used to hand them.
    const cm = ROLE_PERMISSIONS.COMPANY_MANAGER;

    expect(hasPageAccess("COMPANY_MANAGER", "companies")).toBe(true);
    expect(hasPageAccess("COMPANY_MANAGER", "investors")).toBe(true);
    expect(cm).toContain("companies");
    expect(cm).toContain("investors");
  });

  it("still does not give an employee any money page", () => {
    for (const page of ["reports", "settlements", "finance", "companies", "investors", "hrPayroll"]) {
      expect(hasPageAccess("EMPLOYEE", page as never), `EMPLOYEE got ${page}`).toBe(false);
    }
  });
});
