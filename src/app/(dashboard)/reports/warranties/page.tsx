"use client";

import { useCallback } from "react";
import { useI18n } from "@/i18n/context";
import ReportView, { type ReportColumn, type ReportSummaryCard } from "@/components/reports/ReportView";
import { dateFormatter, numberFormatter } from "@/components/reports/format";

interface Row {
  id: string;
  serialNumber: string;
  machineName: string;
  warrantyEnd: string;
  daysLeft: number;
  isExpiringSoon: boolean;
}

export default function ExpiringWarrantiesPage() {
  const { t, locale } = useI18n();

  const columns = useCallback(
(): ReportColumn<Row>[] => [
      { key: "serialNumber", header: t("reports.serialNumber"), render: (r) => r.serialNumber, exportValue: (r) => r.serialNumber },
      { key: "machineName", header: t("reports.machine"), render: (r) => r.machineName, exportValue: (r) => r.machineName },
      { key: "warrantyEnd", header: t("reports.warrantyEnd"), render: (r) => dateFormatter(r.warrantyEnd, locale), exportValue: (r) => r.warrantyEnd.slice(0, 10) },
      {
        key: "daysLeft",
        header: t("reports.daysLeft"),
        align: "end",
        render: (r) => numberFormatter(r.daysLeft, locale),
        exportValue: (r) => r.daysLeft,
      },
      {
        key: "state",
        header: t("reports.status"),
        render: (r) =>
          r.daysLeft < 0 ? (
            <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700">{t("reports.expired")}</span>
          ) : r.isExpiringSoon ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">{t("reports.expiringSoon")}</span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{t("reports.status")}</span>
          ),
        exportValue: (r) => (r.daysLeft < 0 ? "EXPIRED" : r.isExpiringSoon ? "EXPIRING_SOON" : "OK"),
      },
    ],
    [t, locale],
  );

  const summary = useCallback(
    (rows: Row[]): ReportSummaryCard[] => [
      { label: t("reports.expiringWarranties"), value: numberFormatter(rows.length, locale), accent: "bg-amber-50 text-amber-700" },
      {
        label: t("reports.expired"),
        value: numberFormatter(rows.filter((r) => r.daysLeft < 0).length, locale),
        accent: "bg-rose-50 text-rose-700",
      },
      {
        label: t("reports.expiringSoon"),
        value: numberFormatter(rows.filter((r) => r.daysLeft >= 0 && r.isExpiringSoon).length, locale),
        accent: "bg-blue-50 text-blue-700",
      },
    ],
    [t, locale],
  );

  return (
    <ReportView<Row>
      endpoint="/api/reports/warranties"
      title={t("reports.expiringWarranties")}
      filename="expiring-warranties"
      columns={columns}
      summary={summary}
      dateOf={(r) => r.warrantyEnd}
      refreshDeps={["machines"]}
      searchPlaceholder={`${t("common.search")} ${t("reports.machine")}...`}
      searchFields={(r) => [r.serialNumber, r.machineName]}
    />
  );
}
