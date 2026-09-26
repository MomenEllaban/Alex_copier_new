"use client";

import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import UIProvider from "@/components/UIProvider";
import { PermissionsProvider } from "@/components/PermissionsProvider";
import { useI18n } from "@/i18n/context";
import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/": "dashboard.title",
  "/machines": "machines.title",
  "/customers": "customers.title",
  "/engineers": "engineers.title",
  "/service-requests": "serviceRequests.title",
  "/tests": "copierTests.pageTitle",
  "/contracts": "contracts.title",
  "/purchases": "purchases.title",
  "/sales": "sales.title",
  "/returns": "returns.title",
  "/inventory": "inventory.title",
  "/workshop": "workshop.title",
  "/expenses": "finance.title",
  "/settlements": "settlements.title",
  "/reports": "reports.title",
  "/users": "users.title",
  "/settings": "users.title",
  "/settings/roles": "roles.title",
  "/companies": "companies.title",
  "/investors": "investors.title",
  "/suppliers": "suppliers.title",
  "/notifications": "notifications.title",
};

/**
 * Dynamic routes cannot be listed above because their id is only known at
 * runtime. Longest prefix wins, so `/customers/x/tests` matches before the
 * generic `/customers`.
 */
const pageTitlePrefixes: [string, string][] = [
  ["/customers/", "copierTests.title"],
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();

  const prefixTitle = pageTitlePrefixes.find(([prefix]) => pathname.startsWith(prefix))?.[1];
  const titleKey = pageTitles[pathname] || prefixTitle || "dashboard.title";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50" dir="rtl">
      <PermissionsProvider>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col min-h-0">
          <Header title={t(titleKey)} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 lg:p-6">
            <UIProvider>{children}</UIProvider>
          </main>
        </div>
      </PermissionsProvider>
    </div>
  );
}
