import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The permissions matrix endpoints, as the general manager sees them.
 *
 * The point of these is the rules that protect the system from a mistake made
 * in the UI: the general manager's own role cannot be reduced, a non-admin
 * cannot reach any of it, and an unknown page or action in the payload is
 * rejected rather than invented.
 */

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  requireAuth: vi.fn(),
  invalidatePermissionCache: vi.fn(),
  db: {
    role: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    page: { findMany: vi.fn(), findFirst: vi.fn() },
    rolePage: { findMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
    roleActionPermission: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
    user: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth-helpers", () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
  requireAuth: mocks.requireAuth,
}));

import { GET, POST } from "@/app/api/roles/route";
import { PATCH, DELETE } from "@/app/api/roles/[id]/route";
import { GET as GET_MATRIX, PUT as PUT_MATRIX } from "@/app/api/roles/[id]/permissions/route";

const GM = { id: "u1", role: "GENERAL_MANAGER" };
const CLERK = { id: "u2", role: "ACCOUNTANT" };

const PAGES = [
  {
    id: "p1",
    key: "customers",
    name: "العملاء",
    icon: "Users",
    group: "navigation.group.salesCustomers",
    sortOrder: 10,
    canView: true,
    actions: [
      { id: "a1", key: "view", name: null, isAllowed: true },
      { id: "a2", key: "delete", name: null, isAllowed: false },
    ],
  },
  {
    id: "p2",
    key: "finance",
    name: "المالية",
    icon: "Wallet",
    group: "navigation.group.finance",
    sortOrder: 20,
    canView: false,
    actions: [{ id: "a3", key: "view", name: null, isAllowed: false }],
  },
];

const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** The PUT handler wraps its writes in a transaction; run the callback for real. */
function passThroughTransaction() {
  mocks.db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(mocks.db)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSuperAdmin.mockResolvedValue(GM);
  mocks.requireAuth.mockResolvedValue(GM);
  passThroughTransaction();
  mocks.db.rolePage.createMany.mockResolvedValue({ count: 0 });
  mocks.db.rolePage.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.roleActionPermission.createMany.mockResolvedValue({ count: 0 });
  mocks.db.roleActionPermission.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.roleActionPermission.findMany.mockResolvedValue([
    { id: "rp1", roleId: "r1", actionId: "a1", isAllowed: true },
    { id: "rp2", roleId: "r1", actionId: "a2", isAllowed: false },
    { id: "rp3", roleId: "r1", actionId: "a3", isAllowed: false },
  ]);
  mocks.db.page.findMany.mockResolvedValue(PAGES);
  mocks.db.rolePage.findMany.mockResolvedValue([
    { id: "rp1", roleId: "r1", pageId: "p1", canView: true },
    { id: "rp2", roleId: "r1", pageId: "p2", canView: false },
  ]);
  mocks.db.role.update.mockResolvedValue({ id: "r1", name: "x", description: null });
});

describe("GET /api/roles", () => {
  it("lists roles with their user and permission counts", async () => {
    mocks.db.role.findMany.mockResolvedValue([
      {
        id: "r1",
        key: "ACCOUNTANT",
        name: "المحاسب",
        description: null,
        isSystem: false,
        sortOrder: 20,
        _count: { users: 3 },
        pages: [{ pageId: "p1" }],
        actionPermissions: [{ actionId: "a1" }],
      },
    ]);

    const res = await GET();
    const body = (await res.json()) as { userCount: number; pageCount: number; actionCount: number }[];

    expect(res.status).toBe(200);
    expect(body[0]).toMatchObject({ userCount: 3, pageCount: 1, actionCount: 1 });
  });

  it("403s a non-admin", async () => {
    mocks.requireSuperAdmin.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(CLERK);

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("401s an anonymous caller", async () => {
    mocks.requireSuperAdmin.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/roles", () => {
  it("creates a role with a valid key", async () => {
    mocks.db.role.create.mockResolvedValue({ id: "r9", key: "sales_lead", name: "مشرف" });

    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ name: "مشرف مبيعات", key: "sales_lead" }),
      })
    );

    expect(res.status).toBe(201);
    expect(mocks.db.role.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: "sales_lead" }) })
    );
  });

  it("rejects a key that is not a safe slug", async () => {
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ name: "x", key: "../../etc/passwd" }),
      })
    );

    expect(res.status).toBe(400);
    expect(mocks.db.role.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate key", async () => {
    mocks.db.role.findUnique.mockResolvedValue({ id: "r1", key: "ACCOUNTANT" });

    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ name: "x", key: "ACCOUNTANT" }),
      })
    );

    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/roles/[id]", () => {
  it("renames a normal role", async () => {
    mocks.db.role.findUnique.mockResolvedValue({ id: "r1", key: "SALES_LEAD", name: "old", isSystem: false, description: null });

    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ name: "new" }) }),
      params("r1")
    );

    expect(res.status).toBe(200);
    expect(mocks.db.role.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "new" }) })
    );
  });

  it("refuses to rename the protected system role", async () => {
    mocks.db.role.findUnique.mockResolvedValue({
      id: "rgm",
      key: "GENERAL_MANAGER",
      name: "المدير العام",
      isSystem: true,
      description: null,
    });

    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ name: "hacked" }) }),
      params("rgm")
    );

    expect(res.status).toBe(403);
    expect(mocks.db.role.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/roles/[id]", () => {
  it("refuses to delete the protected system role", async () => {
    mocks.db.role.findUnique.mockResolvedValue({
      id: "rgm",
      key: "GENERAL_MANAGER",
      isSystem: true,
      _count: { users: 1 },
    });

    const res = await DELETE(new Request("http://x"), params("rgm"));

    expect(res.status).toBe(403);
    expect(mocks.db.role.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete a role that still has users", async () => {
    mocks.db.role.findUnique.mockResolvedValue({
      id: "r1",
      key: "SALES_LEAD",
      isSystem: false,
      _count: { users: 2 },
    });

    const res = await DELETE(new Request("http://x"), params("r1"));

    expect(res.status).toBe(409);
    expect(mocks.db.role.delete).not.toHaveBeenCalled();
  });

  it("deletes an unused custom role", async () => {
    mocks.db.role.findUnique.mockResolvedValue({
      id: "r1",
      key: "SALES_LEAD",
      isSystem: false,
      _count: { users: 0 },
    });
    mocks.db.role.delete.mockResolvedValue({});

    const res = await DELETE(new Request("http://x"), params("r1"));

    expect(res.status).toBe(200);
    expect(mocks.db.role.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
  });
});

describe("GET /api/roles/[id]/permissions", () => {
  it("returns the catalogue with this role's current grants", async () => {
    mocks.db.role.findUnique.mockResolvedValue({
      id: "r1",
      key: "ACCOUNTANT",
      name: "المحاسب",
      description: null,
      isSystem: false,
      _count: { users: 3 },
      pages: [
        { pageId: "p1", canView: true },
        { pageId: "p2", canView: false },
      ],
      actionPermissions: [
        { actionId: "a1", isAllowed: true },
        { actionId: "a2", isAllowed: false },
      ],
    });

    const res = await GET_MATRIX(new Request("http://x"), params("r1"));
    const body = (await res.json()) as { pages: { key: string; canView: boolean; actions: { key: string; isAllowed: boolean }[] }[] };

    expect(res.status).toBe(200);
    expect(body.pages.find((p) => p.key === "customers")?.canView).toBe(true);
    expect(body.pages.find((p) => p.key === "customers")?.actions[0].isAllowed).toBe(true);
    expect(body.pages.find((p) => p.key === "customers")?.actions[1].isAllowed).toBe(false);
  });
});

describe("PUT /api/roles/[id]/permissions", () => {
  const body = (pages: Record<string, boolean>, actions: Record<string, boolean>) =>
    new Request("http://x", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages, actions }),
    });

  it("refuses to reduce the general manager's own permissions", async () => {
    mocks.db.role.findUnique.mockResolvedValue({ id: "rgm", key: "GENERAL_MANAGER", isSystem: true });

    const res = await PUT_MATRIX(body({ customers: false }, {}), params("rgm"));

    expect(res.status).toBe(403);
    expect(mocks.db.rolePage.updateMany).not.toHaveBeenCalled();
  });

  it("403s a non-admin", async () => {
    mocks.requireSuperAdmin.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(CLERK);

    const res = await PUT_MATRIX(body({}, {}), params("r1"));

    expect(res.status).toBe(403);
  });

  it("rejects a page the catalogue does not contain", async () => {
    mocks.db.role.findUnique.mockResolvedValue({ id: "r1", key: "SALES_LEAD", isSystem: false });

    const res = await PUT_MATRIX(body({ not_a_page: true }, {}), params("r1"));

    expect(res.status).toBe(400);
    expect(mocks.db.rolePage.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an action the catalogue does not contain", async () => {
    mocks.db.role.findUnique.mockResolvedValue({ id: "r1", key: "SALES_LEAD", isSystem: false });

    const res = await PUT_MATRIX(body({ customers: true }, { "customers:launch_missiles": true }), params("r1"));

    expect(res.status).toBe(400);
    expect(mocks.db.roleActionPermission.updateMany).not.toHaveBeenCalled();
  });

  it("clears the actions of a page that is switched off", async () => {
    mocks.db.role.findUnique.mockResolvedValue({ id: "r1", key: "SALES_LEAD", isSystem: false });

    const res = await PUT_MATRIX(
      // Asks for view on a page it is turning off: the stored data must not
      // keep it, or re-enabling the page would silently restore access.
      body({ customers: false, finance: false }, { "customers:view": true, "customers:delete": true }),
      params("r1")
    );

    expect(res.status).toBe(200);
    const disabledCall = mocks.db.roleActionPermission.updateMany.mock.calls.find((call) =>
      (call[0].where.actionId?.in ?? []).includes("a1")
    );
    expect(disabledCall?.[0].data).toEqual({ isAllowed: false });
  });

  it("reports what actually changed", async () => {
    mocks.db.role.findUnique.mockResolvedValue({ id: "r1", key: "SALES_LEAD", isSystem: false });

    const res = await PUT_MATRIX(body({ customers: true, finance: false }, {}), params("r1"));
    const result = (await res.json()) as {
      ok: boolean;
      pagesEnabled: number;
      actionsEnabled: number;
    };

    expect(result.ok).toBe(true);
    // customers was already viewable, so nothing new is enabled.
    expect(result.pagesEnabled).toBe(0);
  });
});
