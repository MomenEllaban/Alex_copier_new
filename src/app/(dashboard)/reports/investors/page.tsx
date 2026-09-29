"use client";

import { useCallback } from "react";
import { useI18n } from "@/i18n/context";
import ReportView, { type ReportColumn, type ReportSummaryCard } from "@/components/reports/ReportView";
import { dateFormatter, moneyFormatter, numberFormatter } from "@/components/reports/format";

interface Row {
  id: string;
  cycleDate: string;
  totalProfit: number;
  distributions: Array<{ investor: string; ownershipPct: number; amount: number }>;
}

export default function InvestorDistributionPage() {
  const { t, locale } = useI18n();

  const columns = useCallback(
(): ReportColumn<Row>[] => [
      { key: "cycleDate", header: t("reports.cycleDate"), render: (r) => dateFormatter(r.cycleDate, locale), exportValue: (r) => r.cycleDate.slice(0, 10) },
      { key: "totalProfit", header: t("reports.totalProfit"), align: "end", render: (r) => moneyFormatter(r.totalProfit, locale), exportValue: (r) => r.totalProfit },
      {
        key: "investor",
        header: t("reports.investor"),
        render: (r) => (r.distributions.length ? r.distributions.map((d) => d.investor).join("، ") : "—"),
        exportValue: (r) => r.distributions.map((d) => d.investor).join(" | "),
      },
      {
        key: "ownershipPct",
        header: t("reports.ownershipPct"),
        align: "end",
        render: (r) =>
          r.distributions.length
            ? r.distributions.map((d) => `${d.investor} ${numberFormatter(d.ownershipPct, locale)}%`).join("، ")
            : "—",
        exportValue: (r) => r.distributions.map((d) => `${d.investor}:${d.ownershipPct}%`).join(" | "),
      },
      {
        key: "amount",
        header: t("reports.amount"),
        align: "end",
        render: (r) =>
          r.distributions.length
            ? r.distributions.map((d) => `${d.investor}: ${moneyFormatter(d.amount, locale)}`).join(" — ")
            : "—",
        exportValue: (r) => r.distributions.map((d) => `${d.investor}:${d.amount}`).join(" | "),
      },
    ],
    [t, locale],
  );

  const summary = useCallback(
    (rows: Row[]): ReportSummaryCard[] => {
      const totalProfit = rows.reduce((sum, r) => sum + r.totalProfit, 0);
      const distributed = rows.reduce(
        (sum, r) => sum + r.distributions.reduce((inner, d) => inner + d.amount, 0),
        0,
      );
      return [
        { label: t("reports.investorDistribution"), value: numberFormatter(rows.length, locale), accent: "bg-violet-50 text-violet-700" },
        { label: t("reports.totalProfit"), value: moneyFormatter(totalProfit, locale), accent: "bg-emerald-50 text-emerald-700" },
        { label: t("reports.amount"), value: moneyFormatter(distributed, locale), accent: "bg-blue-50 text-blue-700" },
      ];
    },
    [t, locale],
  );

  return (
    <ReportView<Row>
      endpoint="/api/reports/investors"
      title={t("reports.investorDistribution")}
      filename="investor-distribution"
      columns={columns}
      summary={summary}
      dateOf={(r) => r.cycleDate}
      refreshDeps={["investors"]}
      searchPlaceholder={`${t("common.search")} ${t("reports.investor")}...`}
      searchFields={(r) => [r.cycleDate, ...r.distributions.map((d) => d.investor)]}
    />
  );
}
