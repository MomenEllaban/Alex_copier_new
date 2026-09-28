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

export const ROLE_PERMISSIONS: Record<Role, Page[]> = {
  // المدير العام — يشوف كل حاجة (ادمن)
  GENERAL_MANAGER: [
    "dashboard", "machines", "customers", "engineers",
    "serviceRequests", "contracts", "purchases", "sales",
    "inventory", "warehouses", "products", "workshop", "finance", "companies",
    "settlements", "reports", "settings", "suppliers", "investors", "returns", "tradeIns", "workshopDaily",
    "copierTests",
    "hrDashboard", "hrEmployees", "hrAttendance", "hrLeaves", "hrPayroll", "hrSettings", "hrReports", "hrSelfService",
  ],

  // مدير الشركة — إدارة شاملة لشركته
  COMPANY_MANAGER: [
    "dashboard", "machines", "customers", "engineers",
    "serviceRequests", "contracts", "purchases", "sales",
    "inventory", "warehouses", "products", "workshop", "finance", "settlements",
    "reports", "suppliers", "returns", "tradeIns", "workshopDaily",
    "copierTests",
    // 1.7: These two were unreachable for a company manager even though the
    // API let every signed-in user read them. Granted so the sidebar and the
    // API now agree.
    "companies", "investors",
    "hrDashboard", "hrEmployees", "hrAttendance", "hrLeaves", "hrPayroll", "hrSettings", "hrReports", "hrSelfService",
  ],

  // المحاسب — المالية والفواتير والتقارير + الرواتب
  ACCOUNTANT: [
    "dashboard", "purchases", "sales", "finance",
    "settlements", "reports", "companies", "returns", "workshopDaily",
    "hrPayroll", "hrReports", "hrSelfService",
  ],

  // مدير الصيانة — طلبات الصيانة والمهندسين والورشة
  MAINTENANCE_MANAGER: [
    "dashboard", "serviceRequests", "engineers",
    "contracts", "workshop", "inventory", "warehouses", "products", "machines",
    "copierTests",
    "hrSelfService",
  ],

  // مدير الورشة — الورشة والمخزون والمهندسون
  WORKSHOP_MANAGER: [
    "dashboard", "workshop", "inventory", "warehouses", "products", "engineers", "machines", "workshopDaily",
    "copierTests",
    "hrSelfService",
  ],

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

  // مدير الموارد البشرية — كل شاشات HR
  HR_MANAGER: [
    "dashboard",
    "hrDashboard", "hrEmployees", "hrAttendance", "hrLeaves", "hrPayroll", "hrSettings", "hrReports", "hrSelfService",
  ],

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
  COMPANY_MANAGER: "إدارة شاملة للشركة، بدون إعدادات النظام الحساسة.",
  ACCOUNTANT: "المحاسبة والفواتير والتقارير المالية.",
  MAINTENANCE_MANAGER: "إدارة الصيانة وطلبات الخدمة والمهندسين.",
  WORKSHOP_MANAGER: "إدارة الورشة والمخزون والفنيين.",
  ENGINEER: "متابعة مهامه وعملائه فقط.",
  SALES_EMPLOYEE: "المبيعات والعملاء والعقود.",
  HR_MANAGER: "إدارة الموارد البشرية.",
  EMPLOYEE: "الخدمة الذاتية فقط.",
};

export const ROLE_DESCRIPTIONS_EN: Record<Role, string> = {
  GENERAL_MANAGER:
    "Full access to every page and action. Protected, and cannot be edited.",
  COMPANY_MANAGER: "Company-wide management, without the sensitive system settings.",
  ACCOUNTANT: "Accounting, invoicing and financial reports.",
  MAINTENANCE_MANAGER: "Manages maintenance, service requests and engineers.",
  WORKSHOP_MANAGER: "Manages the workshop, its stock and its technicians.",
  ENGINEER: "Sees only their own tasks and their own customers.",
  SALES_EMPLOYEE: "Sales, customers and contracts.",
  HR_MANAGER: "Manages human resources.",
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
