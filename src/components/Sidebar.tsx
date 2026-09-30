"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useI18n } from "@/i18n/context";
import { signOut } from "next-auth/react";
import { usePermissions } from "@/components/PermissionsProvider";
import type { Page } from "@/lib/permissions";
import {
  LayoutDashboard,
  Printer,
  Users,
  Wrench,
  AlertTriangle,
  FileText,
  ShoppingCart,
  DollarSign,
  Package,
  Warehouse,
  Boxes,
  Cog,
  Wallet,
  Receipt,
  BarChart3,
  Building2,
  Truck,
  RotateCcw,
  PieChart,
  Bell,
  LogOut,
  Menu,
  X,
  Calendar,
  UserCheck,
  Briefcase,
  Plus,
  Camera,
  ShieldCheck,
  Search,
  Star,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface NavItem {
  key: string;
  href: string;
  icon: typeof LayoutDashboard;
  page?: Page;
  canAdd?: boolean;
  /** Only the general manager: for screens about the system, not a business page. */
  adminOnly?: boolean;
}

interface NavGroup {
  key: string;
  items: NavItem[];
  /** The header becomes a toggle. Without it the group is always expanded. */
  collapsible?: boolean;
  /** Whether a collapsible group starts open. Defaults to open. */
  defaultOpen?: boolean;
}

const navGroups: NavGroup[] = [
  {
    key: "navigation.group.general",
    items: [
      { key: "navigation.dashboard", href: "/", icon: LayoutDashboard, page: "dashboard" },
      { key: "navigation.notifications", href: "/notifications", icon: Bell },
    ],
  },
  {
    key: "navigation.group.salesCustomers",
    items: [
      { key: "navigation.sales", href: "/sales", icon: DollarSign, page: "sales", canAdd: true },
      { key: "navigation.customers", href: "/customers", icon: Users, page: "customers", canAdd: true },
      { key: "navigation.contracts", href: "/contracts", icon: FileText, page: "contracts", canAdd: true },
      { key: "navigation.returns", href: "/returns", icon: RotateCcw, page: "returns", canAdd: true },
      { key: "navigation.machines", href: "/machines", icon: Printer, page: "machines", canAdd: true },
    ],
  },
  {
    key: "navigation.group.purchasing",
    items: [
      { key: "navigation.purchases", href: "/purchases", icon: ShoppingCart, page: "purchases", canAdd: true },
      { key: "navigation.suppliers", href: "/suppliers", icon: Truck, page: "suppliers", canAdd: true },
      { key: "navigation.inventory", href: "/inventory", icon: Package, page: "inventory" },
      { key: "navigation.warehouses", href: "/warehouses", icon: Warehouse, page: "warehouses", canAdd: true },
      { key: "navigation.products", href: "/products", icon: Boxes, page: "products", canAdd: true },
      { key: "navigation.tradeIns", href: "/trade-ins", icon: RotateCcw, page: "tradeIns" },
    ],
  },
  {
    key: "navigation.group.maintenance",
    items: [
      { key: "navigation.serviceRequests", href: "/service-requests", icon: AlertTriangle, page: "serviceRequests", canAdd: true },
      { key: "navigation.engineers", href: "/engineers", icon: Wrench, page: "engineers", canAdd: true },
      { key: "navigation.copierTests", href: "/tests", icon: Camera, page: "copierTests", canAdd: true },
      { key: "navigation.workshop", href: "/workshop", icon: Cog, page: "workshop" },
      { key: "navigation.workshopDaily", href: "/workshop-daily", icon: Wallet, page: "workshopDaily", canAdd: true },
    ],
  },
  {
    key: "navigation.group.hr",
    items: [
      { key: "navigation.hrDashboard", href: "/hr", icon: Briefcase, page: "hrDashboard" },
      { key: "navigation.hrEmployees", href: "/hr/employees", icon: Users, page: "hrEmployees", canAdd: true },
      { key: "navigation.hrAttendance", href: "/hr/attendance", icon: UserCheck, page: "hrAttendance" },
      { key: "navigation.hrLeaves", href: "/hr/leaves", icon: Calendar, page: "hrLeaves", canAdd: true },
      { key: "navigation.hrPayroll", href: "/hr/payroll", icon: DollarSign, page: "hrPayroll" },
      { key: "navigation.hrDepartments", href: "/hr/departments", icon: Building2, page: "hrSettings" },
    ],
  },
  {
    key: "navigation.group.finance",
    items: [
      { key: "navigation.expenses", href: "/expenses", icon: Wallet, page: "finance", canAdd: true },
      { key: "navigation.settlements", href: "/settlements", icon: Receipt, page: "settlements", canAdd: true },
      { key: "navigation.investors", href: "/investors", icon: PieChart, page: "investors", canAdd: true },
    ],
  },
  {
    key: "navigation.group.reports",
    collapsible: true,
    // Nine links would dominate the sidebar, so this group starts closed and
    // opens on demand.
    defaultOpen: false,
    items: [
      // Each report gets its own icon: the icon rail shows only this group, and
      // nine identical bar-chart icons read as one broken block.
      { key: "navigation.reports", href: "/reports", icon: BarChart3, page: "reports" },
      { key: "navigation.reportContracts", href: "/reports/contracts", icon: Receipt, page: "reports" },
      { key: "navigation.reportEngineers", href: "/reports/engineers", icon: Wrench, page: "reports" },
      { key: "navigation.reportCash", href: "/reports/cash", icon: Wallet, page: "reports" },
      { key: "navigation.reportInspection", href: "/reports/inspection", icon: Search, page: "reports" },
      { key: "navigation.reportWarranties", href: "/reports/warranties", icon: ShieldCheck, page: "reports" },
      { key: "navigation.reportSatisfaction", href: "/reports/satisfaction", icon: Star, page: "reports" },
      { key: "navigation.reportInvestors", href: "/reports/investors", icon: PieChart, page: "reports" },
      { key: "navigation.reportSpareParts", href: "/reports/spare-parts", icon: Package, page: "reports" },
    ],
  },
  {
    key: "navigation.group.admin",
    items: [
      { key: "navigation.companies", href: "/companies", icon: Building2, page: "companies" },
      { key: "navigation.users", href: "/users", icon: Users, page: "settings", canAdd: true },
      // Gated on the role, not on a page permission: the roles screen is about
      // the system itself, and "settings" is also held by a company manager.
      { key: "navigation.roles", href: "/settings/roles", icon: ShieldCheck, adminOnly: true },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  /** Which collapsible groups the user has opened; unset means the group default. */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { can, canAct, ready, roleKey } = usePermissions();
  const isGeneralManager = roleKey === "GENERAL_MANAGER";

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateDesktopState = () => setIsDesktop(mediaQuery.matches);
    updateDesktopState();
    mediaQuery.addEventListener("change", updateDesktopState);
    return () => mediaQuery.removeEventListener("change", updateDesktopState);
  }, []);

  const isCollapsed = isDesktop && collapsed;

  const allNavHrefs = navGroups.flatMap((g) => g.items.map((i) => i.href));

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (pathname === href) return true;
    if (pathname.startsWith(`${href}/`)) {
      const hasMoreSpecific = allNavHrefs.some(
        (otherHref) =>
          otherHref !== href &&
          otherHref.length > href.length &&
          (pathname === otherHref || pathname.startsWith(`${otherHref}/`))
      );
      return !hasMoreSpecific;
    }
    return false;
  };

  /**
   * A group is open unless the user closed it. The icon-only rail has no
   * header to click, so every group stays expanded there.
   *
   * Closing a group works from anywhere, including while one of its pages is
   * open; navigating to a page inside a closed group opens it again (see the
   * route adjustment below).
   */
  const isGroupOpen = (group: NavGroup) => {
    if (isCollapsed || !group.collapsible) return true;
    return openGroups[group.key] ?? group.defaultOpen ?? true;
  };

  const toggleGroup = (key: string) => {
    setOpenGroups((current) => ({ ...current, [key]: !(current[key] ?? false) }));
  };

  // Opening a page whose group the user had closed brings the group back, so
  // the current page is never stranded behind a collapsed header. Adjusting the
  // state during render (rather than in an effect) keeps it in sync with the
  // route without a second render pass.
  const [lastPath, setLastPath] = useState(pathname);  if (pathname !== lastPath) {
    setLastPath(pathname);
    const owner = navGroups.find(
      (group) => group.collapsible && group.items.some((item) => isActive(item.href)),
    );
    if (owner) {
      setOpenGroups((current) =>
        current[owner.key] === false ? { ...current, [owner.key]: true } : current,
      );
    }
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        {!isCollapsed && (
          <div>
            <h1 className="text-white text-[length:var(--text-subtitle)] font-bold">اليكس كوبير</h1>
            <p className="text-gray-400 text-[length:var(--text-caption)]">Alex Copier</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={isCollapsed ? "Open menu" : t("common.close")}
          className="hidden min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white lg:flex"
        >
          {isCollapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          aria-label={t("common.close")}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white lg:hidden"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 sidebar-scroll">
        {navGroups.map((group, groupIndex) => {
          // Hold the nav back until permissions arrive, otherwise the full list
          // flashes on every page load for users who should see far less.
          if (!ready) return null;
          const items = group.items.filter((item) => {
            if (item.adminOnly) return isGeneralManager;
            return !item.page || can(item.page);
          });
          if (items.length === 0) return null;
          const groupOpen = isGroupOpen(group);
          const canToggle = group.collapsible && !isCollapsed;
          // The icon rail has no header to click, so a collapsible group
          // collapses to its own landing page instead of dumping every child
          // into the rail as a run of near-identical icons.
          const visibleItems = isCollapsed && group.collapsible ? items.slice(0, 1) : items;
          return (
            <div
              key={group.key}
              className={
                isCollapsed && groupIndex > 0 ? "mt-3 border-t border-gray-700 pt-3" : isCollapsed ? "" : "mb-4"
              }
            >
              {!isCollapsed && canToggle ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={groupOpen}
                  className="flex w-full items-center justify-between rounded-lg px-6 py-1.5 text-[11px] font-semibold tracking-wide text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300 min-h-11"
                >
                  <span>{t(group.key)}</span>
                  {groupOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              ) : (
                !isCollapsed && (
                  <p className="px-6 mb-1 text-[11px] font-semibold tracking-wide text-gray-500">
                    {t(group.key)}
                  </p>
                )
              )}
              {(!canToggle || groupOpen) &&
                visibleItems.map((item) => {
                  const Icon = item.icon;
                  // The rail shows one entry for a collapsible group, so it has
                  // to light up for every page inside that group — otherwise
                  // the reports icon goes blank while you are reading a report.
                  const active =
                    isActive(item.href) || (isCollapsed && group.collapsible && items.some((i) => isActive(i.href)));
                  return (
                    <div key={item.href} className={`flex items-center ${isCollapsed ? "" : "mx-2"}`}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        title={isCollapsed ? t(item.key) : undefined}
                        className={`flex flex-1 items-center gap-3 rounded-lg transition-colors min-h-11 ${
                          active
                            ? "bg-blue-600 text-white"
                            : "text-gray-300 hover:bg-gray-800 hover:text-white"
                        } ${isCollapsed ? "justify-center px-0" : "px-4 py-2.5"}`}
                      >
                        <Icon size={isCollapsed ? 22 : 20} className="shrink-0" />
                        {!isCollapsed && <span className="text-sm whitespace-nowrap">{t(item.key)}</span>}
                      </Link>
                      {!isCollapsed && item.canAdd && item.page && canAct(item.page, "add") && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMobileOpen(false);
                            router.push(`${item.href}?add=1`);
                          }}
                          title={`إضافة ${t(item.key)}`}
                          className="ms-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-800 hover:text-white"
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-gray-700 p-3">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={isCollapsed ? t("navigation.logout") : undefined}
          className={`flex items-center gap-3 rounded-lg transition-colors text-gray-300 hover:bg-red-600/20 hover:text-red-400 min-h-11 ${
            isCollapsed ? "justify-center mx-0 px-0" : "px-4 py-2.5 mx-2 w-[calc(100%-16px)]"
          }`}
        >
          <LogOut size={isCollapsed ? 22 : 20} className="shrink-0" />
          {!isCollapsed && <span className="text-sm whitespace-nowrap">{t("navigation.logout")}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={mobileOpen}
        className={`fixed end-3 top-3 z-50 flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-gray-900 p-2 text-white shadow-lg transition-opacity lg:hidden ${mobileOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
      >
        <Menu size={24} />
      </button>

      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden ${
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="dashboard-sidebar"
        className={`fixed top-0 end-0 z-50 h-screen w-[min(20rem,86vw)] bg-gray-900 shadow-2xl transition-transform duration-300 ease-out will-change-transform lg:sticky lg:z-40 lg:top-0 lg:h-screen lg:shadow-none lg:transition-all ${
          collapsed ? "lg:w-16" : "lg:w-64"
        } ${mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
