"use client";

import { useCallback } from "react";
import { useI18n } from "@/i18n/context";
import ReportView, { type ReportColumn, type ReportSummaryCard } from "@/components/reports/ReportView";
import { moneyFormatter, numberFormatter } from "@/components/reports/format";

interface Row {
  id: string;
  name: string;
  user: { id: string; name: string; email: string } | null;
  areas: string[];
  skills: string[];
  baseSalary: number;
  commissionRate: number;
  openCount: number;
  resolvedCount: number;
  visitsCount: number;
  avgRating: number;
}

export default function EngineerPerformancePage() {
  const { t, locale } = useI18n();

  const columns = useCallback(
(): ReportColumn<Row>[] => [
      { key: "name", header: t("reports.engineer"), render: (r) => r.name, exportValue: (r) => r.name },
      {
        key: "user",
        header: t("reports.linkedAccount"),
        render: (r) =>
          r.user ? (
            <span className="text-sm">
              {r.user.name}
              <span className="block text-xs text-slate-500">{r.user.email}</span>
            </span>
          ) : (
            <span className="text-xs text-slate-400">{t("reports.noLinkedAccount")}</span>
          ),
        exportValue: (r) => r.user?.email ?? "",
      },
      {
        key: "areas",
        header: t("reports.areas"),
        render: (r) => (r.areas.length ? r.areas.join("، ") : "—"),
        exportValue: (r) => r.areas.join(" | "),
      },
      {
        key: "skills",
        header: t("reports.skills"),
        render: (r) => (r.skills.length ? r.skills.join("، ") : "—"),
        exportValue: (r) => r.skills.join(" | "),
      },
      { key: "openCount", header: t("reports.openRequests"), align: "end", render: (r) => numberFormatter(r.openCount, locale), exportValue: (r) => r.openCount },
      { key: "resolvedCount", header: t("reports.resolvedRequests"), align: "end", render: (r) => numberFormatter(r.resolvedCount, locale), exportValue: (r) => r.resolvedCount },
      { key: "visitsCount", header: t("reports.visitsCount"), align: "end", render: (r) => numberFormatter(r.visitsCount, locale), exportValue: (r) => r.visitsCount },
      {
        key: "avgRating",
        header: t("reports.avgRating"),
        align: "end",
        render: (r) => (r.avgRating > 0 ? `★ ${numberFormatter(Math.round(r.avgRating * 10) / 10, locale)}` : "—"),
        exportValue: (r) => Math.round(r.avgRating * 10) / 10,
      },
      { key: "baseSalary", header: t("reports.baseSalary"), align: "end", render: (r) => moneyFormatter(r.baseSalary, locale), exportValue: (r) => r.baseSalary },
    ],
    [t, locale],
  );

  const summary = useCallback(
    (rows: Row[]): ReportSummaryCard[] => {
      const open = rows.reduce((sum, r) => sum + r.openCount, 0);
      const resolved = rows.reduce((sum, r) => sum + r.resolvedCount, 0);
      const rated = rows.filter((r) => r.avgRating > 0);
      const avgRating = rated.length ? rated.reduce((sum, r) => sum + r.avgRating, 0) / rated.length : 0;
      return [
        { label: t("reports.totalEngineers"), value: numberFormatter(rows.length, locale), accent: "bg-violet-50 text-violet-700" },
        { label: t("reports.openRequests"), value: numberFormatter(open, locale), accent: "bg-amber-50 text-amber-700" },
        { label: t("reports.resolvedRequests"), value: numberFormatter(resolved, locale), accent: "bg-emerald-50 text-emerald-700" },
        {
          label: t("reports.avgRating"),
          value: avgRating > 0 ? `★ ${numberFormatter(Math.round(avgRating * 10) / 10, locale)}` : "—",
          accent: "bg-blue-50 text-blue-700",
        },
      ];
    },
    [t, locale],
  );

  return (
    <ReportView<Row>
      endpoint="/api/reports/engineers"
      title={t("reports.engineerPerformance")}
      filename="engineer-performance"
      columns={columns}
      summary={summary}
      refreshDeps={["engineers", "service-requests"]}
      searchPlaceholder={`${t("common.search")} ${t("reports.engineer")}...`}
      searchFields={(r) => [r.name, r.user?.name, r.user?.email, ...r.areas, ...r.skills]}
    />
  );
}
