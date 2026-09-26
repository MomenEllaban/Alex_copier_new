import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildTemplateCsv } from "@/lib/csv";

const mocks = vi.hoisted(() => ({
  prisma: {
    customer: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
// The route now guards on the "import" action rather than page access alone.
// These tests decide who is allowed by role, so the action guard answers from
// the same permission table the old inline check used.
vi.mock("@/lib/auth-helpers", async () => {
  const { hasPageAccess } = await import("@/lib/permissions");
  return {
    requireAuth: mocks.requireAuth,
    requireAction: async (page: string) => {
      const user = await mocks.requireAuth();
      if (!user) return null;
      return hasPageAccess((user as { role?: string }).role, page as never) ? user : null;
    },
  };
});

import { POST } from "@/app/api/customers/import/route";

function makeRequest(payload: object) {
  return new Request("http://localhost/api/customers/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const manager = { role: "GENERAL_MANAGER" };
const workshopManager = { role: "WORKSHOP_MANAGER" };

describe("POST /api/customers/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.customer.findMany.mockResolvedValue([
      { name: "عميل موجود", phone: "01000000000" },
    ]);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.requireAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ csv: "name\nx" }));
    expect(res.status).toBe(401);
    expect(mocks.prisma.customer.createMany).not.toHaveBeenCalled();
  });

  it("returns 403 for roles without customers page access", async () => {
    mocks.requireAuth.mockResolvedValue(workshopManager);
    const res = await POST(makeRequest({ csv: "name\nx" }));
    expect(res.status).toBe(403);
    expect(mocks.prisma.customer.createMany).not.toHaveBeenCalled();
  });

  it("returns 400 when csv body is missing", async () => {
    mocks.requireAuth.mockResolvedValue(manager);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("imports valid Arabic rows and returns created count", async () => {
    mocks.requireAuth.mockResolvedValue(manager);
    mocks.prisma.customer.createMany.mockResolvedValue({ count: 2 });

    const csv = buildTemplateCsv(
      ["name", "phone"],
      [
        ["محمد أحمد", "01001234567"],
        ["شركة النيل، فرع سموحة", "01112223334"],
      ]
    );
    const res = await POST(makeRequest({ csv }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.created).toBe(2);
    expect(data.errors).toEqual([]);
    expect(mocks.prisma.customer.createMany).toHaveBeenCalledTimes(1);

    const arg = mocks.prisma.customer.createMany.mock.calls[0][0];
    expect(arg.data[0].name).toBe("محمد أحمد");
    expect(arg.data[0]).toMatchObject({ customerType: "INDIVIDUAL", creditLimit: 0 });
  });

  it("is atomic: a single bad row blocks the whole file with row-level errors", async () => {
    mocks.requireAuth.mockResolvedValue(manager);

    const csv = buildTemplateCsv(
      ["name", "email"],
      [
        ["عميل صالح", ""],
        ["عميل خاطئ", "بريد-غير-صالح"],
      ]
    );
    const res = await POST(makeRequest({ csv }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.created).toBe(0);
    expect(data.errors.length).toBeGreaterThan(0);
    expect(data.errors[0]).toMatchObject({ field: "email" });
    expect(mocks.prisma.customer.createMany).not.toHaveBeenCalled();
  });

  it("detects duplicates against existing database rows", async () => {
    mocks.requireAuth.mockResolvedValue(manager);

    const csv = buildTemplateCsv(["name", "phone"], [["عميل موجود", "01000000000"]]);
    const res = await POST(makeRequest({ csv }));
    const data = await res.json();

    expect(data.created).toBe(0);
    expect(data.errors[0].message).toContain("موجود بالفعل");
    expect(mocks.prisma.customer.createMany).not.toHaveBeenCalled();
  });

  it("reports unknown headers without inserting anything silently", async () => {
    mocks.requireAuth.mockResolvedValue(manager);

    const csv = buildTemplateCsv(["name", "mystery_col"], [["أحمد", "قيمة"]]);
    const res = await POST(makeRequest({ csv }));
    const data = await res.json();

    expect(data.errors.some((e: { field: string }) => e.field === "mystery_col")).toBe(true);
    expect(mocks.prisma.customer.createMany).not.toHaveBeenCalled();
  });
});
