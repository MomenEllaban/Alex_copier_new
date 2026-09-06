"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer } from "lucide-react";
import PrinterLoader from "@/components/PrinterLoader";
import { useI18n } from "@/i18n/context";

type RowType = "SALE" | "SETTLEMENT" | "SERVICE_REQUEST" | "VISIT" | "SALARY";

interface StatementRow {
  id: string;
  type: RowType;
  date: string;
  ref: string | null;
  description: string | null;
  amount: number;
  balance: number;
}

interface Summary {
  totalSales: number;
  salesCount: number;
  totalCollections: number;
  settlementCount: number;
  totalCommission: number;
  totalPlannedSalary: number;
  totalSalaryPaid: number;
  serviceRequestCount: number;
  openRequests: number;
  resolvedRequests: number;
  visitsCount: number;
  resolvedVisits: number;
  custodyItems: number;
}

interface Statement {
  engineerId: string;
  engineerName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  baseSalary: number;
  transportAllowance: number;
  commissionRate: number;
  rows: StatementRow[];
  openingBalance: number;
  closingBalance: number;
  summary: Summary;
  generatedAt: string;
}

const TYPE_BADGES: Record<RowType, string> = {
  SALE: "bg-blue-100 text-blue-700",
  SETTLEMENT: "bg-purple-100 text-purple-700",
  SERVICE_REQUEST: "bg-amber-100 text-amber-700",
  VISIT: "bg-sky-100 text-sky-700",
  SALARY: "bg-rose-100 text-rose-700",
};

export default function EngineerStatementPage({ params }: { params: Promise<{ token: string }> }) {
  const { t, locale, dir } = useI18n();
  const [data, setData] = useState<Statement | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    let token: string | null = null;

    const fetchStatement = () => {
      if (!token) return;
      fetch(`/api/public/engineer-statement/${encodeURIComponent(token)}`)
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

    // Keep the engineer statement live so recent sales, settlements, and salary
    // entries appear without a manual reload.
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
      case "SALE": return t("engineerStatement.invoice");
      case "SETTLEMENT": return "";
      case "SERVICE_REQUEST": return t("engineerStatement.serviceRequest");
      case "VISIT": return t("engineerStatement.visit");
      case "SALARY": return t("engineerStatement.salary");
      default: return type;
    }
  };

  const desc = (row: StatementRow) => {
    if (row.type === "SALARY") {
      return `${t("engineerStatement.salary")} — ${row.ref}`;
    }
    const note = row.description && row.description.trim() ? row.description : "";
    return note;
  };

  return (
    <div dir={dir} className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
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
            <p className="text-lg font-bold text-slate-800">{t("engineerStatement.notFound")}</p>
            <p className="mt-2 text-sm text-gray-500">{t("engineerStatement.notFoundDesc")}</p>
          </div>
        )}

        {status === "loaded" && data && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-gradient-to-l from-sky-50 to-white p-6">
              <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">
                {t("engineerStatement.title")}
              </p>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">
                {t("engineerStatement.subtitle")} — {data.engineerName}
              </h1>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
                {data.phone && <span dir="ltr">{data.phone}</span>}
                {data.email && <span dir="ltr">{data.email}</span>}
                <span className={data.isActive ? "text-green-600" : "text-red-600"}>
                  {t("engineers.title")}: {data.isActive ? t("common.active") : t("common.inactive")}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              <Stat label={t("engineerStatement.totalSales")} value={money(data.summary.totalSales)} tone="text-blue-700" sub={t("engineerStatement.salesCount") + `: ${money(data.summary.salesCount)}`} />
              <Stat label={t("engineerStatement.totalCollections")} value={money(data.summary.totalCollections)} tone="text-green-700" sub={t("engineerStatement.settlementCount") + `: ${data.summary.settlementCount}`} />
              <Stat label={t("engineerStatement.totalCommission")} value={money(data.summary.totalCommission)} tone="text-amber-700" />
              <Stat label={t("engineerStatement.netBalance")} value={money(data.closingBalance)} tone={data.closingBalance >= 0 ? "text-green-700" : "text-red-600"} />
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-slate-200 p-4 sm:grid-cols-4">
              <Stat label={t("engineerStatement.serviceRequestCount")} value={`${data.summary.serviceRequestCount}`} sub={`${t("engineerStatement.openRequests")}: ${data.summary.openRequests} • ${t("engineerStatement.resolvedRequests")}: ${data.summary.resolvedRequests}`} tone="text-gray-700" />
              <Stat label={t("engineerStatement.visitsCount")} value={`${data.summary.visitsCount}`} sub={`${t("engineerStatement.resolvedVisits")}: ${data.summary.resolvedVisits}`} tone="text-gray-700" />
              <Stat label={t("engineerStatement.totalSalaryPaid")} value={money(data.summary.totalSalaryPaid)} sub={`${t("engineerStatement.totalPlannedSalary")}: ${money(data.summary.totalPlannedSalary)}`} tone="text-rose-700" />
              <Stat label={t("engineerStatement.custodyItems")} value={`${data.summary.custodyItems}`} tone="text-gray-700" />
            </div>

            {data.rows.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center border-t border-slate-200">
                <p className="text-sm text-gray-400">{t("engineerStatement.noTransactions")}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineerStatement.date")}</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineerStatement.description")}</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineerStatement.amount")}</th>
                        <th className="px-4 py-3 text-end text-sm font-medium text-gray-500">{t("engineerStatement.balance")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {data.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">
                            <div>{formatDate(row.date)}</div>
                            <div className="text-xs text-gray-400">{formatTime(row.date)}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {row.type === "SALE" && (
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_BADGES.SALE}`}>
                                  {typeLabel("SALE")}
                                </span>
                              )}
                              {row.type === "SETTLEMENT" && (
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_BADGES.SETTLEMENT}`}>
                                  {row.amount >= 0 ? t("engineerStatement.settlementIn") : t("engineerStatement.settlementOut")}
                                </span>
                              )}
                              {row.type === "SERVICE_REQUEST" && (
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_BADGES.SERVICE_REQUEST}`}>
                                  {typeLabel("SERVICE_REQUEST")}
                                </span>
                              )}
                              {row.type === "VISIT" && (
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_BADGES.VISIT}`}>
                                  {typeLabel("VISIT")}
                                </span>
                              )}
                              {row.type === "SALARY" && (
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_BADGES.SALARY}`}>
                                  {typeLabel("SALARY")}
                                </span>
                              )}
                              {row.ref && <span className="text-xs font-semibold text-gray-400" dir="ltr">{row.ref}</span>}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">{desc(row)}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            {row.amount !== 0 ? (
                              <span className={`font-semibold ${row.amount > 0 ? "text-green-700" : "text-red-600"}`}>
                                {row.amount > 0 ? "+" : ""}{money(row.amount)}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-end font-semibold text-slate-800">{money(row.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-600">{t("engineerStatement.closingBalance")}</span>
                  <span className={`text-lg font-bold ${data.closingBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {money(data.closingBalance)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}