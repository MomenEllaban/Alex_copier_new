"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/context";
import PrinterLoader from "@/components/PrinterLoader";
import RefreshButton from "@/components/RefreshButton";
import ExportButton from "@/components/ExportButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { numberFormatter } from "@/components/reports/format";

interface SatisfactionSummary {
  averageRating: number;
  ratedRequests: number;
  totalRequests: number;
  openRequests: number;
}

const EMPTY: SatisfactionSummary = {
  averageRating: 0,
  ratedRequests: 0,
  totalRequests: 0,
  openRequests: 0,
};

/**
 * Customer satisfaction is a rating average plus three counts, so like the cash
 * report it renders headline cards rather than a paginated table.
 */
export default function CustomerSatisfactionPage() {
  const { t, locale } = useI18n();
  const [summary, setSummary] = useState<SatisfactionSummary>(EMPTY);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/reports/satisfaction");
      if (!res.ok) {
        setSummary(EMPTY);
        return;
      }
      const data = await res.json();
      setSummary({ ...EMPTY, ...(data?.summary ?? {}) });
    } catch {
      setSummary(EMPTY);
    } finally {
      setLoading(false);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchSummary, ["service-requests"]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSummary();
  }, []);

  const cards = [
    { label: t("reports.averageRatings"), value: `★ ${numberFormatter(Math.round(summary.averageRating * 10) / 10, locale)}`, accent: "bg-blue-50 text-blue-700" },
    { label: t("reports.ratedRequests"), value: numberFormatter(summary.ratedRequests, locale), accent: "bg-violet-50 text-violet-700" },
    { label: t("reports.totalRequests"), value: numberFormatter(summary.totalRequests, locale), accent: "bg-slate-50 text-slate-700" },
    { label: t("reports.openRequests"), value: numberFormatter(summary.openRequests, locale), accent: "bg-amber-50 text-amber-700" },
  ];

  const getExport = useCallback(
    () => ({
      headers: [t("reports.title"), t("reports.amount")],
      rows: cards.map((card) => [card.label, String(card.value)]),
    }),
    // `cards` is rebuilt each render from `summary`, so depend on the values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary, t],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">{t("reports.customerSatisfaction")}</h1>
        <div className="flex items-center gap-2">
          <ExportButton filename="customer-satisfaction" getExport={getExport} disabled={loading} />
          <RefreshButton onRefresh={refresh} refreshing={refreshing} />
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <PrinterLoader size="md" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className={`rounded-2xl border border-slate-200 p-4 shadow-sm ${card.accent}`}>
              <div className="text-xs font-medium opacity-80">{card.label}</div>
              <div className="mt-2 text-xl font-bold sm:text-2xl">{card.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
