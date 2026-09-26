import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    engineer: { findMany: vi.fn() },
    machine: { update: vi.fn() },
  },
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  // Action guards delegate to the page guard: these tests decide who is
  // allowed, not which action, and the page answer is what they mean.
  requireAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyAction: (page: string) => mocks.requirePageAccess(page),
}));

import { GET as listEngineers } from "@/app/api/engineers/route";
import { PUT as updateMachine } from "@/app/api/machines/[id]/route";

const manager = { id: "gm_1", role: "GENERAL_MANAGER" };

describe("engineers assigned customers count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(manager);
    mocks.requirePageAccess.mockResolvedValue(manager);
  });

  it("maps the customers count without leaking relations", async () => {
    mocks.prisma.engineer.findMany.mockResolvedValue([
      { id: "e1", name: "شعبان", serviceRequests: [], _count: { customers: 566 } },
    ]);
    const res = await listEngineers();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].assignedCustomersCount).toBe(566);
    expect(body[0].serviceRequests).toBeUndefined();
    expect(body[0]._count).toBeUndefined();
  });
});

describe("machines delivery counters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(manager);
    mocks.requirePageAccess.mockResolvedValue(manager);
  });

  it("PUT coerces delivery counters to numbers", async () => {
    mocks.prisma.machine.update.mockResolvedValue({ id: "m1" });
    const req = new Request("http://localhost/api/machines/m1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryBlack: "217377", deliveryColor: "", isPrinter: true }),
    });
    const res = await updateMachine(req, { params: Promise.resolve({ id: "m1" }) });
    expect(res.status).toBe(200);
    const arg = mocks.prisma.machine.update.mock.calls[0][0];
    expect(arg.data.deliveryBlack).toBe(217377);
    expect(arg.data.deliveryColor).toBeNull();
    expect(arg.data.isPrinter).toBe(true);
  });
});
