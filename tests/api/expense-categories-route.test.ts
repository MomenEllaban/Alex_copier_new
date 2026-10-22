import { describe, it, expect, vi, beforeEach } from "vitest";

// The expense form creates its category inline (the "+" button next to the
// category select), so the categories endpoint is part of the expense flow.

const mocks = vi.hoisted(() => ({
  prisma: {
    expenseCategory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    company: {
      findUnique: vi.fn(),
    },
  },
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  requireAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyAction: (page: string) => mocks.requirePageAccess(page),
}));

import { GET, POST } from "@/app/api/expense-categories/route";

const gm = { id: "gm_1", role: "GENERAL_MANAGER" };
const salesUser = { id: "sales_1", role: "SALES_EMPLOYEE" };

function postRequest(body: object) {
  return new Request("http://localhost/api/expense-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/expense-categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
  });

  it("returns 401 when unauthenticated and 403 without finance access", async () => {
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);

    mocks.requireAuth.mockResolvedValue(salesUser);
    expect((await GET()).status).toBe(403);
    expect(mocks.prisma.expenseCategory.findMany).not.toHaveBeenCalled();
  });

  it("returns the categories with their company", async () => {
    mocks.prisma.expenseCategory.findMany.mockResolvedValue([
      { id: "cat_1", name: "ايجار", companyId: "cmp_1", company: { id: "cmp_1", name: "الأولى" } },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json())[0].company.name).toBe("الأولى");
  });
});

describe("POST /api/expense-categories (inline quick add)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
    mocks.prisma.company.findUnique.mockResolvedValue({ id: "cmp_1" });
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue(null);
    mocks.prisma.expenseCategory.create.mockResolvedValue({
      id: "cat_new",
      name: "صيانة",
      companyId: "cmp_1",
      company: { id: "cmp_1", name: "الأولى" },
    });
  });

  it("returns 401 when unauthenticated and 403 without finance access", async () => {
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(null);
    expect((await POST(postRequest({ name: "صيانة", companyId: "cmp_1" }))).status).toBe(401);

    mocks.requireAuth.mockResolvedValue(salesUser);
    expect((await POST(postRequest({ name: "صيانة", companyId: "cmp_1" }))).status).toBe(403);
    expect(mocks.prisma.expenseCategory.create).not.toHaveBeenCalled();
  });

  it("requires a name and a company", async () => {
    for (const body of [{ companyId: "cmp_1" }, { name: "صيانة" }, { name: "   ", companyId: "cmp_1" }]) {
      const res = await POST(postRequest(body));
      expect(res.status).toBe(400);
    }
    expect(mocks.prisma.expenseCategory.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown company", async () => {
    mocks.prisma.company.findUnique.mockResolvedValue(null);
    const res = await POST(postRequest({ name: "صيانة", companyId: "cmp_missing" }));
    expect(res.status).toBe(400);
    expect(mocks.prisma.expenseCategory.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate name in the same company", async () => {
    mocks.prisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat_1", name: "صيانة", companyId: "cmp_1" });
    const res = await POST(postRequest({ name: "صيانة", companyId: "cmp_1" }));
    expect(res.status).toBe(409);
    expect(mocks.prisma.expenseCategory.create).not.toHaveBeenCalled();
  });

  it("creates the category for the given company and returns it", async () => {
    const res = await POST(postRequest({ name: "  صيانة  ", companyId: "cmp_1" }));
    expect(res.status).toBe(201);
    expect(mocks.prisma.expenseCategory.create.mock.calls[0][0].data).toEqual({ name: "صيانة", companyId: "cmp_1" });
    const json = await res.json();
    expect(json.id).toBe("cat_new");
    expect(json.companyId).toBe("cmp_1");
  });
});
