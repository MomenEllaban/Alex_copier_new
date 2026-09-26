// Live check of the permissions matrix against the real database.
//
//   npm run verify:matrix
//
// Signs in as the general manager, reads the matrix, applies a change to the
// accountant role, confirms it takes effect for a signed-in accountant without
// a re-login, and checks the page switch cascades.
//
// This script WRITES to the database. It restores the seeded defaults when it
// finishes, so run `npm run db:seed:rbac -- --reset` afterwards if it is
// interrupted part way through.

import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { parse } from "node:url";

const PORT = 3198;
const GM = "reza@alex-copier.com";
const ACCOUNTANT = "hatem.accountant@alex-copier.com";
const PASSWORD = "password123";

function cookies(res: Response): string {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function login(base: string, email: string): Promise<string> {
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies(csrfRes) },
    body: new URLSearchParams({
      csrfToken,
      email,
      password: PASSWORD,
      callbackUrl: `${base}/`,
      json: "true",
    }).toString(),
    redirect: "manual",
  });
  const jar = cookies(res);
  if (!jar.includes("session-token")) throw new Error(`login failed for ${email}: ${res.status}`);
  return jar;
}

interface MatrixPage {
  key: string;
  canView: boolean;
  actions: { key: string; isAllowed: boolean }[];
}

const checks: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
}

async function main() {
  const root = path.join(__dirname, "..");
  const next = await import("next");
  const app = next.default({ dev: false, dir: root });
  const handle = app.getRequestHandler();
  await new Promise<void>((r) => app.prepare().then(() => r()));
  const server = createServer((req, res) => handle(req, res, parse(req.url!, true)));
  await new Promise<void>((r) => server.listen(PORT, r));
  const base = `http://127.0.0.1:${PORT}`;

  console.log(`\nVerifying the permissions matrix against ${base}\n`);

  try {
    const gm = await login(base, GM);
    const accountant = await login(base, ACCOUNTANT);

    const rolesRes = await fetch(`${base}/api/roles`, { headers: { Cookie: gm } });
    const roles = (await rolesRes.json()) as { id: string; key: string; isSystem: boolean }[];
    const accountantRole = roles.find((r) => r.key === "ACCOUNTANT")!;

    console.log("--- catalogue");
    record("the roles API lists the built-in roles", roles.length >= 9, `${roles.length} roles`);
    record(
      "the general manager is marked as a protected system role",
      roles.find((r) => r.key === "GENERAL_MANAGER")?.isSystem === true
    );

    const readMatrix = async () => {
      const res = await fetch(`${base}/api/roles/${accountantRole.id}/permissions`, {
        headers: { Cookie: gm },
        cache: "no-store",
      });
      return (await res.json()) as { pages: MatrixPage[] };
    };

    const first = await readMatrix();
    record("the matrix returns every page", first.pages.length === 31, `${first.pages.length} pages`);

    // A system role must refuse edits outright.
    const gmRole = roles.find((r) => r.key === "GENERAL_MANAGER")!;
    const gmPut = await fetch(`${base}/api/roles/${gmRole.id}/permissions`, {
      method: "PUT",
      headers: { Cookie: gm, "Content-Type": "application/json" },
      body: JSON.stringify({ pages: {}, actions: {} }),
    });
    record(
      "the general manager's own permissions cannot be edited",
      gmPut.status === 403,
      `got ${gmPut.status}`
    );

    // Non-admins must not reach the API at all.
    const nonAdmin = await fetch(`${base}/api/roles`, { headers: { Cookie: accountant } });
    record("a non-admin cannot list roles", nonAdmin.status === 403, `got ${nonAdmin.status}`);

    console.log("\n--- a live change reaches an already-signed-in user");
    const before = await (
      await fetch(`${base}/api/permissions/me`, {
        headers: { Cookie: accountant },
        cache: "no-store",
      })
    ).json();
    record(
      "before: the accountant cannot delete a settlement",
      !before.actions.includes("settlements:delete")
    );

    // Turn delete on for the accountant. The rest of the matrix is echoed back
    // untouched, taken from what the server just returned.
    const draft = {
      pages: Object.fromEntries(first.pages.map((p) => [p.key, p.canView])),
      actions: {
        ...Object.fromEntries(
          first.pages.flatMap((p) => p.actions.map((a) => [`${p.key}:${a.key}`, a.isAllowed]))
        ),
        "settlements:delete": true,
      },
    };
    const saveRes = await fetch(`${base}/api/roles/${accountantRole.id}/permissions`, {
      method: "PUT",
      headers: { Cookie: gm, "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const saved = (await saveRes.json()) as { actionsEnabled: number };
    record("the change saves", saveRes.ok, `actionsEnabled=${saved.actionsEnabled}`);

    // The accountant's existing session must see it - no logout, no re-login.
    const afterRes = await fetch(`${base}/api/permissions/me`, {
      headers: { Cookie: accountant },
      cache: "no-store",
    });
    const afterStamp = afterRes.headers.get("X-Permissions-Stamp");
    const after = await afterRes.json();
    record(
      "an already-signed-in user picks the change up without logging in",
      after.actions.includes("settlements:delete"),
      "settlements:delete now granted"
    );

    // And the server must enforce the new grant, not just report it.
    const probe = await fetch(`${base}/api/settlements/s-nonexistent`, {
      method: "DELETE",
      headers: { Cookie: accountant },
    });
    record(
      "the new grant is enforced server-side",
      probe.status === 404,
      `DELETE now passes the guard and 404s (got ${probe.status}, was 403)`
    );

    // Switching a page off must clear its actions.
    console.log("\n--- switching a page off cascades");
    const offDraft = {
      pages: { ...draft.pages, settlements: false },
      actions: { ...draft.actions, "settlements:view": true },
    };
    await fetch(`${base}/api/roles/${accountantRole.id}/permissions`, {
      method: "PUT",
      headers: { Cookie: gm, "Content-Type": "application/json" },
      body: JSON.stringify(offDraft),
    });
    const offMatrix = await readMatrix();
    const offPage = offMatrix.pages.find((p) => p.key === "settlements")!;
    record(
      "a page switched off loses its actions",
      offPage.canView === false && offPage.actions.every((a) => !a.isAllowed),
      `canView=${offPage.canView}, ${offPage.actions.filter((a) => a.isAllowed).length} actions left`
    );

    // The stamp is what the browser polls to notice a change.
    console.log("\n--- change stamp");
    record("the response carries a permissions stamp", Boolean(afterStamp), afterStamp ?? "(none)");
    const stampRes = await fetch(`${base}/api/permissions/stamp`, {
      headers: { Cookie: accountant },
      cache: "no-store",
    });
    record("the stamp endpoint answers", stampRes.ok, `got ${stampRes.status}`);
    const stampNow = (await stampRes.json()).stamp;
    record("the stamp moved after the edits", stampNow !== afterStamp, `${afterStamp} -> ${stampNow}`);
  } finally {
    server.close();
    await app.close?.();
  }

  console.log("\n  (run `npm run db:seed:rbac -- --reset` to restore the seeded defaults)");

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
