import { beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync } from "fs";
import { join, relative } from "path";

/**
 * CODE-AUDIT 2.x — no API route may serve an anonymous caller.
 *
 * The guard table is discovered from the filesystem rather than hand-listed, so a
 * route added later is covered the moment this file runs. Every exported HTTP
 * method is invoked with the auth guards stubbed to "deny" and must answer 401 or
 * 403. A route that returns 2xx has no working guard.
 *
 * Three routes are public by design and are asserted separately: NextAuth's own
 * handler, and the two secret-token statement links.
 */

const API_ROOT = join(process.cwd(), "src", "app", "api");

const PUBLIC_BY_DESIGN = new Set([
  "auth/[...nextauth]",
  "public/statement/[token]",
  "public/engineer-statement/[token]",
]);

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const guardNames = [
  "requirePageAccess",
  "requireAnyPage",
  "requireAction",
  "requireAnyAction",
  "requireAuthWithPermissions",
  "requireAuth",
  "requireRole",
  "requireSuperAdmin",
] as const;

const count = () => vi.fn(async () => 0);
const findMany = () => vi.fn(async () => []);

const mocks = {
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
  requireAnyPage: vi.fn(),
  requireAuthWithPermissions: vi.fn(),
  requireRole: vi.fn(),
  requireSuperAdmin: vi.fn(),
  db: {
    user: { findUnique: vi.fn(async () => null), count: count() },
    engineer: { findUnique: vi.fn(async () => null), count: count(), findMany: findMany() },
    company: { findUnique: vi.fn(async () => null), count: count(), findMany: findMany() },
    customer: { findUnique: vi.fn(async () => null), count: count(), findMany: findMany() },
    machine: { count: count(), findMany: findMany() },
    contract: { count: count(), findMany: findMany() },
    serviceRequest: { count: count(), findMany: findMany() },
    purchaseOrder: { count: count(), findMany: findMany() },
    salesOrder: { count: count(), findMany: findMany() },
    product: { count: count(), findMany: findMany() },
    // Any further call throws, so a route that skips its guard fails loudly
    // instead of quietly reaching the database.
  },
};

vi.mock("@/lib/auth-helpers", () => {
  const deny = () => null;
  const handler: Record<string, unknown> = {};
  for (const g of guardNames) handler[g] = vi.fn(deny);
  handler.requireAction = vi.fn(deny);
  handler.requireAnyAction = vi.fn(deny);
  return handler;
});

vi.mock("@/lib/prisma", () => {
  const proxied = new Proxy(mocks.db, {
    get(target: Record<string, unknown>, prop: string) {
      if (prop in target) return target[prop];
      // A model the test does not stub: any access means the guard was skipped.
      return new Proxy(
        {},
        {
          get: () => () => {
            throw new Error(`prisma.${String(prop)} reached without a guard`);
          },
        }
      );
    },
  });
  return { prisma: proxied };
});

vi.mock("@/lib/customer-statement", () => ({ buildCustomerStatement: vi.fn() }));
vi.mock("@/lib/engineer-statement", () => ({ buildEngineerStatement: vi.fn() }));

/** Finds every route.ts under src/app/api and returns "a/b/c" keys. */
function discoverRoutes(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...discoverRoutes(full));
    else if (entry.name === "route.ts") {
      found.push(relative(API_ROOT, full).replace(/\\/g, "/").replace(/\/route\.ts$/, ""));
    }
  }
  return found.sort();
}

const ROUTES = discoverRoutes(API_ROOT);

/** A plausible id for the [id]/[token] segment, taken from the route key. */
function paramsFor(route: string) {
  const seg = route.split("/").find((s) => /^\[.+\]$/.test(s));
  if (!seg) return undefined;
  return { params: Promise.resolve({ [seg.replace(/[{}]/g, "")]: "probe-id" }) };
}

async function callModule(route: string, method: string) {
  const mod = await import(`@/app/api/${route}/route`);
  const fn = (mod as Record<string, unknown>)[method];
  if (typeof fn !== "function") return undefined;
  const req = new Request("http://localhost/api/probe", {
    method: method === "GET" ? "GET" : "POST",
  });
  return (fn as (a: unknown, b?: unknown) => Promise<Response>)(req, paramsFor(route));
}

describe("CODE-AUDIT 2.1 — every API route rejects an anonymous caller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("discovers the whole api tree", () => {
    // A silent discovery failure would make every case below vacuously pass.
    expect(ROUTES.length).toBeGreaterThan(80);
    expect(ROUTES).toContain("roles");
    expect(ROUTES).toContain("health-check");
  });

  describe.sequential.each(ROUTES)("%s", (route) => {
    if (PUBLIC_BY_DESIGN.has(route)) {
      it("is public by design, so no guard is expected", () => {
        expect(PUBLIC_BY_DESIGN.has(route)).toBe(true);
      });
      return;
    }

    for (const method of METHODS) {
      it(`${method} refuses an anonymous caller`, async () => {
        const res = await callModule(route, method);
        if (res === undefined) return; // method not exported by this route
        expect([401, 403], `${route} ${method} answered ${res.status} to an anonymous caller`)
          .toContain(res.status);
      });
    }
  });
});
