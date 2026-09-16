export type Role =
  | "GENERAL_MANAGER"
  | "COMPANY_MANAGER"
  | "ACCOUNTANT"
  | "MAINTENANCE_MANAGER"
  | "WORKSHOP_MANAGER"
  | "ENGINEER"
  | "SALES_EMPLOYEE";

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
  | "tradeIns";

export const ROLE_PERMISSIONS: Record<Role, Page[]> = {
  // المدير العام — يشوف كل حاجة (ادمن)
  GENERAL_MANAGER: [
    "dashboard", "machines", "customers", "engineers",
    "serviceRequests", "contracts", "purchases", "sales",
    "inventory", "warehouses", "products", "workshop", "finance", "companies",
    "settlements", "reports", "settings", "suppliers", "investors", "returns", "tradeIns",
  ],

  // مدير الشركة — إدارة شاملة لشركته
  COMPANY_MANAGER: [
    "dashboard", "machines", "customers", "engineers",
    "serviceRequests", "contracts", "purchases", "sales",
    "inventory", "warehouses", "products", "workshop", "finance", "settlements",
    "reports", "suppliers", "returns", "tradeIns",
  ],

  // المحاسب — المالية والفواتير والتقارير
  ACCOUNTANT: [
    "dashboard", "purchases", "sales", "finance",
    "settlements", "reports", "companies", "returns",
  ],

  // مدير الصيانة — طلبات الصيانة والمهندسين والورشة
  MAINTENANCE_MANAGER: [
    "dashboard", "serviceRequests", "engineers",
    "contracts", "workshop", "inventory", "warehouses", "products", "machines",
  ],

  // مدير الورشة — الورشة والمخزون وengineers
  WORKSHOP_MANAGER: [
    "dashboard", "workshop", "inventory", "warehouses", "products", "engineers", "machines",
  ],

  // المهندس — طلبات الصيانة المعينة عليه + عملاؤه المسندون إليه فقط
  ENGINEER: [
    "dashboard", "serviceRequests", "customers",
  ],

  // موظف المبيعات — العملاء والمبيعات والعقود
  SALES_EMPLOYEE: [
    "dashboard", "customers", "sales", "contracts", "machines", "returns", "tradeIns",
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
};

export function hasPageAccess(role: string | undefined, page: Page): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role as Role];
  if (!permissions) return false;
  return permissions.includes(page);
}
