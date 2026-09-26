// ═══════════════════════════════════════════════════════════════════════════
// PERMISSION SCANNER — scans the real app and syncs Page/Action rows to the DB.
//
//   npm run rbac:scan          report only, write nothing
//   npm run rbac:sync          scan + upsert into the database
//
// What it reads (nothing is hand-listed):
//   • src/components/Sidebar.tsx   -> which pages exist, their href, icon,
//                                     sidebar section and display order
//   • src/lib/permissions.ts       -> the `Page` union (the code's own
//                                     vocabulary, so a page that is guarded but
//                                     has no sidebar entry is still registered)
//   • src/app/api/**\/route.ts     -> which HTTP verbs exist per route, which
//                                     is what turns into the action list
//
// Drift is an error, not a warning: a route whose page cannot be resolved fails
// the run, so a new endpoint can never quietly escape the permissions matrix.
// ═══════════════════════════════════════════════════════════════════════════

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ACTION_KEYS,
  IGNORED_ROUTE_PREFIXES,
  NO_ACTION_ROUTES,
  VIRTUAL_PAGE_ACTIONS,
  actionsForRoute,
  routeToPage,
  type ActionKey,
} from "../src/lib/rbac-catalog";
import { ROLE_LABELS_AR, type Page } from "../src/lib/permissions";
import { PAGE_ICON_NAMES } from "../src/components/roles/page-icons";

const ROOT = path.join(__dirname, "..");
const API_DIR = path.join(ROOT, "src", "app", "api");
const SIDEBAR = path.join(ROOT, "src", "components", "Sidebar.tsx");
const PERMISSIONS = path.join(ROOT, "src", "lib", "permissions.ts");
const I18N_AR = path.join(ROOT, "src", "i18n", "ar.json");

const WRITE = process.argv.includes("--write");

export interface ScannedPage {
  key: Page;
  name: string;
  icon: string | null;
  group: string | null;
  sortOrder: number;
  actions: ActionKey[];
  /** True when the page has no sidebar entry and no API route of its own. */
  declaredOnly: boolean;
}

export interface ScanResult {
  pages: ScannedPage[];
  /** API routes present in the code but not attributable to any page. */
  unmappedRoutes: string[];
  /** Pages in the `Page` union with neither a nav entry nor a route. */
  unroutedPages: Page[];
  routesScanned: number;
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

function dig(obj: Record<string, unknown>, pathExpr: string): string | null {
  let cur: unknown = obj;
  for (const key of pathExpr.split(".")) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" ? cur : null;
}

// ── 1. Pages from the Sidebar ──────────────────────────────────────────────

interface NavEntry {
  page: Page;
  navKey: string;
  href: string;
  icon: string | null;
  group: string | null;
}

function scanSidebar(): NavEntry[] {
  const src = fs.readFileSync(SIDEBAR, "utf8");
  const entries: NavEntry[] = [];
  let group: string | null = null;

  // Walk the file so each nav item inherits the group declared above it.
  const lineRe =
    /key:\s*"(navigation\.group\.[A-Za-z]+)"|\{\s*key:\s*"(navigation\.[A-Za-z]+)"\s*,\s*href:\s*"([^"]+)"\s*,\s*icon:\s*([A-Za-z0-9_]+)(?:\s*,\s*page:\s*"([A-Za-z]+)")?/g;

  for (const m of src.matchAll(lineRe)) {
    if (m[1]) {
      group = m[1];
      continue;
    }
    const page = m[5];
    if (!page) continue; // e.g. /notifications — not a gated page
    entries.push({
      page: page as Page,
      navKey: m[2],
      href: m[3],
      icon: m[4],
      group,
    });
  }
  return entries;
}

// ── 2. The `Page` union declared in code ───────────────────────────────────

function scanPageUnion(): Page[] {
  const src = fs.readFileSync(PERMISSIONS, "utf8");
  const block = src.match(/export type Page\s*=\s*([\s\S]*?);/);
  if (!block) throw new Error("Could not find `export type Page` in src/lib/permissions.ts");
  return [...block[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1] as Page);
}

// ── 3. API routes -> verbs ────────────────────────────────────────────────

interface ScannedRoute {
  route: string;
  methods: string[];
}

function listRouteFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listRouteFiles(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

export function scanRoutes(): ScannedRoute[] {
  const verbs = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  return listRouteFiles(API_DIR)
    .map((file) => {
      const src = fs.readFileSync(file, "utf8");
      const route = path
        .relative(API_DIR, file)
        .replace(/\\/g, "/")
        .replace(/\/route\.ts$/, "");
      return {
        route,
        methods: verbs.filter((v) => new RegExp(`export\\s+async\\s+function\\s+${v}\\b`).test(src)),
      };
    })
    .filter((r) => r.methods.length > 0)
    .sort((a, b) => a.route.localeCompare(b.route));
}

// ── 4. Combine ────────────────────────────────────────────────────────────

export function scan(): ScanResult {
  const nav = scanSidebar();
  const declared = scanPageUnion();
  const routes = scanRoutes();
  const ar = readJson(I18N_AR);

  const actionsByPage = new Map<Page, Set<ActionKey>>();
  const unmappedRoutes: string[] = [];
  const knownRoutes = new Set(routes.map((r) => r.route));

  for (const { route, methods } of routes) {
    if (IGNORED_ROUTE_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`))) continue;

    // Gates on a page, but is not a capability of it.
    if (NO_ACTION_ROUTES.includes(route)) continue;

    const page = routeToPage(route);
    if (!page) {
      unmappedRoutes.push(route);
      continue;
    }
    let set = actionsByPage.get(page);
    if (!set) {
      set = new Set<ActionKey>();
      actionsByPage.set(page, set);
    }
    for (const action of actionsForRoute(route, methods)) set.add(action);
  }

  // Virtual pages state their own actions, but only if the routes they are
  // built on are still there.
  for (const [page, spec] of Object.entries(VIRTUAL_PAGE_ACTIONS)) {
    for (const needed of spec.verify) {
      if (!knownRoutes.has(needed)) {
        unmappedRoutes.push(`${needed} (declared as a source of the "${page}" page)`);
      }
    }
    if (spec.verify.every((needed) => knownRoutes.has(needed))) {
      actionsByPage.set(page as Page, new Set<ActionKey>(spec.actions));
    }
  }

  const navByPage = new Map(nav.map((n) => [n.page, n]));
  const ordered: Page[] = [
    ...nav.map((n) => n.page),
    ...declared.filter((p) => !navByPage.has(p)),
  ];

  const pages: ScannedPage[] = ordered.map((key, index) => {
    const entry = navByPage.get(key);
    const actions = actionsByPage.get(key) ?? new Set<ActionKey>(["view"]);
    return {
      key,
      name: (entry && dig(ar, entry.navKey)) || key,
      icon: entry?.icon ?? null,
      group: entry?.group ?? null,
      sortOrder: entry ? index * 10 : 900 + index,
      actions: ACTION_KEYS.filter((a) => actions.has(a)),
      declaredOnly: !entry && !actionsByPage.has(key),
    };
  });

  return {
    pages,
    unmappedRoutes,
    unroutedPages: pages.filter((p) => p.declaredOnly).map((p) => p.key),
    routesScanned: routes.length,
  };
}

// ── 5. Persist ────────────────────────────────────────────────────────────

async function sync(result: ScanResult) {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const liveKeys = result.pages.map((p) => p.key);

    for (const page of result.pages) {
      const row = await prisma.page.upsert({
        where: { key: page.key },
        create: {
          key: page.key,
          name: page.name,
          icon: page.icon,
          group: page.group,
          sortOrder: page.sortOrder,
          isActive: true,
        },
        update: {
          name: page.name,
          icon: page.icon,
          group: page.group,
          sortOrder: page.sortOrder,
          isActive: true,
        },
      });

      for (const [index, key] of page.actions.entries()) {
        const action = key as ActionKey;
        await prisma.action.upsert({
          where: { pageId_key: { pageId: row.id, key: action } },
          create: { pageId: row.id, key: action, sortOrder: index * 10, isActive: true },
          update: { sortOrder: index * 10, isActive: true },
        });
      }
      // Retire actions the code no longer exposes, keeping the history rows.
      await prisma.action.updateMany({
        where: { pageId: row.id, isActive: true, key: { notIn: page.actions as string[] } },
        data: { isActive: false },
      });
    }

    // Pages that vanished from the code stay for history but drop out of the UI.
    await prisma.page.updateMany({
      where: { isActive: true, key: { notIn: liveKeys } },
      data: { isActive: false },
    });

    const pages = await prisma.page.count({ where: { isActive: true } });
    const actions = await prisma.action.count({ where: { isActive: true } });
    console.log(`Synced ${result.pages.length} pages, ${actions} active actions (${pages} active pages in DB).`);
  } finally {
    await prisma.$disconnect();
  }
}

// ── 6. Report ─────────────────────────────────────────────────────────────

function report(result: ScanResult) {
  console.log(`\nScanned ${result.routesScanned} API routes.`);
  console.log(`Pages: ${result.pages.length}\n`);

  let group = "";
  for (const page of result.pages) {
    const g = page.group ?? "(no sidebar group)";
    if (g !== group) {
      group = g;
      console.log(`\n  ${g}`);
    }
    const icon = page.icon ? `${page.icon}` : "—";
    const flag = page.declaredOnly ? "  [declared in code, not routed]" : "";
    console.log(
      `    ${page.key.padEnd(18)} ${icon.padEnd(18)} ${page.actions.join(", ")}${flag}`
    );
  }

  if (result.unroutedPages.length > 0) {
    console.log(`\nDeclared but not routed (kept with a single "view" action):`);
    console.log(`  ${result.unroutedPages.join(", ")}`);
  }

  if (result.unmappedRoutes.length > 0) {
    console.error(`\nDRIFT — these API routes could not be mapped to a page:`);
    for (const route of result.unmappedRoutes) console.error(`  /api/${route}`);
    console.error(`\nAdd them to EXACT_ROUTE_PAGE or ROUTE_PREFIX_PAGE in src/lib/rbac-catalog.ts.`);
    process.exitCode = 1;
  }

  // An icon name with no matching component renders as a blank square in the
  // matrix, so treat it as drift rather than storing something unrenderable.
  const unknownIcons = result.pages
    .map((p) => p.icon)
    .filter((icon): icon is string => Boolean(icon) && !PAGE_ICON_NAMES.includes(icon as string));
  if (unknownIcons.length > 0) {
    console.error(`\nDRIFT — these icon names have no component in src/components/roles/page-icons.ts:`);
    for (const icon of new Set(unknownIcons)) console.error(`  ${icon}`);
    process.exitCode = 1;
  }
}

async function main() {
  const result = scan();
  report(result);
  if (process.exitCode === 1) return;
  if (WRITE) await sync(result);
  else console.log(`\nDry run. Re-run with --write to sync the database.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
