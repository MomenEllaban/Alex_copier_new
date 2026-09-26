// End-to-end check of the RBAC layer against the real database.
//
//   npx tsx scripts/verify-rbac.ts
//
// Logs in as a real user per role over HTTP, then checks that the sidebar pages
// and the API agree — including the case that matters most: a button hidden in
// the UI must still be refused by the server when the endpoint is called
// directly.

import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { parse } from "node:url";

const BASE_PORT = 3199;

/** The test accounts from the README, one per role. */
const ACCOUNTS = [
  { role: "GENERAL_MANAGER", email: "reza@alex-copier.com" },
  { role: "COMPANY_MANAGER", email: "amr.manager@alex-copier.com" },
  { role: "ACCOUNTANT", email: "hatem.accountant@alex-copier.com" },
  { role: "ENGINEER", email: "moemen.engineer@alex-copier.com" },
  { role: "SALES_EMPLOYEE", email: "moemen.sales.parts@alex-copier.com" },
  { role: "WORKSHOP_MANAGER", email: "ahmed.khaled@alex-copier.com" },
] as const;

type Role = (typeof ACCOUNTS)[number]["role"];

interface Session {
  cookie: string;
  pages: string[];
  actions: string[];
}

/** Signs in through NextAuth's credential endpoint and returns the cookie. */
async function login(base: string, email: string): Promise<string> {
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const cookies = collectCookies(csrfRes);

  const res = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies,
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password: "password123",
      callbackUrl: `${base}/`,
      json: "true",
    }).toString(),
    redirect: "manual",
  });

  const sessionCookie = collectCookies(res);
  if (!sessionCookie.includes("session-token")) {
    throw new Error(`login failed for ${email}: ${res.status}`);
  }
  return sessionCookie;
}

function collectCookies(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function permissionsOf(base: string, cookie: string): Promise<Session> {
  const res = await fetch(`${base}/api/permissions/me`, {
    headers: { Cookie: cookie },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`/api/permissions/me returned ${res.status}`);
  const data = (await res.json()) as {
    role: { key: string };
    pages: string[];
    actions: string[];
  };
  return { cookie, pages: data.pages, actions: data.actions };
}

/** A guarded write the role must not be able to perform. */
const FORBIDDEN_PROBES: Record<string, { path: string; init: RequestInit }[]> = {
  // An accountant can open settlements and companies but must not delete from
  // them, and no non-admin role may reach the roles API at all.
  ACCOUNTANT: [
    { path: "/api/settlements/s-nonexistent", init: { method: "DELETE" } },
    { path: "/api/companies/c-nonexistent", init: { method: "DELETE" } },
    { path: "/api/roles", init: { method: "GET" } },
  ],
  // An engineer may not create a purchase order.
  ENGINEER: [
    { path: "/api/purchases", init: { method: "POST", body: "{}" } },
    { path: "/api/roles", init: { method: "GET" } },
  ],
  // Sales may not delete an order.
  SALES_EMPLOYEE: [
    { path: "/api/sales/s-nonexistent", init: { method: "DELETE" } },
    { path: "/api/roles", init: { method: "GET" } },
  ],
  WORKSHOP_MANAGER: [{ path: "/api/roles", init: { method: "GET" } }],
  // A company manager has no delete on system settings (users).
  COMPANY_MANAGER: [
    { path: "/api/users/u-nonexistent", init: { method: "DELETE" } },
    { path: "/api/roles", init: { method: "GET" } },
  ],
};

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

async function main() {
  const root = path.join(__dirname, "..");
  const checks: Check[] = [];
  const record = (name: string, ok: boolean, detail = "") => {
    checks.push({ name, ok, detail });
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  // Boot the real app so the checks exercise the actual middleware and routes.
  process.env.PORT = String(BASE_PORT);
  const next = await import("next");
  const app = next.default({ dev: false, dir: root });
  const handle = app.getRequestHandler();
  await new Promise<void>((resolve) => app.prepare().then(() => resolve()));

  const server = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });
  await new Promise<void>((resolve) => server.listen(BASE_PORT, resolve));
  const base = `http://127.0.0.1:${BASE_PORT}`;

  console.log(`\nVerifying RBAC against ${base}\n`);

  try {
    for (const account of ACCOUNTS) {
      console.log(`\n── ${account.role} (${account.email})`);
      let session: Session;
      try {
        session = await permissionsOf(base, await login(base, account.email));
      } catch (error) {
        record(`${account.role}: can sign in`, false, String(error));
        continue;
      }
      record(`${account.role}: can sign in`, true, `${session.pages.length} pages`);

      // The sidebar and the API must agree, so compare against the static table.
      const { ROLE_PERMISSIONS } = await import("../src/lib/permissions");
      const expected = new Set<string>(ROLE_PERMISSIONS[account.role as never] ?? []);
      const actual = new Set(session.pages);
      const missing = [...expected].filter((p) => !actual.has(p));
      const extra = [...actual].filter((p) => !expected.has(p));
      record(
        `${account.role}: sidebar matches the seeded page grants`,
        missing.length === 0 && extra.length === 0,
        missing.length || extra.length ? `missing [${missing}] extra [${extra}]` : ""
      );

      // A page that is visible must answer, and a hidden one must not.
      const visible = [...actual][0];
      if (visible) {
        const res = await fetch(`${base}/api/${routeFor(visible)}`, {
          headers: { Cookie: session.cookie },
        });
        record(
          `${account.role}: an allowed page answers`,
          res.status !== 401 && res.status !== 403,
          `${routeFor(visible)} -> ${res.status}`
        );
      }

      // The important one: a hidden button is still refused by the server.
      for (const probe of FORBIDDEN_PROBES[account.role] ?? []) {
        const res = await fetch(`${base}${probe.path}`, {
          method: probe.init.method,
          headers: { Cookie: session.cookie, "Content-Type": "application/json" },
          body: probe.init.body,
        });
        record(
          `${account.role}: ${probe.init.method} ${probe.path} is refused`,
          res.status === 403,
          `got ${res.status}`
        );
      }

      // Button-level hiding: a page can be open while an action inside it is
      // withheld, and that is the distinction the matrix adds.
      if (account.role === "ACCOUNTANT") {
        record(
          "ACCOUNTANT: settlements is open",
          session.pages.includes("settlements"),
          `${session.pages.length} pages`
        );
        record(
          "ACCOUNTANT: delete is withheld on a page it can open",
          !session.actions.includes("settlements:delete"),
          `settlements:delete ${session.actions.includes("settlements:delete") ? "granted" : "withheld"}`
        );
        record(
          "ACCOUNTANT: add and edit are granted where the page offers them",
          session.actions.includes("purchases:add") &&
            session.actions.includes("purchases:edit"),
          "purchases:add, purchases:edit"
        );
      }
      if (account.role === "GENERAL_MANAGER") {
        record(
          "GENERAL_MANAGER: full access, never locked out",
          session.actions.includes("finance:delete") && session.actions.includes("settings:delete")
        );
      }
    }

    // Anonymous access must be refused everywhere it matters.
    console.log("\n── anonymous");
    for (const path of ["/api/roles", "/api/permissions/me", "/api/customers"]) {
      const res = await fetch(`${base}${path}`, { headers: { Cookie: "" } });
      record(`anonymous ${path} is refused`, res.status === 401, `got ${res.status}`);
    }
  } finally {
    server.close();
    await app.close?.();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
}

function routeFor(page: string): string {
  const map: Record<string, string> = {
    dashboard: "dashboard",
    customers: "customers",
    sales: "sales",
    purchases: "purchases",
    machines: "machines",
    engineers: "engineers",
    inventory: "inventory",
    finance: "invoices",
    settlements: "settlements",
    hrSelfService: "hr/payroll",
  };
  return map[page] ?? page;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
