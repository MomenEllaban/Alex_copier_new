import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    returnTransaction: { findUnique: vi.fn() },
  };
  return { requirePageAccess: vi.fn(), requireAuth: vi.fn(), db };
});

vi.mock("@/lib/auth-helpers", () => ({
  requirePageAccess: mocks.requirePageAccess,
  // Action guards delegate to the page guard: these tests decide who is
  // allowed, not which action, and the page answer is what they mean.
  requireAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyAction: (page: string) => mocks.requirePageAccess(page),
  requireAuth: mocks.requireAuth,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));

import { GET } from "@/app/api/returns/[id]/route";

const req = () => new Request("http://localhost/api/returns/r1");
const params = (id = "r1") => ({ params: Promise.resolve({ id }) });

describe("GET /api/returns/[id] — auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "u1", role: "GENERAL_MANAGER" });
    mocks.requirePageAccess.mockResolvedValue({ id: "u1", role: "GENERAL_MANAGER" });
    mocks.db.returnTransaction.findUnique.mockResolvedValue({ id: "r1", total: 100 });
  });

  it("rejects unauthenticated requests with 401 and never touches the database", async () => {
    mocks.requireAuth.mockResolvedValue(null);
    mocks.requirePageAccess.mockResolvedValue(null);

    const res = await GET(req(), params());

    expect(res.status).toBe(401);
    expect(mocks.db.returnTransaction.findUnique).not.toHaveBeenCalled();
  });

  it("rejects authenticated users without the returns page with 403 and never touches the database", async () => {
    // A plain EMPLOYEE is authenticated but has no "returns" page access.
    mocks.requireAuth.mockResolvedValue({ id: "u2", role: "EMPLOYEE" });
    mocks.requirePageAccess.mockResolvedValue(null);

    const res = await GET(req(), params());

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mocks.db.returnTransaction.findUnique).not.toHaveBeenCalled();
  });

  it("returns the return for a user with the returns page", async () => {
    const res = await GET(req(), params());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "r1", total: 100 });
    expect(mocks.db.returnTransaction.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "r1" } }),
    );
  });

  it("returns 404 for a return that does not exist", async () => {
    mocks.db.returnTransaction.findUnique.mockResolvedValue(null);

    const res = await GET(req(), params("missing"));

    expect(res.status).toBe(404);
  });

  it("maps database failures to a 500 error", async () => {
    mocks.db.returnTransaction.findUnique.mockRejectedValue(new Error("connection refused"));

    const res = await GET(req(), params());

    expect(res.status).toBe(500);
  });
});
