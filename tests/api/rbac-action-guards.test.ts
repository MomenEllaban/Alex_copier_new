import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  IGNORED_ROUTE_PREFIXES,
  isActionKey,
  pagesForRoute,
  type ActionKey,
} from "@/lib/rbac-catalog";

/**
 * Stops the action layer from eroding.
 *
 * Two failure modes this catches:
 *   1. a new mutating route ships with only a page check (or none), so anyone
 *      who can open the page can also delete from it
 *   2. a guard names an action the page does not offer, so the matrix shows a
 *      toggle that does nothing
 *
 * Read statically rather than by calling the routes, so it covers all 88 files
 * in a few milliseconds and needs no database.
 */

const API_DIR = path.join(process.cwd(), "src", "app", "api");
const MUTATING = ["POST", "PUT", "PATCH", "DELETE"] as const;

/** Guards that are about the system rather than a page capability. */
const ROLE_GUARDS = /requireRole\(|requireSuperAdmin\(/;
const ACTION_GUARDS = /requireAction\(|requireAnyAction\(/;

function listRouteFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listRouteFiles(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

interface Handler {
  verb: string;
  route: string;
  body: string;
}

/** Every exported handler in a route file, with the span that belongs to it. */
function handlersOf(file: string, route: string): Handler[] {
  const src = fs.readFileSync(file, "utf8");
  const marks: { verb: string; index: number }[] = [];
  for (const verb of ["GET", ...MUTATING]) {
    const re = new RegExp(`export\\s+async\\s+function\\s+${verb}\\b`, "g");
    for (const m of src.matchAll(re)) marks.push({ verb, index: m.index! });
  }
  marks.sort((a, b) => a.index - b.index);
  return marks.map((m, i) => ({
    verb: m.verb,
    route,
    body: src.slice(m.index, marks[i + 1]?.index ?? src.length),
  }));
}

const ALL_ROUTES = listRouteFiles(API_DIR)
  .map((file) =>
    handlersOf(
      file,
      path.relative(API_DIR, file).replace(/\\/g, "/").replace(/\/route\.ts$/, "")
    )
  )
  .flat();

/** Routes deliberately outside the matrix: public share links, auth, health. */
const isOutsideMatrix = (route: string) =>
  IGNORED_ROUTE_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`));

/**
 * The guard a handler actually applies, which may live in a helper it calls.
 * Six route files share one `guardMutations` / `guardWrite` / `authorize`
 * helper across several verbs, so a body-only scan would report them as
 * unguarded when they are not.
 */
function helperBodies(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const decl = /(?:^|\n)\s*(?:async\s+)?function\s+(\w+)\s*\(/g;

  for (const m of src.matchAll(decl)) {
    // Walk to the `)` that closes the parameter list.
    let i = m.index! + m[0].length;
    let parens = 1;
    while (i < src.length && parens > 0) {
      if (src[i] === "(") parens++;
      else if (src[i] === ")") parens--;
      i++;
    }

    // Then to the body's `{`. A return type can sit in between and may itself
    // contain braces and semicolons —
    // `): Promise<NextResponse | { actorId: string; isFinance: boolean }> {` —
    // so angle depth has to be tracked, and a `;` only ends the search once we
    // are back outside it (a bare `;` means it was a declaration, not a body).
    let angle = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === "<") angle++;
      else if (ch === ">") angle = Math.max(0, angle - 1);
      else if (ch === "{" && angle === 0) break;
      else if (ch === ";" && angle === 0) break;
      i++;
    }
    if (src[i] !== "{") continue;

    const start = i + 1;
    let depth = 1;
    i = start;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    out.push({ name: m[1], body: src.slice(start, i) });
  }
  return out;
}

function effectiveScope(handler: Handler): string {
  const file = path.join(API_DIR, handler.route, "route.ts");
  if (!fs.existsSync(file)) return handler.body;

  const helpers = helperBodies(fs.readFileSync(file, "utf8"));
  const called = helpers.filter((h) => new RegExp(`\\b${h.name}\\s*\\(`).test(handler.body));
  if (called.length === 0) return handler.body;
  return [handler.body, ...called.map((h) => h.body)].join("\n");
}

const MUTATING_HANDLERS = ALL_ROUTES.filter(
  (h) => MUTATING.includes(h.verb as (typeof MUTATING)[number]) && !isOutsideMatrix(h.route)
).map((h) => ({ ...h, scope: effectiveScope(h) }));

describe("RBAC — every mutating endpoint is action-guarded", () => {
  it("found the mutating handlers to check", () => {
    // A silent scan failure would make every assertion below vacuously pass.
    expect(MUTATING_HANDLERS.length).toBeGreaterThan(60);
  });

  it.each(MUTATING_HANDLERS.map((h) => [`${h.verb} /api/${h.route}`, h] as const))(
    "%s is guarded",
    (_label, handler) => {
      const hasAnyGuard =
        ACTION_GUARDS.test(handler.scope) ||
        ROLE_GUARDS.test(handler.scope) ||
        /requireAuth\(/.test(handler.scope);
      expect(
        hasAnyGuard,
        `${handler.verb} /api/${handler.route} has no permission guard at all`
      ).toBe(true);
    }
  );

  it.each(MUTATING_HANDLERS.map((h) => [`${h.verb} /api/${h.route}`, h] as const))(
    "%s does not rely on a page-only guard",
    (_label, handler) => {
      // A shared helper is fine, so only flag a page check that is not
      // accompanied by an action or role check anywhere in scope.
      if (!/requirePageAccess\(|requireAnyPage\(/.test(handler.scope)) return;

      expect(
        ACTION_GUARDS.test(handler.scope) || ROLE_GUARDS.test(handler.scope),
        `${handler.verb} /api/${handler.route} checks the page but not the action. ` +
          `Use requireAction(page, action) so a hidden button is also refused on the server.`
      ).toBe(true);
    }
  );

  it("every action named in a guard exists in the catalogue", () => {
    const seen = new Set<string>();
    for (const file of listRouteFiles(API_DIR)) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/requireAction\(\s*"[A-Za-z]+"\s*,\s*"([A-Za-z]+)"\s*\)/g)) {
        seen.add(m[1]);
      }
      for (const m of src.matchAll(/requireAnyAction\(\s*"[A-Za-z]+"\s*,\s*([^)]*)\)/g)) {
        for (const inner of m[1].matchAll(/"([A-Za-z]+)"/g)) seen.add(inner[1]);
      }
    }

    expect(seen.size).toBeGreaterThan(0);
    for (const action of seen) {
      expect(isActionKey(action), `"${action}" is not in ACTION_KEYS`).toBe(true);
    }
  });

  it("every route maps to a known page, so nothing escapes the matrix", () => {
    // The RBAC endpoints are the system talking to itself about permissions,
    // not a business page, so they are outside the matrix by design.
    const SELF_ROUTES = ["roles", "permissions"];
    const unmapped = ALL_ROUTES.filter(
      (h) =>
        !isOutsideMatrix(h.route) &&
        !SELF_ROUTES.some((p) => h.route === p || h.route.startsWith(`${p}/`)) &&
        pagesForRoute(h.route).length === 0
    );
    expect(
      unmapped.map((h) => `/api/${h.route}`),
      "these routes are not in the permissions matrix"
    ).toEqual([]);
  });

  it("action guards use a page the route actually belongs to", () => {
    const wrong: string[] = [];

    for (const handler of MUTATING_HANDLERS) {
      const allowed = pagesForRoute(handler.route);
      for (const m of handler.scope.matchAll(
        /requireAction\(\s*"([A-Za-z]+)"\s*,\s*"([A-Za-z]+)"\s*\)/g
      )) {
        const [, page, action] = m;
        if (!allowed.includes(page as never)) {
          wrong.push(
            `${handler.verb} /api/${handler.route} guards "${page}:${action}" ` +
              `but the route belongs to [${allowed.join(", ")}]`
          );
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  it("names an action that the page's own verb implies", () => {
    // Catches a copy-paste slip such as guarding a DELETE behind "add".
    const mismatched: string[] = [];

    for (const handler of MUTATING_HANDLERS) {
      for (const m of handler.scope.matchAll(
        /requireAction\(\s*"[A-Za-z]+"\s*,\s*"([A-Za-z]+)"\s*\)/g
      )) {
        const action = m[1] as ActionKey;
        if (!isActionKey(action)) continue;
        // "view" is legitimate on a mutating handler that also reads.
        if (action === "view" || action === "assign" || action === "share") continue;

        const verbToAction: Record<string, ActionKey> = {
          POST: "add",
          PUT: "edit",
          PATCH: "edit",
          DELETE: "delete",
        };
        const implied = verbToAction[handler.verb];
        if (!implied) continue;

        // Sub-resource routes legitimately use a different verb mapping.
        if (/(scrap|close|confirm|reject|reset-transactions|statement-token|import)$/.test(handler.route)) {
          continue;
        }

        if (action !== implied) {
          mismatched.push(
            `${handler.verb} /api/${handler.route} is guarded by "${action}" (expected "${implied}")`
          );
        }
      }
    }

    expect(mismatched).toEqual([]);
  });
});
