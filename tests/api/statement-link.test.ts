import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    customer: { findUnique: vi.fn(), update: vi.fn() },
  };
  return { requirePageAccess: vi.fn(), requireAuth: vi.fn(), db, buildStatement: vi.fn() };
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
vi.mock("@/lib/customer-statement", () => ({ buildCustomerStatement: mocks.buildStatement }));

import { POST as issueLink } from "@/app/api/customers/[id]/statement-token/route";
import { GET as readLink } from "@/app/api/public/statement/[token]/route";

const FUTURE = new Date(Date.now() + 10 * 864e5);
const PAST = new Date(Date.now() - 10 * 864e5);
const req = () => new Request("http://localhost/api/customers/c1/statement-token", { method: "POST" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("customer statement link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue({ id: "u1", role: "ADMIN" });
    mocks.db.customer.findUnique.mockResolvedValue({ id: "c1" });
    mocks.db.customer.update.mockResolvedValue({});
    mocks.buildStatement.mockResolvedValue({ customer: { id: "c1" } });
  });

  describe("issuing", () => {
    it("stores the token together with its expiry", async () => {
      await issueLink(req(), params("c1"));

      const { data } = mocks.db.customer.update.mock.calls[0][0];
      expect(data.statementToken).toMatch(/^[0-9a-f]{32}$/);
      expect(data.statementTokenCreatedAt).toBeInstanceOf(Date);
      expect(data.statementTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("tells the caller when the link dies", async () => {
      const res = await issueLink(req(), params("c1"));
      const body = await res.json();

      expect(body.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("rotates the token even when the customer already has one — this is the cancel button", async () => {
      // The old code read the existing token and returned it unchanged, so a
      // link that leaked to WhatsApp could never be killed.
      const first = await (await issueLink(req(), params("c1"))).json();
      const second = await (await issueLink(req(), params("c1"))).json();
      const third = await (await issueLink(req(), params("c1"))).json();

      expect(second.token).not.toBe(first.token);
      expect(third.token).not.toBe(second.token);
    });

    it("does not write anything for a missing customer", async () => {
      mocks.db.customer.findUnique.mockResolvedValue(null);

      expect((await issueLink(req(), params("nope"))).status).toBe(404);
      expect(mocks.db.customer.update).not.toHaveBeenCalled();
    });
  });

  describe("reading through the public link", () => {
    it("serves the statement for a live link", async () => {
      mocks.db.customer.findUnique.mockResolvedValue({
        id: "c1",
        statementTokenExpiresAt: FUTURE,
      });

      const res = await readLink(req(), { params: Promise.resolve({ token: "abc" }) });

      expect(res.status).toBe(200);
      expect(mocks.buildStatement).toHaveBeenCalledWith("c1");
    });

    it("returns 410 for an expired link and never builds the statement", async () => {
      mocks.db.customer.findUnique.mockResolvedValue({
        id: "c1",
        statementTokenExpiresAt: PAST,
      });

      const res = await readLink(req(), { params: Promise.resolve({ token: "abc" }) });

      expect(res.status).toBe(410);
      expect((await res.json()).code).toBe("TOKEN_EXPIRED");
      expect(mocks.buildStatement).not.toHaveBeenCalled();
    });

    it("returns 410 for a token with no expiry at all", async () => {
      mocks.db.customer.findUnique.mockResolvedValue({
        id: "c1",
        statementTokenExpiresAt: null,
      });

      const res = await readLink(req(), { params: Promise.resolve({ token: "abc" }) });

      expect(res.status).toBe(410);
      expect(mocks.buildStatement).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown token", async () => {
      mocks.db.customer.findUnique.mockResolvedValue(null);

      expect(
        (await readLink(req(), { params: Promise.resolve({ token: "nope" }) })).status,
      ).toBe(404);
    });
  });
});
