"use client";

import { useCallback } from "react";
import { useI18n } from "@/i18n/context";
import ReportView, { type ReportColumn, type ReportSummaryCard } from "@/components/reports/ReportView";
import { numberFormatter } from "@/components/reports/format";

interface Row {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  warehouseId: string;
  warehouseName: string;
  companyId: string;
  companyName: string;
  available: number;
  shortage: number;
  shortageValue: number;
}

/**
 * Items whose stock balance is below zero.
 *
 * A deficit is not an error state — it is a real balance the books carry until
 * a purchase covers it — so the page shows the arithmetic (balance, units
 * missing, cost to cover) rather than a red alert that hides the numbers.
 */
export default function NegativeStockReportPage() {
  const { t, locale } = useI18n();

  const columns = useCallback(
    (): ReportColumn<Row>[] => [
      { key: "product", header: t("reports.sparePart"), render: (r) => r.productName, exportValue: (r) => r.productName },
      { key: "sku", header: "SKU", render: (r) => r.sku || "—" },
      { key: "company", header: t("navigation.companies"), render: (r) => r.companyName, exportValue: (r) => r.companyName },
      { key: "warehouse", header: t("inventory.warehouse"), render: (r) => r.warehouseName, exportValue: (r) => r.warehouseName },
      {
        key: "available",
        header: t("reports.negativeStockBalance"),
        align: "end",
        render: (r) => (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 ring-1 ring-rose-300">
            {numberFormatter(r.available, locale)}
          </span>
        ),
        exportValue: (r) => r.available,
      },
      {
        key: "shortage",
        header: t("reports.negativeStockShortage"),
        align: "end",
        render: (r) => numberFormatter(r.shortage, locale),
        exportValue: (r) => r.shortage,
      },
      {
        key: "shortageValue",
        header: t("reports.negativeStockValue"),
        align: "end",
        render: (r) => `${numberFormatter(r.shortageValue, locale)} ج.م`,
        exportValue: (r) => r.shortageValue,
      },
    ],
    [t, locale],
  );

  const summary = useCallback(
    (rows: Row[]): ReportSummaryCard[] => [
      { label: t("reports.negativeStockShortage"), value: numberFormatter(rows.length, locale), accent: "bg-rose-50 text-rose-700" },
      {
        label: t("reports.negativeStockBalance"),
        value: numberFormatter(rows.reduce((sum, r) => sum + r.available, 0), locale),
        accent: "bg-rose-50 text-rose-700",
      },
      {
        label: t("reports.negativeStockValue"),
        value: `${numberFormatter(rows.reduce((sum, r) => sum + r.shortageValue, 0), locale)} ج.م`,
        accent: "bg-amber-50 text-amber-700",
      },
    ],
    [t, locale],
  );

  return (
    <div className="space-y-4">
      <ReportView<Row>
        endpoint="/api/reports/negative-stock"
        title={t("reports.negativeStockReport")}
        filename="negative-stock"
        columns={columns}
        summary={summary}
        refreshDeps={["inventory", "products", "sales", "purchases", "returns"]}
        searchPlaceholder={`${t("common.search")} ${t("reports.sparePart")} / SKU...`}
        searchFields={(r) => [r.productName, r.sku, r.warehouseName, r.companyName]}
      />
      <p className="text-xs leading-6 text-slate-500">{t("reports.negativeStockEmptyHint")}</p>
    </div>
  );
}
