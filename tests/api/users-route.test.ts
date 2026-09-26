import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    company: {
      findUnique: vi.fn(),
    },
    engineer: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    session: { deleteMany: vi.fn() },
    notification: { deleteMany: vi.fn() },
    serviceRequest: { updateMany: vi.fn(), count: vi.fn() },
    visit: { count: vi.fn() },
    settlement: { count: vi.fn(), updateMany: vi.fn() },
    sparePartCustody: { count: vi.fn() },
    engineerSalary: { count: vi.fn() },
    warranty: { count: vi.fn(), updateMany: vi.fn() },
  } as Record<string, any>;
  prisma.$transaction = vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  return {
    prisma,
    requireAuth: vi.fn(),
    requireRole: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: vi.fn(),
  // Action guards delegate to the page guard: these tests decide who is
  // allowed, not which action, and the page answer is what they mean.
  requireAction: vi.fn(),
  requireAnyAction: vi.fn(),
  requireRole: mocks.requireRole,
}));
vi.mock("bcryptjs", () => ({
  hash: vi.fn(async (password: string) => `hashed:${password}`),
  compare: vi.fn(),
}));

import { GET, POST } from "@/app/api/users/route";
import { PUT, DELETE } from "@/app/api/users/[id]/route";

const admin = { id: "admin_1", role: "GENERAL_MANAGER" };
const accountant = { id: "acc_1", role: "ACCOUNTANT" };

function postRequest(body: object) {
  return new Request("http://localhost/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function putRequest(id: string, body: object) {
  return new Request(`http://localhost/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  name: "محمد أحمد",
  email: "mohamed@alex-copier.com",
  password: "secret123",
  role: "SALES_EMPLOYEE",
};

describe("GET /api/users (admin only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.requireRole.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for authenticated non-admin roles", async () => {
    mocks.requireRole.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(accountant);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns users without password hashes for the admin", async () => {
    mocks.requireRole.mockResolvedValue(admin);
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: "u1", name: "أحمد", email: "a@x.com", role: "ENGINEER", companyId: null, isActive: true, createdAt: "2025-01-01" },
    ]);
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data[0].name).toBe("أحمد");
    expect(data[0].passwordHash).toBeUndefined();
  });
});

describe("POST /api/users (create account)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue(admin);
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.company.findUnique.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated and 403 for non-admin", async () => {
    mocks.requireRole.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(null);
    expect((await POST(postRequest(validPayload))).status).toBe(401);

    mocks.requireAuth.mockResolvedValue(accountant);
    expect((await POST(postRequest(validPayload))).status).toBe(403);
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("creates a user with a bcrypt-hashed password and sanitized response", async () => {
    mocks.prisma.user.create.mockResolvedValue({
      id: "new_1",
      name: validPayload.name,
      email: validPayload.email,
      role: "SALES_EMPLOYEE",
      companyId: null,
      isActive: true,
      createdAt: "2025-08-01",
    });

    const res = await POST(postRequest(validPayload));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.email).toBe(validPayload.email);
    expect(data.passwordHash).toBeUndefined();

    const createArg = mocks.prisma.user.create.mock.calls[0][0];
    expect(createArg.data.passwordHash).toBe("hashed:secret123");
    expect(createArg.data.role).toBe("SALES_EMPLOYEE");
    expect(JSON.stringify(data)).not.toContain("passwordHash");
  });

  it("normalizes email to lowercase", async () => {
    mocks.prisma.user.create.mockResolvedValue({ id: "n2" });
    await POST(postRequest({ ...validPayload, email: "  MOHAMED@Alex-Copier.COM " }));
    expect(mocks.prisma.user.create.mock.calls[0][0].data.email).toBe("mohamed@alex-copier.com");
  });

  it("rejects missing required fields with Arabic message", async () => {
    for (const key of ["name", "email", "password"]) {
      const body: Record<string, unknown> = { ...validPayload };
      delete body[key];
      const res = await POST(postRequest(body));
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain("مطلوبة");
    }
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects invalid email format", async () => {
    const res = await POST(postRequest({ ...validPayload, email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("البريد الإلكتروني");
  });

  it("rejects passwords shorter than 6 characters", async () => {
    const res = await POST(postRequest({ ...validPayload, password: "abc" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("6 أحرف");
  });

  it("rejects invalid roles", async () => {
    const res = await POST(postRequest({ ...validPayload, role: "SUPER_HACKER" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("الدور غير صالح");
  });

  it("accepts every role defined in permissions", async () => {
    mocks.prisma.user.create.mockResolvedValue({ id: "x" });
    for (const role of [
      "GENERAL_MANAGER",
      "COMPANY_MANAGER",
      "ACCOUNTANT",
      "MAINTENANCE_MANAGER",
      "WORKSHOP_MANAGER",
      "ENGINEER",
      "SALES_EMPLOYEE",
    ]) {
      mocks.prisma.user.create.mockClear();
      const res = await POST(postRequest({ ...validPayload, email: `r-${role}@x.com`, role }));
      expect(res.status).toBe(201);
      expect(mocks.prisma.user.create.mock.calls[0][0].data.role).toBe(role);
    }
  });

  it("returns 409 when the email already exists", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "existing" });
    const res = await POST(postRequest(validPayload));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("مستخدم بالفعل");
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown companyId", async () => {
    const res = await POST(postRequest({ ...validPayload, companyId: "ghost_company" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("الشركة غير موجودة");
  });

  it("links the company when companyId exists", async () => {
    mocks.prisma.company.findUnique.mockResolvedValue({ id: "cmp_1" });
    mocks.prisma.user.create.mockResolvedValue({ id: "n3" });
    const res = await POST(postRequest({ ...validPayload, companyId: "cmp_1" }));
    expect(res.status).toBe(201);
    expect(mocks.prisma.user.create.mock.calls[0][0].data.companyId).toBe("cmp_1");
  });
});

describe("PUT /api/users/[id] (update account)", () => {
  const targetId = "user_9";

  function callPut(id: string, body: object) {
    return PUT(putRequest(id, body), { params: Promise.resolve({ id }) });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue(admin);
    mocks.prisma.company.findUnique.mockResolvedValue(null);
  });

  it("returns 403 for non-admins", async () => {
    mocks.requireRole.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(accountant);
    const res = await callPut(targetId, { name: "x" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when target does not exist", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const res = await callPut(targetId, { name: "جديد" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("غير موجود");
  });

  it("blocks changing your own role or status", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: admin.id,
      name: "Admin", email: "a@x.com", passwordHash: "h", role: "GENERAL_MANAGER", companyId: null, isActive: true,
    });
    const byRole = await callPut(admin.id, { role: "ACCOUNTANT" });
    expect(byRole.status).toBe(400);
    expect((await byRole.json()).error).toContain("حسابك الشخصي");

    const byStatus = await callPut(admin.id, { isActive: false });
    expect(byStatus.status).toBe(400);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("updates role without touching the password", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: targetId, name: "علي", email: "ali@x.com", passwordHash: "h", role: "ENGINEER", companyId: null, isActive: true,
    });
    mocks.prisma.user.update.mockResolvedValue({ id: targetId, role: "WORKSHOP_MANAGER" });

    const res = await callPut(targetId, { role: "WORKSHOP_MANAGER" });
    expect(res.status).toBe(200);

    const arg = mocks.prisma.user.update.mock.calls[0][0];
    expect(arg.data.role).toBe("WORKSHOP_MANAGER");
    expect(arg.data.passwordHash).toBeUndefined();
  });

  it("hashes and updates a new password; ignores empty password field", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: targetId, name: "علي", email: "ali@x.com", passwordHash: "old", role: "ENGINEER", companyId: null, isActive: true,
    });
    mocks.prisma.user.update.mockResolvedValue({ id: targetId });

    await callPut(targetId, { password: "brandNew77" });
    expect(mocks.prisma.user.update.mock.calls[0][0].data.passwordHash).toBe("hashed:brandNew77");

    mocks.prisma.user.update.mockClear();
    const emptyOnly = await callPut(targetId, { password: "" });
    expect(emptyOnly.status).toBe(400);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects short replacement passwords", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: targetId, name: "علي", email: "ali@x.com", passwordHash: "old", role: "ENGINEER", companyId: null, isActive: true,
    });
    const res = await callPut(targetId, { password: "123" });
    expect(res.status).toBe(400);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("prevents assigning an email that belongs to another user", async () => {
    mocks.prisma.user.findUnique
      .mockResolvedValueOnce({ id: targetId, name: "علي", email: "ali@x.com", passwordHash: "h", role: "ENGINEER", companyId: null, isActive: true })
      .mockResolvedValueOnce({ id: "someone_else", email: "taken@x.com" });
    const res = await callPut(targetId, { email: "taken@x.com" });
    expect(res.status).toBe(409);
  });

  it("allows editing your own name/password but never role/status", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: admin.id, name: "Admin", email: "gm@x.com", passwordHash: "h", role: "GENERAL_MANAGER", companyId: null, isActive: true,
    });
    mocks.prisma.user.update.mockResolvedValue({ id: admin.id });

    const ok = await callPut(admin.id, { name: "اسم جديد", password: "newPass99" });
    expect(ok.status).toBe(200);

    const blocked = await callPut(admin.id, { role: "ENGINEER", isActive: false });
    expect(blocked.status).toBe(400);
  });

  it("toggles isActive as a boolean only", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: targetId, name: "علي", email: "ali@x.com", passwordHash: "h", role: "ENGINEER", companyId: null, isActive: true,
    });
    mocks.prisma.user.update.mockResolvedValue({ id: targetId, isActive: false });

    const ok = await callPut(targetId, { isActive: false });
    expect(ok.status).toBe(200);
    expect(mocks.prisma.user.update.mock.calls[0][0].data.isActive).toBe(false);

    const bad = await callPut(targetId, { isActive: "yes" });
    expect(bad.status).toBe(400);
  });

  it("blocks editing another GENERAL_MANAGER account", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "other_gm", name: "أحمد", email: "gm2@x.com", passwordHash: "h", role: "GENERAL_MANAGER", companyId: null, isActive: true,
    });
    const byRole = await callPut("other_gm", { name: "تعديل" });
    expect(byRole.status).toBe(403);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/users/[id] (delete account)", () => {
  function callDelete(id: string) {
    return DELETE(new Request(`http://localhost/api/users/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue(admin);
  });

  it("blocks deleting yourself", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: admin.id, name: "Admin", email: "a@x.com", passwordHash: "h", role: "GENERAL_MANAGER", companyId: null, isActive: true,
    });
    const res = await callDelete(admin.id);
    expect(res.status).toBe(400);
  });

  it("blocks deleting another GENERAL_MANAGER", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "other_gm", name: "أحمد", email: "gm2@x.com", passwordHash: "h", role: "GENERAL_MANAGER", companyId: null, isActive: true,
    });
    const res = await callDelete("other_gm");
    expect(res.status).toBe(403);
    expect(mocks.prisma.user.delete).not.toHaveBeenCalled();
  });
});
