"use client";

import { useCallback } from "react";
import { useI18n } from "@/i18n/context";
import ReportView, { type ReportColumn, type ReportSummaryCard } from "@/components/reports/ReportView";
import { numberFormatter, statusClass } from "@/components/reports/format";

interface Row {
  id: string;
  serialNumber: string;
  currentStatus: string;
  product?: { name?: string } | null;
  customerLocation?: { name?: string } | null;
}

const MACHINE_STATUSES = [
  "UNDER_INSPECTION",
  "UNDER_MAINTENANCE",
  "SOLD",
  "RENTED",
  "IN_WAREHOUSE",
  "SCRAPPED",
];

export default function MachineInspectionPage() {
  const { t, locale } = useI18n();

  const columns = useCallback(
(): ReportColumn<Row>[] => [
      { key: "serialNumber", header: t("reports.serialNumber"), render: (r) => r.serialNumber, exportValue: (r) => r.serialNumber },
      { key: "machine", header: t("reports.machine"), render: (r) => r.product?.name ?? "—", exportValue: (r) => r.product?.name ?? "" },
      { key: "customerLocation", header: t("reports.customerLocation"), render: (r) => r.customerLocation?.name ?? "—", exportValue: (r) => r.customerLocation?.name ?? "" },
      {
        key: "currentStatus",
        header: t("reports.currentStatus"),
        render: (r) => <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(r.currentStatus)}`}>{r.currentStatus}</span>,
        exportValue: (r) => r.currentStatus,
      },
    ],
    [t],
  );

  const summary = useCallback(
    (rows: Row[]): ReportSummaryCard[] => [
      { label: t("reports.machinesNeedingInspection"), value: numberFormatter(rows.length, locale), accent: "bg-amber-50 text-amber-700" },
      {
        label: t("reports.currentStatus"),
        value: numberFormatter(rows.filter((r) => r.currentStatus === "UNDER_INSPECTION").length, locale),
        accent: "bg-rose-50 text-rose-700",
      },
      {
        label: t("reports.openRequests"),
        value: numberFormatter(rows.filter((r) => r.currentStatus !== "UNDER_INSPECTION").length, locale),
        accent: "bg-blue-50 text-blue-700",
      },
    ],
    [t, locale],
  );

  return (
    <ReportView<Row>
      endpoint="/api/reports/inspection"
      title={t("reports.machinesNeedingInspection")}
      filename="machines-needing-inspection"
      columns={columns}
      summary={summary}
      refreshDeps={["machines", "service-requests"]}
      searchPlaceholder={`${t("common.search")} ${t("reports.machine")}...`}
      searchFields={(r) => [r.serialNumber, r.product?.name, r.customerLocation?.name, r.currentStatus]}
      filterOf={(r) => ({ status: r.currentStatus })}
      filters={[
        {
          key: "status",
          label: t("reports.currentStatus"),
          options: MACHINE_STATUSES.map((value) => ({ value, label: value })),
        },
      ]}
    />
  );
}
