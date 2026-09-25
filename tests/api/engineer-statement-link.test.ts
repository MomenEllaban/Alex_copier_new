import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    engineer: { findUnique: vi.fn(), update: vi.fn() },
  };
  return { requirePageAccess: vi.fn(), requireAuth: vi.fn(), db, buildStatement: vi.fn() };
});

vi.mock("@/lib/auth-helpers", () => ({
  requirePageAccess: mocks.requirePageAccess,
  requireAuth: mocks.requireAuth,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/engineer-statement", () => ({ buildEngineerStatement: mocks.buildStatement }));

import { POST as issueLink } from "@/app/api/engineers/[id]/statement-token/route";
import { GET as readLink } from "@/app/api/public/engineer-statement/[token]/route";

const FUTURE = new Date(Date.now() + 10 * 864e5);
const PAST = new Date(Date.now() - 10 * 864e5);
const req = () => new Request("http://localhost/api/engineers/e1/statement-token", { method: "POST" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("engineer statement link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue({ id: "u1", role: "ADMIN" });
    mocks.db.engineer.findUnique.mockResolvedValue({ id: "e1" });
    mocks.db.engineer.update.mockResolvedValue({});
    mocks.buildStatement.mockResolvedValue({ engineer: { id: "e1" } });
  });

  it("stores the token together with its expiry", async () => {
    await issueLink(req(), params("e1"));

    const { data } = mocks.db.engineer.update.mock.calls[0][0];
    expect(data.statementToken).toMatch(/^[0-9a-f]{32}$/);
    expect(data.statementTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rotates the token on every press — this is the cancel button", async () => {
    const first = await (await issueLink(req(), params("e1"))).json();
    const second = await (await issueLink(req(), params("e1"))).json();

    expect(second.token).not.toBe(first.token);
  });

  it("serves the statement for a live link", async () => {
    mocks.db.engineer.findUnique.mockResolvedValue({
      id: "e1",
      statementTokenExpiresAt: FUTURE,
    });

    const res = await readLink(req(), { params: Promise.resolve({ token: "abc" }) });

    expect(res.status).toBe(200);
    expect(mocks.buildStatement).toHaveBeenCalledWith("e1");
  });

  it("returns 410 for an expired link and never builds the statement", async () => {
    mocks.db.engineer.findUnique.mockResolvedValue({
      id: "e1",
      statementTokenExpiresAt: PAST,
    });

    const res = await readLink(req(), { params: Promise.resolve({ token: "abc" }) });

    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("TOKEN_EXPIRED");
    expect(mocks.buildStatement).not.toHaveBeenCalled();
  });

  it("returns 410 for a token with no expiry at all", async () => {
    mocks.db.engineer.findUnique.mockResolvedValue({ id: "e1", statementTokenExpiresAt: null });

    expect((await readLink(req(), { params: Promise.resolve({ token: "abc" }) })).status).toBe(410);
    expect(mocks.buildStatement).not.toHaveBeenCalled();
  });
});
