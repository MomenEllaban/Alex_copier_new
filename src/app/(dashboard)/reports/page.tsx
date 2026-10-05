"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/context";
import PrinterLoader from "@/components/PrinterLoader";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { moneyFormatter, numberFormatter } from "@/components/reports/format";

interface Overview {
  totalContracts: number;
  totalContractValue: number;
  totalEngineers: number;
  totalOpenServiceRequests: number;
  netCash: number;
  expiringWarranties: number;
}

const EMPTY: Overview = {
  totalContracts: 0,
  totalContractValue: 0,
  totalEngineers: 0,
  totalOpenServiceRequests: 0,
  netCash: 0,
  expiringWarranties: 0,
};

const REPORTS = [
  { href: "/reports/contracts", labelKey: "reports.contractProfitability", descKey: "reports.revenueMinusCosts", icon: "💰" },
  { href: "/reports/engineers", labelKey: "reports.engineerPerformance", descKey: "reports.visitResolutionSales", icon: "👷" },
  { href: "/reports/cash", labelKey: "reports.liveCashPosition", descKey: "reports.settlementsUnverified", icon: "💵" },
  { href: "/reports/inspection", labelKey: "reports.machinesNeedingInspection", descKey: "reports.underInspectionCount", icon: "🔍" },
  { href: "/reports/warranties", labelKey: "reports.expiringWarranties", descKey: "reports.warrantyExpiry", icon: "🛡️" },
  { href: "/reports/satisfaction", labelKey: "reports.customerSatisfaction", descKey: "reports.averageRatings", icon: "⭐" },
  { href: "/reports/investors", labelKey: "reports.investorDistribution", descKey: "reports.distributionHistory", icon: "📊" },
  { href: "/reports/spare-parts", labelKey: "reports.sparePartsMatrix", descKey: "reports.compatibilityMatrix", icon: "🔧" },
  { href: "/reports/negative-stock", labelKey: "reports.negativeStockReport", descKey: "reports.negativeStockSubtitle", icon: "📉" },
] as const;

/**
 * Landing page for the reports section.
 *
 * The reports used to be collapsible cards on a single page backed by one
 * endpoint that loaded every table at once. Each report now has its own page
 * and endpoint; this page only carries the headline numbers and the index.
 */
export default function ReportsPage() {
  const { t, locale } = useI18n();
  const [overview, setOverview] = useState<Overview>(EMPTY);
  const [loading, setLoading] = useState(true);

  const fetchOverview = async () => {
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) {
        setOverview(EMPTY);
        return;
      }
      const data = await res.json();
      setOverview({ ...EMPTY, ...(data?.summary ?? {}) });
    } catch {
      setOverview(EMPTY);
    } finally {
      setLoading(false);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchOverview, [
    "contracts",
    "engineers",
    "settlements",
    "expenses",
    "machines",
    "investors",
    "products",
    "service-requests",
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOverview();
  }, []);

  const cards = [
    { label: t("reports.totalContracts"), value: numberFormatter(overview.totalContracts, locale), accent: "bg-blue-50 text-blue-700" },
    { label: t("reports.totalContractValue"), value: moneyFormatter(overview.totalContractValue, locale), accent: "bg-sky-50 text-sky-700" },
    { label: t("reports.totalEngineers"), value: numberFormatter(overview.totalEngineers, locale), accent: "bg-violet-50 text-violet-700" },
    { label: t("reports.netCash"), value: moneyFormatter(overview.netCash, locale), accent: "bg-amber-50 text-amber-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{t("reports.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("reports.browseReports")}</p>
        </div>
        <RefreshButton onRefresh={refresh} refreshing={refreshing} />
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <PrinterLoader size="md" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <div key={card.label} className={`rounded-2xl border border-slate-200 p-4 shadow-sm ${card.accent}`}>
                <div className="text-xs font-medium opacity-80">{card.label}</div>
                <div className="mt-2 text-xl font-bold sm:text-2xl">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {REPORTS.map((report) => (
              <Link
                key={report.href}
                href={report.href}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                <div className="text-2xl">{report.icon}</div>
                <h3 className="mt-2 text-base font-semibold text-slate-800">{t(report.labelKey)}</h3>
                <p className="mt-1 text-sm text-slate-500">{t(report.descKey)}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
