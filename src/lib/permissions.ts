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
    "hrDashboard", "hrEmployees", "hrAttendance", "hrLeaves", "hrPayroll", "hrSettings", "hrReports", "hrSelfService",
  ],

  // مدير الشركة — إدارة شاملة لشركته
  COMPANY_MANAGER: [
    "dashboard", "machines", "customers", "engineers",
    "serviceRequests", "contracts", "purchases", "sales",
    "inventory", "warehouses", "products", "workshop", "finance", "settlements",
    "reports", "suppliers", "returns", "tradeIns", "workshopDaily",
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
    "hrSelfService",
  ],

  // مدير الورشة — الورشة والمخزون وengineers
  WORKSHOP_MANAGER: [
    "dashboard", "workshop", "inventory", "warehouses", "products", "engineers", "machines", "workshopDaily",
    "hrSelfService",
  ],

  // المهندس — طلبات الصيانة المعينة عليه + عملاؤه المسندون إليه فقط
  ENGINEER: [
    "dashboard", "serviceRequests", "customers",
    "hrSelfService",
  ],

  // موظف المبيعات — العملاء والمبيعات والعقود
  SALES_EMPLOYEE: [
    "dashboard", "customers", "sales", "contracts", "machines", "returns", "tradeIns",
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

export function hasPageAccess(role: string | undefined, page: Page): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role as Role];
  if (!permissions) return false;
  return permissions.includes(page);
}
