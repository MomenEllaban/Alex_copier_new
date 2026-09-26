// ═══════════════════════════════════════════════════════════════════════════
// RBAC CATALOG — the single vocabulary shared by the scanner, the seeder, the
// server guards and the permissions matrix UI.
//
// Deliberately free of Prisma / Next imports so `scripts/scan-permissions.ts`
// can run it under plain tsx without booting the app or touching the database.
//
// Two things live here and nowhere else:
//   1. ACTION_KEYS — the canonical action vocabulary, in display order.
//   2. The API-route -> page wiring, so a route's HTTP verb becomes the action
//      the role matrix shows. This is what keeps the matrix honest: it is
//      derived from the routes that actually exist, never hand-listed.
// ═══════════════════════════════════════════════════════════════════════════

import type { Page } from "@/lib/permissions";

/** Canonical action vocabulary. Order here is the order in the matrix UI. */
export const ACTION_KEYS = [
  "view",
  "add",
  "edit",
  "delete",
  "import",
  "export",
  "print",
  "approve",
  "assign",
  "share",
  "close",
  "scrap",
  "reset",
] as const;

export type ActionKey = (typeof ACTION_KEYS)[number];

export function isActionKey(value: string): value is ActionKey {
  return (ACTION_KEYS as readonly string[]).includes(value);
}

export const ACTION_LABELS_AR: Record<ActionKey, string> = {
  view: "عرض",
  add: "إضافة",
  edit: "تعديل",
  delete: "حذف",
  import: "استيراد",
  export: "تصدير",
  print: "طباعة",
  approve: "اعتماد",
  assign: "إسناد",
  share: "مشاركة",
  close: "إقفال",
  scrap: "خدة (Scrap)",
  reset: "تصفير",
};

export const ACTION_LABELS_EN: Record<ActionKey, string> = {
  view: "View",
  add: "Add",
  edit: "Edit",
  delete: "Delete",
  import: "Import",
  export: "Export",
  print: "Print",
  approve: "Approve",
  assign: "Assign",
  share: "Share",
  close: "Close",
  scrap: "Scrap",
  reset: "Reset",
};

export const ACTION_LABELS: Record<"ar" | "en", Record<ActionKey, string>> = {
  ar: ACTION_LABELS_AR,
  en: ACTION_LABELS_EN,
};

// ───────────────────────────────────────────────────────────────────────────
// API route -> page
//
// The first path segment(s) below identify which page a route belongs to.
// Anything not listed here is reported by the scanner as UNMAPPED and fails the
// drift check, so a new route can never silently escape the matrix.
// ───────────────────────────────────────────────────────────────────────────

/** Exact route (no dynamic segment) -> page key. Checked before the prefix map. */
export const EXACT_ROUTE_PAGE: Record<string, Page> = {
  dashboard: "dashboard",
  notifications: "dashboard",
  upload: "customers",
  invoices: "finance",
  "expense-categories": "finance",
  "sales-categories": "sales",
  "sales/intercompany": "sales",
  "returns/purchase-orders": "returns",
  "returns/sales-orders": "returns",
  "investors/distributions": "investors",
  "engineers/linkable-users": "engineers",
  locations: "customers",
  "workshop-daily": "workshopDaily",
  "hr/departments": "hrSettings",
  "hr/job-titles": "hrSettings",
  "hr/attendance": "hrAttendance",
  "hr/employees": "hrEmployees",
  "hr/leaves": "hrLeaves",
  "hr/payroll": "hrPayroll",
};

/** Longest-prefix wins, so `customers/import` resolves before `customers`. */
export const ROUTE_PREFIX_PAGE: Array<[string, Page]> = [
  ["customers", "customers"],
  ["contracts", "contracts"],
  ["companies", "companies"],
  ["machines", "machines"],
  ["engineers", "engineers"],
  ["service-requests", "serviceRequests"],
  ["tests", "copierTests"],
  ["purchases", "purchases"],
  ["suppliers", "suppliers"],
  ["inventory", "inventory"],
  ["warehouses", "warehouses"],
  ["products", "products"],
  ["sales", "sales"],
  ["returns", "returns"],
  ["settlements", "settlements"],
  ["investors", "investors"],
  ["expenses", "finance"],
  ["workshop-daily", "workshopDaily"],
  ["workshop", "workshop"],
  ["reports", "reports"],
  ["users", "settings"],
  ["hr", "hrDashboard"],
];

/** Routes that are intentionally outside the matrix. */
export const IGNORED_ROUTE_PREFIXES = ["auth", "public", "health-check", "dev"];

/**
 * Routes that gate on a page but must not contribute actions to it.
 * `/api/notifications` is checked against the `dashboard` page, so without this
 * the dashboard would grow "add" and "edit" it does not actually have.
 */
export const NO_ACTION_ROUTES = ["notifications", "notifications/[id]"];

/**
 * Pages with no route of their own: they are a view over other pages' data.
 * `trade-ins`, for example, lists `/api/products?tradeIn=true` and writes
 * through `/api/products/[id]`, so it can add and edit but has no delete,
 * print or reset of its own.
 *
 * The actions are therefore stated explicitly rather than inherited — a union
 * would advertise controls the page does not have. `verify` lists the routes
 * that must still exist, so this cannot rot silently.
 */
export const VIRTUAL_PAGE_ACTIONS: Partial<Record<Page, { actions: ActionKey[]; verify: string[] }>> = {
  tradeIns: { actions: ["view", "add", "edit"], verify: ["products", "products/[id]"] },
};

/**
 * Pages a route may legitimately be guarded by, in the order the codebase uses
 * them. A route can have more than one: /api/products is read as "products" but
 * written as "inventory", because the stock movement it records belongs to the
 * inventory page. Returns null when the route is genuinely unmapped.
 */
const ROUTE_ALLOWED_PAGES: Record<string, Page[]> = {
  products: ["products", "inventory"],
  warehouses: ["warehouses", "inventory"],
  "warehouses/[id]": ["warehouses", "inventory"],
  "warehouses/[id]/inventory": ["warehouses", "inventory"],
  "products/price-history": ["products", "inventory"],
  locations: ["customers"],
  "locations/[id]": ["customers"],
  "expense-categories": ["finance"],
  "expense-categories/[id]": ["finance"],
  "sales-categories": ["sales"],
  "sales-categories/[id]": ["sales"],
  "sales/intercompany": ["sales"],
  "sales/intercompany/[id]": ["sales"],
  "returns/purchase-orders": ["returns"],
  "returns/sales-orders": ["returns"],
  "investors/distributions": ["investors"],
  "engineers/linkable-users": ["engineers"],
  "hr/departments": ["hrSettings"],
  "hr/job-titles": ["hrSettings"],
  "hr/attendance": ["hrAttendance"],
  "hr/employees": ["hrEmployees"],
  "hr/leaves": ["hrLeaves"],
  "hr/payroll": ["hrPayroll"],
  notifications: ["dashboard"],
  "notifications/[id]": ["dashboard"],
};

/** Every page a route may be guarded by. Empty means "not in the matrix". */
export function pagesForRoute(route: string): Page[] {
  const exact = ROUTE_ALLOWED_PAGES[route];
  if (exact) return exact;

  // Walk up the dynamic segments until a declared entry matches, so
  // `products/[id]` inherits the `products` allowance.
  const segments = route.split("/");
  for (let i = segments.length - 1; i > 0; i--) {
    const candidate = segments.slice(0, i).join("/");
    const hit = ROUTE_ALLOWED_PAGES[candidate];
    if (hit) return hit;
  }

  return routeToPage(route) ? [routeToPage(route)!] : [];
}

/** Resolve an API route path (no leading slash) to its page key, or null. */
export function routeToPage(route: string): Page | null {
  if (route in EXACT_ROUTE_PAGE) return EXACT_ROUTE_PAGE[route];

  // Both tables act as prefixes, so `expense-categories/[id]` resolves through
  // the exact map's `expense-categories` key. Longest prefix wins, which is why
  // `hr/payroll` beats the generic `hr`.
  const prefixes = [
    ...Object.keys(EXACT_ROUTE_PAGE).map((k) => [k, EXACT_ROUTE_PAGE[k]] as const),
    ...ROUTE_PREFIX_PAGE,
  ];

  // A bare route that is itself a prefix (`contracts`, `sales`).
  const exact = prefixes.find(([prefix]) => prefix === route);
  if (exact) return exact[1];

  const candidates = prefixes
    .filter(([prefix]) => route.startsWith(`${prefix}/`))
    .sort((a, b) => b[0].length - a[0].length);

  return candidates[0]?.[1] ?? null;
}

// ───────────────────────────────────────────────────────────────────────────
// Route + HTTP verb -> action
// ───────────────────────────────────────────────────────────────────────────

/**
 * Sub-resource POSTs that are not plain "add". Keyed by the last meaningful
 * segment so `workshop-daily/[id]/confirm` -> approve, `[id]/reject` -> approve.
 */
const SUB_ACTION_BY_SEGMENT: Record<string, ActionKey> = {
  confirm: "approve",
  reject: "approve",
  close: "close",
  scrap: "scrap",
  "reset-transactions": "reset",
  "statement-token": "share",
};

/** GET routes that are really a side-effecting share-link generator. */
function actionForGet(route: string): ActionKey {
  const segments = route.split("/");
  const last = segments[segments.length - 1] ?? "";
  if (last === "statement-token" || last === "statement") return "share";
  if (last === "report" || last === "statement" || last.includes("export")) return "print";
  if (route === "reports") return "export";
  return "view";
}

function actionForVerb(verb: string, route: string): ActionKey | null {
  const segments = route.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";

  // A trailing sub-resource name wins over the generic verb mapping.
  if (SUB_ACTION_BY_SEGMENT[last]) return SUB_ACTION_BY_SEGMENT[last];

  if (last === "import" || route.endsWith("/import")) return "import";

  switch (verb) {
    case "GET":
      return actionForGet(route);
    case "POST":
      return "add";
    case "PUT":
    case "PATCH":
      return "edit";
    case "DELETE":
      return "delete";
    default:
      return null;
  }
}

/** Every action a single route file implies, in canonical order. */
export function actionsForRoute(route: string, methods: string[]): ActionKey[] {
  const found = new Set<ActionKey>();
  for (const verb of methods) {
    const action = actionForVerb(verb, route);
    if (action) found.add(action);
  }
  // A page that can be read can always be "view"ed, even if the only read is
  // folded into a POST (e.g. workshop-daily/[id]/confirm implies view too).
  if (found.size > 0) found.add("view");
  return ACTION_KEYS.filter((k) => found.has(k));
}

// ───────────────────────────────────────────────────────────────────────────
// Sidebar nav -> page metadata (icon + section), scanned from Sidebar.tsx
// ───────────────────────────────────────────────────────────────────────────

/** `navigation.group.*` i18n key -> the Page.group stored in the DB. */
export const NAV_GROUP_KEYS = [
  "navigation.group.general",
  "navigation.group.salesCustomers",
  "navigation.group.purchasing",
  "navigation.group.maintenance",
  "navigation.group.hr",
  "navigation.group.finance",
  "navigation.group.admin",
] as const;

export type NavGroupKey = (typeof NAV_GROUP_KEYS)[number];
