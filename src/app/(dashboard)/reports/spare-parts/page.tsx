"use client";

import { useCallback } from "react";
import { useI18n } from "@/i18n/context";
import ReportView, { type ReportColumn, type ReportSummaryCard } from "@/components/reports/ReportView";
import { numberFormatter } from "@/components/reports/format";

interface Row {
  id: string;
  name: string;
  compatibleMachines: string[];
}

export default function SparePartsMatrixPage() {
  const { t, locale } = useI18n();

  const columns = useCallback(
(): ReportColumn<Row>[] => [
      { key: "name", header: t("reports.sparePart"), render: (r) => r.name, exportValue: (r) => r.name },
      {
        key: "compatibleMachines",
        header: t("reports.compatibleMachines"),
        render: (r) =>
          r.compatibleMachines.length ? (
            <span className="flex flex-wrap gap-1">
              {r.compatibleMachines.map((machine) => (
                <span key={machine} className="rounded-full bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">
                  {machine}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-xs text-slate-400">{t("reports.noCompatibility")}</span>
          ),
        exportValue: (r) => r.compatibleMachines.join(" | "),
      },
      {
        key: "count",
        header: t("reports.compatibleMachines"),
        align: "end",
        render: (r) => numberFormatter(r.compatibleMachines.length, locale),
        exportValue: (r) => r.compatibleMachines.length,
      },
    ],
    [t, locale],
  );

  const summary = useCallback(
    (rows: Row[]): ReportSummaryCard[] => [
      { label: t("reports.sparePart"), value: numberFormatter(rows.length, locale), accent: "bg-blue-50 text-blue-700" },
      {
        label: t("reports.compatibleMachines"),
        value: numberFormatter(rows.filter((r) => r.compatibleMachines.length > 0).length, locale),
        accent: "bg-emerald-50 text-emerald-700",
      },
      {
        label: t("reports.noCompatibility"),
        value: numberFormatter(rows.filter((r) => r.compatibleMachines.length === 0).length, locale),
        accent: "bg-amber-50 text-amber-700",
      },
    ],
    [t, locale],
  );

  return (
    <ReportView<Row>
      endpoint="/api/reports/spare-parts"
      title={t("reports.sparePartsMatrix")}
      filename="spare-parts-matrix"
      columns={columns}
      summary={summary}
      refreshDeps={["products"]}
      searchPlaceholder={`${t("common.search")} ${t("reports.sparePart")}...`}
      searchFields={(r) => [r.name, ...r.compatibleMachines]}
      filterOf={(r) => ({ hasCompat: r.compatibleMachines.length > 0 ? "yes" : "no" })}
      filters={[
        {
          key: "hasCompat",
          label: t("reports.compatibleMachines"),
          options: [
            { value: "yes", label: t("reports.compatibilityMatrix") },
            { value: "no", label: t("reports.noCompatibility") },
          ],
        },
      ]}
    />
  );
}
