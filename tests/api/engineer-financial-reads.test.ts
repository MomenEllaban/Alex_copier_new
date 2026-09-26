import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
  requireAnyPage: vi.fn(),
  db: { engineer: { findUnique: vi.fn() } },
  buildStatement: vi.fn(),
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
vi.mock("@/lib/engineer-statement", () => ({ buildEngineerStatement: mocks.buildStatement }));

import { GET as readStatement } from "@/app/api/engineers/[id]/statement/route";
import { GET as readSales } from "@/app/api/engineers/[id]/sales/route";

const req = () => new Request("http://localhost/api/engineers/e1/statement");
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("engineer financial reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "u1", role: "ADMIN" });
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAnyPage.mockResolvedValue({ id: "u1", role: "ENGINEER" });
    mocks.db.engineer.findUnique.mockImplementation(({ where }: { where: { id?: string; userId?: string } }) =>
      where.userId !== undefined || where.id === "e1"
        ? Promise.resolve({ id: where.id ?? "e1", name: "أحمد" })
        : Promise.resolve({ id: "e1", name: "أحمد" }),
    );
    mocks.buildStatement.mockResolvedValue({ engineer: { id: "e1" } });
  });

  it("403s a signed-in user with neither the engineers nor the sales page", async () => {
    mocks.requireAnyPage.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue({ id: "u9", role: "EMPLOYEE" });

    const res = await readStatement(req(), params("e1"));

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mocks.buildStatement).not.toHaveBeenCalled();
  });

  it("401s when nobody is signed in", async () => {
    mocks.requireAnyPage.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(null);

    expect((await readStatement(req(), params("e1"))).status).toBe(401);
  });

  it("lets an engineer read their own statement", async () => {
    mocks.db.engineer.findUnique.mockImplementation(({ where }: { where: { userId?: string; id?: string } }) =>
      Promise.resolve(where.userId !== undefined ? { id: "e1", name: "أحمد" } : { id: "e1", name: "أحمد" }),
    );

    const res = await readStatement(req(), params("e1"));

    expect(res.status).toBe(200);
    expect(mocks.buildStatement).toHaveBeenCalledWith("e1");
  });

  it("stops an engineer from reading another engineer's statement", async () => {
    // The engineer row behind the session is e1; the URL asks for e2.
    mocks.db.engineer.findUnique.mockImplementation(({ where }: { where: { userId?: string; id?: string } }) =>
      Promise.resolve(where.userId !== undefined ? { id: "e1" } : { id: where.id }),
    );

    const res = await readStatement(req(), params("e2"));

    expect(res.status).toBe(403);
    expect(mocks.buildStatement).not.toHaveBeenCalled();
  });

  it("stops an engineer from reading another engineer's sales", async () => {
    mocks.db.engineer.findUnique.mockImplementation(({ where }: { where: { userId?: string; id?: string } }) =>
      Promise.resolve(where.userId !== undefined ? { id: "e1" } : { id: where.id }),
    );

    expect((await readSales(req(), params("e2"))).status).toBe(403);
  });

  it("does not self-scope a manager — they read any engineer's statement", async () => {
    mocks.requireAnyPage.mockResolvedValue({ id: "admin1", role: "GENERAL_MANAGER" });

    const res = await readStatement(req(), params("e2"));

    expect(res.status).toBe(200);
    expect(mocks.buildStatement).toHaveBeenCalledWith("e2");
  });
});
