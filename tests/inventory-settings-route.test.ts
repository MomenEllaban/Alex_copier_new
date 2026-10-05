import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The settings endpoint, which is the one place a role outside the sales flow
 * can loosen the stock guard — so the guard here is the endpoint's own.
 *
 * Two properties are worth locking down: an actor pinned to a company cannot
 * write (or read) another company's policy by putting an id in the request, and
 * only real booleans are stored. Both are enforced by reading `actor.companyId`
 * ahead of anything in the body, which is easy to undo by accident later.
 */

const auth = {
  actor: { id: "u1", companyId: "c1" } as { id: string; companyId?: string } | null,
  pageAllowed: true,
  actionAllowed: true,
};

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: async () => (auth.actor ? { id: "u1" } : null),
  requirePageAccess: async () => (auth.pageAllowed && auth.actor ? auth.actor : null),
  requireAction: async () => (auth.actionAllowed && auth.actor ? auth.actor : null),
}));

const rows = new Map<string, { id: string; companyId: string; allowNegativeStock: boolean; warnOnNegativeStock: boolean }>();
const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
let idSeq = 0;

const prismaMock = {
  inventorySetting: {
    findUnique: async ({ where }: any) => rows.get(where.companyId) ?? null,
    create: async ({ data }: any) => {
      const row = {
        id: `set-${++idSeq}`,
        companyId: data.companyId,
        allowNegativeStock: false,
        warnOnNegativeStock: true,
      };
      rows.set(data.companyId, row);
      return row;
    },
    update: async ({ where, data }: any) => {
      updates.push({ where, data });
      const row = [...rows.values()].find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    },
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { GET, PUT } = await import("@/app/api/inventory/settings/route");

const get = (query = "") => GET(new Request(`http://localhost/api/inventory/settings${query}`));
const put = (body: Record<string, unknown>) =>
  PUT(
    new Request("http://localhost/api/inventory/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("GET /api/inventory/settings", () => {
  beforeEach(() => {
    rows.clear();
    updates.length = 0;
    idSeq = 0;
    auth.actor = { id: "u1", companyId: "c1" };
    auth.pageAllowed = true;
    auth.actionAllowed = true;
  });

  it("creates the row with the blocking defaults the first time it is asked for", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ companyId: "c1", allowNegativeStock: false, warnOnNegativeStock: true });
  });

  it("reads the company's own policy, not another company's", async () => {
    rows.set("c1", { id: "a", companyId: "c1", allowNegativeStock: false, warnOnNegativeStock: true });
    rows.set("c2", { id: "b", companyId: "c2", allowNegativeStock: true, warnOnNegativeStock: false });
    // The general manager may name a company; a company manager may not.
    const res = await get("?companyId=c2");
    expect((await res.json()).companyId).toBe("c1");
  });

  it("lets the general manager read the company they ask for", async () => {
    auth.actor = { id: "gm" };
    rows.set("c2", { id: "b", companyId: "c2", allowNegativeStock: true, warnOnNegativeStock: false });
    const res = await get("?companyId=c2");
    expect(await res.json()).toMatchObject({ companyId: "c2", allowNegativeStock: true });
  });

  it("asks for a company when the actor has none and names none", async () => {
    auth.actor = { id: "gm" };
    const res = await get();
    expect(res.status).toBe(400);
  });

  it("refuses an actor without the page", async () => {
    auth.pageAllowed = false;
    const res = await get();
    expect(res.status).toBe(403);
  });

  it("answers 401 when there is no session at all", async () => {
    auth.actor = null;
    const res = await get();
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/inventory/settings", () => {
  beforeEach(() => {
    rows.clear();
    updates.length = 0;
    idSeq = 0;
    auth.actor = { id: "u1", companyId: "c1" };
    auth.pageAllowed = true;
    auth.actionAllowed = true;
  });

  it("stores the two switches and nothing else", async () => {
    const res = await put({ allowNegativeStock: true, warnOnNegativeStock: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ companyId: "c1", allowNegativeStock: true, warnOnNegativeStock: false });
    expect(updates).toHaveLength(1);
    expect(updates[0].data).toEqual({ allowNegativeStock: true, warnOnNegativeStock: false });
  });

  it("cannot be pointed at another company through the body", async () => {
    await put({ companyId: "c2", allowNegativeStock: true });
    expect(updates).toHaveLength(1);
    // The row that was created and updated belongs to the actor's own company.
    expect([...rows.keys()]).toEqual(["c1"]);
    expect(rows.get("c2")).toBeUndefined();
  });

  it("lets the general manager write for the company they name", async () => {
    auth.actor = { id: "gm" };
    const res = await put({ companyId: "c2", allowNegativeStock: true });
    expect(res.status).toBe(200);
    expect(rows.get("c2")).toMatchObject({ allowNegativeStock: true, warnOnNegativeStock: true });
  });

  it("ignores values that are not booleans instead of writing them", async () => {
    rows.set("c1", { id: "a", companyId: "c1", allowNegativeStock: false, warnOnNegativeStock: true });
    const res = await put({ allowNegativeStock: "true", warnOnNegativeStock: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ allowNegativeStock: false, warnOnNegativeStock: true });
    expect(updates).toHaveLength(0);
  });

  it("refuses an actor without the action", async () => {
    auth.actionAllowed = false;
    const res = await put({ allowNegativeStock: true });
    expect(res.status).toBe(403);
    expect(rows.size).toBe(0);
  });
});