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
  "navigation.group.purchasing": { ar: "المشتريات والمخزون", en: "Purchasing & Stock" },
  "navigation.group.maintenance": { ar: "الصيانة والورشة", en: "Maintenance & Workshop" },
  "navigation.group.hr": { ar: "الموارد البشرية", en: "Human Resources" },
  "navigation.group.finance": { ar: "المالية", en: "Finance" },
  "navigation.group.admin": { ar: "الإدارة", en: "Administration" },
  "": { ar: "أخرى", en: "Other" },
};

export function pageIcon(name: string | null | undefined): LucideIcon {
  return (name && PAGE_ICONS[name]) || Blocks;
}
