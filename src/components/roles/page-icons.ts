import {
  AlertTriangle,
  BarChart3,
  Bell,
  Blocks,
  Boxes,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Cog,
  DollarSign,
  FileText,
  LayoutDashboard,
  Package,
  PieChart,
  Printer,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Page } from "@/lib/permissions";

/**
 * The icon names the scanner may record in Page.icon.
 *
 * It reads those names out of Sidebar.tsx, so this map is what turns a stored
 * string back into a component. scan-permissions.ts imports the key set and
 * fails on an unknown name, which keeps a renamed icon from silently rendering
 * as a blank square in the matrix.
 */
export const PAGE_ICONS: Record<string, LucideIcon> = {
  AlertTriangle,
  BarChart3,
  Bell,
  Blocks,
  Boxes,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Cog,
  DollarSign,
  FileText,
  LayoutDashboard,
  Package,
  PieChart,
  Printer,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
  Wallet,
  Warehouse,
  Wrench,
};

export const PAGE_ICON_NAMES = Object.keys(PAGE_ICONS);

/** Sidebar section order, matching navigation.group.* in the i18n files. */
export const GROUP_LABELS: Record<string, { ar: string; en: string }> = {
  "navigation.group.general": { ar: "عام", en: "General" },
  "navigation.group.salesCustomers": { ar: "المبيعات والعملاء", en: "Sales & Customers" },
  "navigation.group.purchasing": { ar: "المشتريات والمخزون", en: "Purchases & Stock" },
  "navigation.group.maintenance": { ar: "الصيانة", en: "Maintenance & Workshop" },
  "navigation.group.hr": { ar: "الموارد البشرية", en: "Human Resources" },
  "navigation.group.finance": { ar: "المالية", en: "Finance" },
  "navigation.group.admin": { ar: "التقارير والإدارة", en: "Administration" },
  "": { ar: "أخرى", en: "Other" },
};

/**
 * Page key -> i18n key for its display name.
 *
 * The `Page.name` column is written by the scanner from the **Arabic** label
 * (`dig(ar, navKey)`), so it is Arabic in every locale. Rendering it in the
 * matrix showed Arabic page names to English users, and fell back to the raw
 * camelCase key for the two pages that have no sidebar entry at all
 * (`hrReports`, `hrSelfService`) — neither Arabic nor English.
 *
 * Labelling from the i18n files instead fixes both, and means a page renamed in
 * the UI is renamed here too. Typed as `Record<Page, string>` so TypeScript
 * fails the build if a new page is added without a label.
 */
export const PAGE_NAV_KEYS: Record<Page, string> = {
  dashboard: "navigation.dashboard",
  machines: "navigation.machines",
  customers: "navigation.customers",
  engineers: "navigation.engineers",
  serviceRequests: "navigation.serviceRequests",
  contracts: "navigation.contracts",
  purchases: "navigation.purchases",
  sales: "navigation.sales",
  inventory: "navigation.inventory",
  warehouses: "navigation.warehouses",
  products: "navigation.products",
  workshop: "navigation.workshop",
  finance: "navigation.expenses",
  companies: "navigation.companies",
  settlements: "navigation.settlements",
  reports: "navigation.reports",
  settings: "navigation.settings",
  suppliers: "navigation.suppliers",
  investors: "navigation.investors",
  returns: "navigation.returns",
  tradeIns: "navigation.tradeIns",
  workshopDaily: "navigation.workshopDaily",
  copierTests: "navigation.copierTests",
  hrDashboard: "navigation.hrDashboard",
  hrEmployees: "navigation.hrEmployees",
  hrAttendance: "navigation.hrAttendance",
  hrLeaves: "navigation.hrLeaves",
  hrPayroll: "navigation.hrPayroll",
  hrSettings: "navigation.hrDepartments",
  hrReports: "navigation.hrReports",
  hrSelfService: "navigation.hrSelfService",
};

/** I18n key for a page's label, or `undefined` for a key not in the catalogue. */
export function pageLabelKey(pageKey: string): string | undefined {
  return PAGE_NAV_KEYS[pageKey as Page];
}


export function pageIcon(name: string | null | undefined): LucideIcon {
  return (name && PAGE_ICONS[name]) || Blocks;
}
