export type Role =
  | "GENERAL_MANAGER"
  | "COMPANY_MANAGER"
  | "ACCOUNTANT"
  | "MAINTENANCE_MANAGER"
  | "WORKSHOP_MANAGER"
  | "ENGINEER"
  | "SALES_EMPLOYEE"
  | "HR_MANAGER"
  | "EMPLOYEE";

export type Page =
  | "dashboard"
  | "machines"
  | "customers"
  | "engineers"
  | "serviceRequests"
  | "contracts"
  | "purchases"
  | "sales"
  | "inventory"
  | "inventorySettings"
  | "warehouses"
  | "products"
  | "workshop"
  | "finance"
  | "companies"
  | "settlements"
  | "reports"
  | "settings"
  | "suppliers"
  | "investors"
  | "returns"
  | "tradeIns"
  | "workshopDaily"
  /** Copier tests (اختبارات العملاء) — recorded by the engineer on site. */
  | "copierTests"
  // HR pages
  | "hrDashboard"
  | "hrEmployees"
  | "hrAttendance"
  | "hrLeaves"
  | "hrPayroll"
  | "hrSettings"
  | "hrReports"
  | "hrSelfService";

/** Every page in the system. Shared by all full-access roles so they cannot drift. */
export const ALL_PAGES: Page[] = [
  "dashboard", "machines", "customers", "engineers",
  "serviceRequests", "contracts", "purchases", "sales",
  "inventory", "inventorySettings", "warehouses", "products", "workshop", "finance", "companies",
  "settlements", "reports", "settings", "suppliers", "investors", "returns", "tradeIns", "workshopDaily",
  "copierTests",
  "hrDashboard", "hrEmployees", "hrAttendance", "hrLeaves", "hrPayroll", "hrSettings", "hrReports", "hrSelfService",
];

/** Roles with every page and every action, enforced even if the matrix says otherwise. */
export const FULL_ACCESS_ROLES: Role[] = [
  "GENERAL_MANAGER",
  "COMPANY_MANAGER",
  "ACCOUNTANT",
  "MAINTENANCE_MANAGER",
  "WORKSHOP_MANAGER",
  "HR_MANAGER",
];

export function isFullAccessRole(role: string | null | undefined): boolean {
  return !!role && (FULL_ACCESS_ROLES as string[]).includes(role);
}

export const ROLE_PERMISSIONS: Record<Role, Page[]> = {
  GENERAL_MANAGER: ALL_PAGES,
  COMPANY_MANAGER: ALL_PAGES,
  ACCOUNTANT: ALL_PAGES,
  MAINTENANCE_MANAGER: ALL_PAGES,
  WORKSHOP_MANAGER: ALL_PAGES,

  // المهندس — طلبات الصيانة المعينة عليه + عملاؤه المسندون إليه فقط
  ENGINEER: [
    "dashboard", "serviceRequests", "customers",
    // 1.7: needed for their own statement/sales. Those two routes are also
    // self-scoped, so this does not expose another engineer's earnings.
    "engineers",
    "copierTests",
    "hrSelfService",
  ],

  // موظف المبيعات — العملاء والمبيعات والعقود
  SALES_EMPLOYEE: [
    "dashboard", "customers", "sales", "contracts", "machines", "returns", "tradeIns",
    "copierTests",
    "hrSelfService",
  ],

  HR_MANAGER: ALL_PAGES,

  // موظف — الخدمة الذاتية فقط
  EMPLOYEE: [
    "dashboard",
    "hrSelfService",
  ],
};

export const ROLES = Object.keys(ROLE_PERMISSIONS) as Role[];

export const ROLE_LABELS_AR: Record<Role, string> = {
  GENERAL_MANAGER: "المدير العام",
  COMPANY_MANAGER: "مدير الشركة",
  ACCOUNTANT: "المحاسب",
  MAINTENANCE_MANAGER: "مدير الصيانة",
  WORKSHOP_MANAGER: "مدير الورشة",
  ENGINEER: "مهندس",
  SALES_EMPLOYEE: "موظف مبيعات",
  HR_MANAGER: "مدير الموارد البشرية",
  EMPLOYEE: "موظف",
};

/**
 * `Role.name` in the database is the Arabic label above, so the roles screens
 * showed Arabic role names to English users. This is the English side.
 */
export const ROLE_LABELS_EN: Record<Role, string> = {
  GENERAL_MANAGER: "General Manager",
  COMPANY_MANAGER: "Company Manager",
  ACCOUNTANT: "Accountant",
  MAINTENANCE_MANAGER: "Maintenance Manager",
  WORKSHOP_MANAGER: "Workshop Manager",
  ENGINEER: "Engineer",
  SALES_EMPLOYEE: "Sales Employee",
  HR_MANAGER: "HR Manager",
  EMPLOYEE: "Employee",
};

export const ROLE_LABELS: Record<"ar" | "en", Record<Role, string>> = {
  ar: ROLE_LABELS_AR,
  en: ROLE_LABELS_EN,
};

/**
 * Display name for a role, in the reader's language.
 *
 * Built-in roles come from the maps above. A role an admin created is not in
 * them, so its own stored name is used — that is the name the admin typed.
 */
export function roleLabel(
  roleKey: string,
  locale: "ar" | "en",
  storedName?: string | null,
): string {
  return ROLE_LABELS[locale][roleKey as Role] ?? storedName?.trim() ?? roleKey;
}

/**
 * Same problem as the names, one level down: `Role.description` for the built-in
 * roles is written in Arabic in the seed, so the English roles screen rendered
 * Arabic paragraphs. The Arabic text is kept identical to the seed values so the
 * two locales stay in step.
 */
export const ROLE_DESCRIPTIONS_AR: Record<Role, string> = {
  GENERAL_MANAGER: "صلاحية كاملة على كل الصفحات والإجراءات. محمي ولا يمكن تعديله.",
  COMPANY_MANAGER: "صلاحية كاملة على كل الصفحات والإجراءات.",
  ACCOUNTANT: "صلاحية كاملة على كل الصفحات والإجراءات.",
  MAINTENANCE_MANAGER: "صلاحية كاملة على كل الصفحات والإجراءات.",
  WORKSHOP_MANAGER: "صلاحية كاملة على كل الصفحات والإجراءات.",
  ENGINEER: "متابعة مهامه وعملائه فقط.",
  SALES_EMPLOYEE: "المبيعات والعملاء والعقود.",
  HR_MANAGER: "صلاحية كاملة على كل الصفحات والإجراءات.",
  EMPLOYEE: "الخدمة الذاتية فقط.",
};

export const ROLE_DESCRIPTIONS_EN: Record<Role, string> = {
  GENERAL_MANAGER:
    "Full access to every page and action. Protected, and cannot be edited.",
  COMPANY_MANAGER: "Full access to every page and action.",
  ACCOUNTANT: "Full access to every page and action.",
  MAINTENANCE_MANAGER: "Full access to every page and action.",
  WORKSHOP_MANAGER: "Full access to every page and action.",
  ENGINEER: "Sees only their own tasks and their own customers.",
  SALES_EMPLOYEE: "Sales, customers and contracts.",
  HR_MANAGER: "Full access to every page and action.",
  EMPLOYEE: "Self-service only.",
};

export const ROLE_DESCRIPTIONS: Record<"ar" | "en", Record<Role, string>> = {
  ar: ROLE_DESCRIPTIONS_AR,
  en: ROLE_DESCRIPTIONS_EN,
};

/**
 * Display description for a role, in the reader's language. Custom roles have no
 * entry here, so the text the admin typed is shown as-is.
 */
export function roleDescription(
  roleKey: string,
  locale: "ar" | "en",
  storedDescription?: string | null,
): string | null {
  const known = ROLE_DESCRIPTIONS[locale][roleKey as Role];
  if (known) return known;
  const stored = storedDescription?.trim();
  return stored ? stored : null;
}

/**
 * Static-table lookup, used only as the pre-RBAC fallback for a user row with
 * no roleId (see getFallbackPermissions in permissions-server.ts).
 *
 * Do NOT use this for authorisation. The database is the source of truth: a
 * permission removed in the matrix must stop being granted immediately, and this
 * table cannot reflect that. Use requirePageAccess / requireAction on the server
 * and usePermissions().can / .canAct in the client.
 */
export function hasPageAccess(role: string | undefined, page: Page): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role as Role];
  if (!permissions) return false;
  return permissions.includes(page);
}
