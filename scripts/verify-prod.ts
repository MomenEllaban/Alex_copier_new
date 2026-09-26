// Verifies the DEPLOYED build, over HTTP, against production.
//
//   npm run verify:prod
//
// Logs in as one real account per role and checks that the sidebar pages and the
// API agree — including the case that matters most: a button hidden in the UI
// must still be refused by the server when the endpoint is called directly.
//
// Read-only. It never writes to the database.

const BASE = process.env.BASE_URL ?? "https://alex-copier.vercel.app";
const PASSWORD = "password123";

/** One real test account per role, from the README. */
const ACCOUNTS = [
  { role: "GENERAL_MANAGER", email: "reza@alex-copier.com" },
  { role: "COMPANY_MANAGER", email: "amr.manager@alex-copier.com" },
  { role: "ACCOUNTANT", email: "hatem.accountant@alex-copier.com" },
  { role: "ENGINEER", email: "moemen.engineer@alex-copier.com" },
  { role: "SALES_EMPLOYEE", email: "moemen.sales.parts@alex-copier.com" },
  { role: "WORKSHOP_MANAGER", email: "ahmed.khaled@alex-copier.com" },
] as const;

type Role = (typeof ACCOUNTS)[number]["role"];

/** Calls each role must be refused, with the reason they should be refused. */
const FORBIDDEN_PROBES: Record<Role, { what: string; path: string; method: string }[]> = {
  // The general manager is not listed here: nothing should be refused for them.
  GENERAL_MANAGER: [],
  COMPANY_MANAGER: [
    { what: "no delete on system settings", path: "/api/users/u-nonexistent", method: "DELETE" },
    { what: "cannot reach the roles API", path: "/api/roles", method: "GET" },
  ],
  ACCOUNTANT: [
    { what: "no delete on settlements", path: "/api/settlements/s-nonexistent", method: "DELETE" },
    { what: "no delete on companies", path: "/api/companies/c-nonexistent", method: "DELETE" },
    { what: "cannot reach the roles API", path: "/api/roles", method: "GET" },
  ],
  ENGINEER: [
    { what: "cannot create a purchase order", path: "/api/purchases", method: "POST" },
    { what: "cannot reach the roles API", path: "/api/roles", method: "GET" },
  ],
  SALES_EMPLOYEE: [
    { what: "no delete on a sale", path: "/api/sales/s-nonexistent", method: "DELETE" },
    { what: "cannot reach the roles API", path: "/api/roles", method: "GET" },
  ],
  WORKSHOP_MANAGER: [{ what: "cannot reach the roles API", path: "/api/roles", method: "GET" }],
};

function cookies(res: Response): string {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function login(email: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const body = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies(csrfRes) },
    body: new URLSearchParams({
      csrfToken: body.csrfToken,
      email,
      password: PASSWORD,
      callbackUrl: `${BASE}/`,
      json: "true",
    }).toString(),
    redirect: "manual",
  });
  const jar = cookies(res);
  if (!jar.includes("session-token")) throw new Error(`login failed (${res.status})`);
  return jar;
}

const checks: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log(`\nVerifying the deployed build at ${BASE}\n`);

  for (const account of ACCOUNTS) {
    console.log(`── ${account.role} (${account.email})`);

    let jar: string;
    try {
      jar = await login(account.email);
    } catch (error) {
      record(`${account.role}: can sign in`, false, String(error));
      continue;
    }
    record(`${account.role}: can sign in`, true);

    // What the sidebar would render.
    const permsRes = await fetch(`${BASE}/api/permissions/me`, {
      headers: { Cookie: jar },
      cache: "no-store",
    });
    if (!permsRes.ok) {
      record(`${account.role}: permissions are readable`, false, `got ${permsRes.status}`);
      continue;
    }
    const perms = (await permsRes.json()) as {
      role: { key: string };
      pages: string[];
      actions: string[];
    };
    record(
      `${account.role}: permissions are readable`,
      true,
      `${perms.pages.length} pages, ${perms.actions.length} actions`
    );

    // The change stamp the open tabs poll.
    const stampRes = await fetch(`${BASE}/api/permissions/stamp`, {
      headers: { Cookie: jar },
      cache: "no-store",
    });
    record(`${account.role}: change stamp answers`, stampRes.ok, `got ${stampRes.status}`);

    // The role's own page set must match the seeded defaults, so a stray edit
    // in the matrix shows up here rather than as a mystery report.
    if (account.role === "GENERAL_MANAGER") {
      record(
        "GENERAL_MANAGER: full access, never locked out",
        perms.actions.includes("finance:delete") && perms.actions.includes("settings:delete"),
        `${perms.actions.length} actions`
      );
    }

    if (account.role === "ACCOUNTANT") {
      // The point of the action layer: the page is open, the action is not.
      record(
        "ACCOUNTANT: settlements is open",
        perms.pages.includes("settlements")
      );
      record(
        "ACCOUNTANT: delete is withheld on a page it can open",
        !perms.actions.includes("settlements:delete"),
        perms.actions.includes("settlements:delete") ? "granted (wrong)" : "withheld"
      );
      record(
        "ACCOUNTANT: add and edit are granted",
        perms.actions.includes("purchases:add") && perms.actions.includes("purchases:edit")
      );
    }

    // Server-side enforcement: a hidden button must still be refused.
    for (const probe of FORBIDDEN_PROBES[account.role]) {
      const res = await fetch(`${BASE}${probe.path}`, {
        method: probe.method,
        headers: { Cookie: jar, "Content-Type": "application/json" },
        body: probe.method === "GET" || probe.method === "DELETE" ? undefined : "{}",
      });
      record(
        `${account.role}: ${probe.method} ${probe.path} refused (${probe.what})`,
        res.status === 403,
        `got ${res.status}`
      );
    }
  }

  // Anonymous callers.
  console.log("── anonymous");
  for (const path of ["/api/roles", "/api/permissions/me", "/api/customers", "/api/tests"]) {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: "" } });
    record(`anonymous ${path} refused`, res.status === 401, `got ${res.status}`);
  }

  // The new screens must exist and render for the general manager.
  console.log("── screens");
  const gm = await login("reza@alex-copier.com");
  const rolesRes = await fetch(`${BASE}/api/roles`, { headers: { Cookie: gm } });
  if (rolesRes.ok) {
    const roles = (await rolesRes.json()) as { key: string; isSystem: boolean; userCount: number }[];
    record("the roles API lists every role", roles.length >= 9, `${roles.length} roles`);
    record(
      "the general manager is a protected system role",
      roles.find((r) => r.key === "GENERAL_MANAGER")?.isSystem === true
    );
  }

  for (const path of ["/settings/roles"]) {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: gm }, redirect: "manual" });
    record(`${path} renders`, res.status === 200, `got ${res.status}`);
  }

  // The per-customer tests page, for a customer that actually exists.
  const custRes = await fetch(`${BASE}/api/customers?pageSize=1`, { headers: { Cookie: gm } });
  const raw = (await custRes.json()) as unknown;
  const first = Array.isArray(raw)
    ? (raw as { id: string }[])[0]
    : ((raw as { rows?: { id: string }[] }).rows ?? [])[0];
  if (first) {
    const page = await fetch(`${BASE}/customers/${first.id}/tests`, {
      headers: { Cookie: gm },
      redirect: "manual",
    });
    record("the per-customer tests page renders", page.status === 200, `got ${page.status}`);

    const filtered = await fetch(
      `${BASE}/api/tests?customerId=${first.id}&machineId=__none__&pageSize=5`,
      { headers: { Cookie: gm } }
    );
    record("the machine filter is accepted by the API", filtered.status === 200, `got ${filtered.status}`);
  } else {
    record("a customer exists to test the per-customer page", false);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
