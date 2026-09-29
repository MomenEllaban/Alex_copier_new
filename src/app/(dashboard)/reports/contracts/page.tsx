"use client";

import { useCallback } from "react";
import { useI18n } from "@/i18n/context";
import ReportView, { type ReportColumn, type ReportSummaryCard } from "@/components/reports/ReportView";
import { moneyFormatter, numberFormatter, statusClass } from "@/components/reports/format";

interface Row {
  id: string;
  contractNumber: string;
  customer: string;
  contractType: string;
  value: number;
  status: string;
  visitsCount: number;
  estimatedProfit: number;
}

const CONTRACT_TYPES = [
  "MAINTENANCE",
  "MAINTENANCE_ONLY",
  "MAINTENANCE_AND_PARTS",
  "MAINTENANCE_AND_PRINTING",
  "RENTAL",
  "VISIT",
  "ARCHIVE",
  "WARRANTY",
  "CONTRACT_REQUIRED",
  "PENDING",
];

export default function ContractProfitabilityPage() {
  const { t, locale } = useI18n();

  const columns = useCallback(
(): ReportColumn<Row>[] => [
      { key: "contractNumber", header: t("reports.contractNumber"), render: (r) => r.contractNumber, exportValue: (r) => r.contractNumber },
      { key: "customer", header: t("reports.customer"), render: (r) => r.customer, exportValue: (r) => r.customer },
      { key: "contractType", header: t("reports.type"), render: (r) => r.contractType, exportValue: (r) => r.contractType },
      { key: "value", header: t("reports.value"), align: "end", render: (r) => moneyFormatter(r.value, locale), exportValue: (r) => r.value },
      { key: "estimatedProfit", header: t("reports.estimatedProfit"), align: "end", render: (r) => moneyFormatter(r.estimatedProfit, locale), exportValue: (r) => r.estimatedProfit },
      {
        key: "margin",
        header: t("reports.profitMargin"),
        align: "end",
        render: (r) => (r.value > 0 ? `${numberFormatter((r.estimatedProfit / r.value) * 100, locale)}%` : "—"),
        exportValue: (r) => (r.value > 0 ? `${((r.estimatedProfit / r.value) * 100).toFixed(1)}%` : ""),
      },
      { key: "visitsCount", header: t("reports.visitsCount"), align: "end", render: (r) => numberFormatter(r.visitsCount, locale), exportValue: (r) => r.visitsCount },
      {
        key: "status",
        header: t("reports.status"),
        render: (r) => <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(r.status)}`}>{r.status}</span>,
        exportValue: (r) => r.status,
      },
    ],
    [t, locale],
  );

  const summary = useCallback(
    (rows: Row[]): ReportSummaryCard[] => {
      const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
      const totalProfit = rows.reduce((sum, r) => sum + r.estimatedProfit, 0);
      return [
        { label: t("reports.totalContracts"), value: numberFormatter(rows.length, locale), accent: "bg-blue-50 text-blue-700" },
        { label: t("reports.totalContractValue"), value: moneyFormatter(totalValue, locale), accent: "bg-sky-50 text-sky-700" },
        { label: t("reports.estimatedProfit"), value: moneyFormatter(totalProfit, locale), accent: "bg-emerald-50 text-emerald-700" },
        {
          label: t("reports.profitMargin"),
          value: totalValue > 0 ? `${numberFormatter((totalProfit / totalValue) * 100, locale)}%` : "—",
          accent: "bg-violet-50 text-violet-700",
        },
      ];
    },
    [t, locale],
  );

  return (
    <ReportView<Row>
      endpoint="/api/reports/contracts"
      title={t("reports.contractProfitability")}
      filename="contract-profitability"
      columns={columns}
      summary={summary}
      refreshDeps={["contracts"]}
      searchPlaceholder={`${t("common.search")} ${t("reports.contractProfitability")}...`}
      searchFields={(r) => [r.contractNumber, r.customer, r.contractType, r.status]}
      filterOf={(r) => ({ type: r.contractType, status: r.status })}
      filters={[
        {
          key: "type",
          label: t("reports.type"),
          options: CONTRACT_TYPES.map((value) => ({ value, label: value })),
        },
        {
          key: "status",
          label: t("reports.status"),
          options: ["ACTIVE", "EXPIRED", "TERMINATED", "SUSPENDED"].map((value) => ({ value, label: value })),
        },
      ]}
    />
  );
}
