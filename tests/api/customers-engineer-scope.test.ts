import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    customer: { findMany: vi.fn() },
    engineer: { findUnique: vi.fn() },
  },
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({ requireAuth: mocks.requireAuth }));

import { GET as listCustomers } from "@/app/api/customers/route";

describe("customers scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.customer.findMany.mockResolvedValue([]);
  });

  it("returns all customers for managers", async () => {
    mocks.requireAuth.mockResolvedValue({ id: "gm_1", role: "GENERAL_MANAGER" });
    const res = await listCustomers();
    expect(res.status).toBe(200);
    expect(mocks.prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
    expect(mocks.prisma.engineer.findUnique).not.toHaveBeenCalled();
  });

  it("filters customers to the engineer's own assignments", async () => {
    mocks.requireAuth.mockResolvedValue({ id: "u_eng", role: "ENGINEER" });
    mocks.prisma.engineer.findUnique.mockResolvedValue({ id: "my_eng" });
    const res = await listCustomers();
    expect(res.status).toBe(200);
    expect(mocks.prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { engineerId: "my_eng" } }),
    );
  });

  it("returns nothing when the engineer account is not linked", async () => {
    mocks.requireAuth.mockResolvedValue({ id: "u_orphan", role: "ENGINEER" });
    mocks.prisma.engineer.findUnique.mockResolvedValue(null);
    const res = await listCustomers();
    expect(res.status).toBe(200);
    expect(mocks.prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { engineerId: "__none__" } }),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.requireAuth.mockResolvedValue(null);
    const res = await listCustomers();
    expect(res.status).toBe(401);
  });
});
