"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer } from "lucide-react";
import PrinterLoader from "@/components/PrinterLoader";
import { useI18n } from "@/i18n/context";

type RowType = "SALE" | "PAYMENT" | "RETURN" | "SETTLEMENT" | "TRADE_IN";

interface StatementRow {
  id: string;
  type: RowType;
  date: string;
  ref: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balance: number;
}

interface Statement {
  customerId: string;
  customerName: string;
  phone: string | null;
  rows: StatementRow[];
  openingBalance: number;
  totalBilled: number;
  totalPaid: number;
  creditBalance: number;
  closingBalance: number;
}

const TYPE_BADGES: Record<RowType, string> = {
  SALE: "bg-blue-100 text-blue-700",
  PAYMENT: "bg-green-100 text-green-700",
  RETURN: "bg-amber-100 text-amber-700",
  SETTLEMENT: "bg-purple-100 text-purple-700",
  TRADE_IN: "bg-sky-100 text-sky-700",
};

export default function StatementPage({ params }: { params: Promise<{ token: string }> }) {
  const { t, locale, dir } = useI18n();
  const [data, setData] = useState<Statement | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    let token: string | null = null;

    const fetchStatement = () => {
      if (!token) return;
      fetch(`/api/public/statement/${encodeURIComponent(token)}`)
        .then((res) => {
          if (!res.ok) throw new Error("not found");
          return res.json();
        })
        .then((json) => {
          if (cancelled) return;
          setData(json as Statement);
          setLastUpdated(new Date());
          setStatus("loaded");
        })
        .catch(() => {
          if (!cancelled) setStatus((prev) => (prev === "loaded" ? prev : "error"));
        });
    };

    params.then((p) => {
      if (cancelled) return;
      token = p.token;
      fetchStatement();
    });

    // Auto-refresh: the report stays live so confirmed payments, settlements,
    // and new invoices show up without a manual reload.
    const poll = setInterval(fetchStatement, 20000);
    const onFocus = () => fetchStatement();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
  }, [params]);

  const formatDate = useCallback(
    (value: string) => {
      const d = new Date(value);
      return d.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB");
    },
    [locale],
  );

  const formatTime = useCallback(
    (value: string) => {
      const d = new Date(value);
      return d.toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit" });
    },
    [locale],
  );

  const money = useCallback(
    (n: number) => n.toLocaleString(locale === "ar" ? "ar-EG" : "en-GB"),
    [locale],
  );

  const typeLabel = (type: RowType) => {
    switch (type) {
      case "SALE": return t("statement.invoice");
      case "PAYMENT": return t("statement.payment");
      case "RETURN": return t("statement.saleReturn");
      case "TRADE_IN": return t("statement.tradeIn");
      case "SETTLEMENT": return "";
      default: return type;
    }
  };

  const descLabel = (type: RowType, description: string | null) => {
    if (type === "SETTLEMENT") {
      // Settlements encode their direction in the amount sign.
      return description && description.trim() ? description : "";
    }
    return description && description.trim() ? `${typeLabel(type)} — ${description}` : typeLabel(type);
  };

  return (
    <div dir={dir} className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{t("statement.generatedBy")}</span>
            {status === "loaded" && lastUpdated && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                {t("statement.autoRefresh")} · {t("statement.lastUpdate")}: {formatTime(lastUpdated.toISOString())}
              </span>
            )}
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          >
            <Printer size={16} />{t("common.print")}
          </button>
        </div>

        {status === "loading" && (
          <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        )}

        {status === "error" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-bold text-slate-800">{t("statement.notFound")}</p>
            <p className="mt-2 text-sm text-gray-500">{t("statement.notFoundDesc")}</p>
          </div>
        )}

        {status === "loaded" && data && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-gradient-to-l from-sky-50 to-white p-6">
              <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">
                {t("statement.title")}
              </p>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">
                {t("statement.generatedFor")} {data.customerName}
              </h1>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
                {data.phone && <span dir="ltr">{data.phone}</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              <Stat label={t("statement.totalBilled")} value={money(data.totalBilled)} tone="text-blue-700" />
              <Stat label={t("statement.totalPaid")} value={money(data.totalPaid)} tone="text-green-700" />
              {data.closingBalance < 0 ? (
                <Stat label={t("statement.creditBalance")} value={money(data.creditBalance)} tone="text-green-700" />
              ) : (
                <Stat label={t("statement.currentDebt")} value={money(data.closingBalance)} tone={data.closingBalance > 0 ? "text-red-600" : "text-green-600"} />
              )}
              <Stat label={t("statement.lastUpdate")} value={formatDate(new Date().toISOString())} tone="text-gray-700" />
            </div>

            {data.rows.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center border-t border-slate-200">
                <p className="text-sm text-gray-400">{t("statement.noTransactions")}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("statement.date")}</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("statement.description")}</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("statement.debit")}</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("statement.credit")}</th>
                        <th className="px-4 py-3 text-end text-sm font-medium text-gray-500">{t("statement.balance")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {data.openingBalance !== 0 && (
                        <tr className="bg-slate-50">
                          <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">—</td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {t("statement.openingBalance")}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-medium text-blue-700">{data.openingBalance > 0 ? money(data.openingBalance) : "—"}</td>
                          <td className="px-4 py-2.5 font-medium text-green-700">{data.openingBalance < 0 ? money(-data.openingBalance) : "—"}</td>
                          <td className="px-4 py-2.5 text-end font-semibold text-slate-800">{money(data.openingBalance)}</td>
                        </tr>
                      )}
                      {data.rows.map((row) => {
                        const debit = row.debit > 0 ? money(row.debit) : "";
                        const credit = row.credit > 0 ? money(row.credit) : "";
                        return (
                          <tr key={row.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">
                              <div>{formatDate(row.date)}</div>
                              <div className="text-xs text-gray-400">{formatTime(row.date)}</div>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_BADGES[row.type]}`}>
                                {typeLabel(row.type) || (row.debit > 0 ? t("statement.settlementOut") : t("statement.settlementIn"))}
                              </span>
                              <div className="mt-1 text-xs text-gray-500">{descLabel(row.type, row.description)}</div>
                            </td>
                            <td className="px-4 py-2.5 font-medium text-blue-700">{debit || "—"}</td>
                            <td className="px-4 py-2.5 font-medium text-green-700">{credit || "—"}</td>
                            <td className="px-4 py-2.5 text-end font-semibold text-slate-800">{money(row.balance)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-600">{t("statement.closingBalance")}</span>
                  <div className="flex items-center gap-3">
                    {data.closingBalance < 0 && (
                      <span className="text-xs font-semibold text-green-600">
                        <span dir="auto">{t("statement.creditBalance")}</span> — {money(data.creditBalance)}
                      </span>
                    )}
                    <span className={`text-lg font-bold ${data.closingBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                      {money(data.closingBalance)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
    </div>
  );
}
