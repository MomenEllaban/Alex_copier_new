import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  ownEngineerId: vi.fn(),
  db: {
    engineer: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/engineer-scope", () => ({
  ownEngineerId: mocks.ownEngineerId,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.db,
}));

import { GET } from "@/app/api/engineers/options/route";

describe("GET /api/engineers/options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when caller is not authenticated", async () => {
    mocks.requireAuth.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("allows accountant and returns active engineers", async () => {
    mocks.requireAuth.mockResolvedValue({ id: "acc-1", role: "ACCOUNTANT" });
    mocks.db.engineer.findMany.mockResolvedValue([
      { id: "e1", name: "مهندس أحمد" },
      { id: "e2", name: "مهندس محمد" },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe("مهندس أحمد");
    expect(mocks.db.engineer.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });

  it("scopes to engineer self if caller is ENGINEER role", async () => {
    mocks.requireAuth.mockResolvedValue({ id: "u-eng", role: "ENGINEER" });
    mocks.ownEngineerId.mockResolvedValue("e-self");
    mocks.db.engineer.findMany.mockResolvedValue([
      { id: "e-self", name: "مهندس نفسي" },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("e-self");
    expect(mocks.db.engineer.findMany).toHaveBeenCalledWith({
      where: { id: "e-self" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });

  it("returns empty array if engineer caller has no linked engineer record", async () => {
    mocks.requireAuth.mockResolvedValue({ id: "u-eng-unlinked", role: "ENGINEER" });
    mocks.ownEngineerId.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
    expect(mocks.db.engineer.findMany).not.toHaveBeenCalled();
  });
});
