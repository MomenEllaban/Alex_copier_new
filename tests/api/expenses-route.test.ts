import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    expense: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    company: {
      findUnique: vi.fn(),
    },
  },
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/prisma-errors", () => ({
  traceError: (_prefix: string, error: { code?: string }) =>
    error?.code === "P2025" ? 404 : error?.code === "P2002" ? 409 : error?.code === "P2003" ? 400 : 500,
}));

import { GET, POST } from "@/app/api/expenses/route";
import { PUT, DELETE } from "@/app/api/expenses/[id]/route";

const gm = { id: "gm_1", role: "GENERAL_MANAGER" };
const salesUser = { id: "sales_1", role: "SALES_EMPLOYEE" };

function postRequest(body: object) {
  return new Request("http://localhost/api/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pathRequest(id: string, method: string, body: object | null) {
  return new Request(`http://localhost/api/expenses/${id}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === null ? undefined : JSON.stringify(body),
  });
}

function callPut(id: string, body: object) {
  return PUT(pathRequest(id, "PUT", body), { params: Promise.resolve({ id }) });
}

function callDelete(id: string) {
  return DELETE(pathRequest(id, "DELETE", null), { params: Promise.resolve({ id }) });
}

const validPayload = {
  companyId: "cmp_1",
  category: "ايجار",
  description: "ايجار شهر اغسطس",
  amount: 2500,
};

const createdExpense = {
  id: "exp_1",
  companyId: "cmp_1",
  category: "ايجار",
  description: "ايجار شهر اغسطس",
  amount: 2500,
  paidBy: gm.id,
  date: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  company: { id: "cmp_1", name: "الأولى" },
  payer: { id: gm.id, name: "مدير" },
};

describe("GET /api/expenses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 1.7: the list is now gated on the "finance" page, not just a session.
    mocks.requirePageAccess.mockResolvedValue(gm);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns expenses with payer and company for authenticated users", async () => {
    mocks.requireAuth.mockResolvedValue(gm);
    mocks.prisma.expense.findMany.mockResolvedValue([createdExpense]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json())[0].payer.name).toBe("مدير");
    expect(mocks.prisma.expense.findMany.mock.calls[0][0].orderBy).toBeDefined();
  });

  it("returns 403 for a signed-in user without the finance page", async () => {
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(salesUser);
    const res = await GET();

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mocks.prisma.expense.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/expenses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
    mocks.prisma.company.findUnique.mockResolvedValue({ id: "cmp_1" });
    mocks.prisma.expense.create.mockResolvedValue(createdExpense);
  });

  it("returns 401 when unauthenticated and 403 without finance access", async () => {
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(null);
    expect((await POST(postRequest(validPayload))).status).toBe(401);

    mocks.requireAuth.mockResolvedValue(salesUser);
    expect((await POST(postRequest(validPayload))).status).toBe(403);
    expect(mocks.prisma.expense.create).not.toHaveBeenCalled();
  });

  it("rejects invalid data", async () => {
    for (const body of [
      { ...validPayload, amount: 0 },
      { ...validPayload, amount: "x" },
      { ...validPayload, category: "" },
      { ...validPayload, description: "" },
    ]) {
      const res = await POST(postRequest(body));
      expect(res.status).toBe(400);
    }
    expect(mocks.prisma.expense.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown companyId", async () => {
    mocks.prisma.company.findUnique.mockResolvedValue(null);
    const res = await POST(postRequest(validPayload));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("COMPANY_NOT_FOUND");
  });

  it("creates an expense with the actor as payer", async () => {
    const res = await POST(postRequest(validPayload));
    expect(res.status).toBe(201);
    const arg = mocks.prisma.expense.create.mock.calls[0][0];
    expect(arg.data.paidBy).toBe(gm.id);
    expect(arg.data.amount).toBe(2500);
    expect((await res.json()).payer.name).toBe("مدير");
  });
});

describe("PUT /api/expenses/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
    mocks.prisma.expense.findUnique.mockResolvedValue({ id: "exp_1" });
    mocks.prisma.company.findUnique.mockResolvedValue({ id: "cmp_1" });
    mocks.prisma.expense.update.mockResolvedValue({ ...createdExpense, category: "كهرباء", amount: 999 });
  });

  it("returns 401 when unauthenticated and 403 without finance access", async () => {
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(null);
    expect((await callPut("exp_1", validPayload)).status).toBe(401);

    mocks.requireAuth.mockResolvedValue(salesUser);
    expect((await callPut("exp_1", validPayload)).status).toBe(403);
    expect(mocks.prisma.expense.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the expense does not exist", async () => {
    mocks.prisma.expense.findUnique.mockResolvedValue(null);
    const res = await callPut("exp_missing", validPayload);
    expect(res.status).toBe(404);
    expect(mocks.prisma.expense.update).not.toHaveBeenCalled();
  });

  it("rejects invalid data", async () => {
    const res = await callPut("exp_1", { ...validPayload, amount: -5 });
    expect(res.status).toBe(400);
    expect(mocks.prisma.expense.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown companyId during update", async () => {
    mocks.prisma.company.findUnique.mockResolvedValue(null);
    const res = await callPut("exp_1", validPayload);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("COMPANY_NOT_FOUND");
  });

  it("updates editable fields only, keeping the original payer", async () => {
    const res = await callPut("exp_1", validPayload);
    expect(res.status).toBe(200);
    const arg = mocks.prisma.expense.update.mock.calls[0][0];
    expect(arg.where.id).toBe("exp_1");
    expect(arg.data).toEqual({
      companyId: "cmp_1",
      categoryId: null,
      category: "ايجار",
      description: "ايجار شهر اغسطس",
      amount: 2500,
    });
    expect(arg.data.paidBy).toBeUndefined();
    expect((await res.json()).amount).toBe(999);
  });

  it("maps Prisma FK errors to 400", async () => {
    mocks.prisma.company.findUnique.mockResolvedValue({ id: "cmp_1" });
    mocks.prisma.expense.update.mockRejectedValue({ code: "P2003" });
    const res = await callPut("exp_1", validPayload);
    expect(res.status).toBe(400);
  });

  it("maps Prisma missing-record errors to 404", async () => {
    mocks.prisma.company.findUnique.mockResolvedValue({ id: "cmp_1" });
    mocks.prisma.expense.update.mockRejectedValue({ code: "P2025" });
    const res = await callPut("exp_1", validPayload);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/expenses/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
    mocks.prisma.expense.findUnique.mockResolvedValue({ id: "exp_1" });
  });

  it("returns 401 when unauthenticated and 403 without finance access", async () => {
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(null);
    expect((await callDelete("exp_1")).status).toBe(401);

    mocks.requireAuth.mockResolvedValue(salesUser);
    expect((await callDelete("exp_1")).status).toBe(403);
    expect(mocks.prisma.expense.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the expense does not exist", async () => {
    mocks.prisma.expense.findUnique.mockResolvedValue(null);
    expect((await callDelete("exp_missing")).status).toBe(404);
    expect(mocks.prisma.expense.delete).not.toHaveBeenCalled();
  });

  it("deletes an existing expense", async () => {
    mocks.prisma.expense.delete.mockResolvedValue(null);
    const res = await callDelete("exp_1");
    expect(res.status).toBe(200);
    expect(mocks.prisma.expense.delete.mock.calls[0][0].where.id).toBe("exp_1");
  });
});