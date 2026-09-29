"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/context";
import PrinterLoader from "@/components/PrinterLoader";
import RefreshButton from "@/components/RefreshButton";
import ExportButton from "@/components/ExportButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { moneyFormatter } from "@/components/reports/format";

interface CashSummary {
  totalCollected: number;
  totalPendingVerification: number;
  totalExpenses: number;
  netCash: number;
}

const EMPTY: CashSummary = {
  totalCollected: 0,
  totalPendingVerification: 0,
  totalExpenses: 0,
  netCash: 0,
};

/**
 * Cash position is four totals, not a list, so it has no table and no
 * pagination — only the headline cards and a CSV of the same figures.
 */
export default function CashPositionPage() {
  const { t, locale } = useI18n();
  const [summary, setSummary] = useState<CashSummary>(EMPTY);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/reports/cash");
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

  const { refresh, refreshing } = useAutoRefresh(fetchSummary, ["settlements", "expenses"]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSummary();
  }, []);

  const cards = [
    { label: t("reports.totalCollected"), value: summary.totalCollected, accent: "bg-emerald-50 text-emerald-700" },
    { label: t("reports.totalPendingVerification"), value: summary.totalPendingVerification, accent: "bg-amber-50 text-amber-700" },
    { label: t("reports.totalExpenses"), value: summary.totalExpenses, accent: "bg-rose-50 text-rose-700" },
    { label: t("reports.netCash"), value: summary.netCash, accent: summary.netCash >= 0 ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-700" },
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
        <h1 className="text-xl font-bold sm:text-2xl">{t("reports.liveCashPosition")}</h1>
        <div className="flex items-center gap-2">
          <ExportButton filename="live-cash-position" getExport={getExport} disabled={loading} />
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
              <div className="mt-2 text-xl font-bold sm:text-2xl">{moneyFormatter(card.value, locale)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
