"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Printer, FileText } from "lucide-react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  customerType: string;
  totalDebt: number;
  remainingDebt: number;
  lastPaymentDate: string | null;
  createdAt: string;
  payments?: { id: string; amount: number; paymentDate: string }[];
}

const TYPE_LABELS: Record<string, string> = { INDIVIDUAL: "فرد", COMPANY: "شركة" };

export default function CustomerBalancesPage() {
  const { t, dir, locale } = useI18n();
  const { error: toastError } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const fetchCustomers = async () => {
    try {
      const res = await fetch("/api/customers");
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchCustomers, ["customers", "sales", "payments"]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Only customers with money on either side — the authoritative
  // Customer.remainingDebt (>0 owes us / <0 under-account credit).
  const withBalance = useMemo(
    () => customers.filter((c) => (c.remainingDebt || 0) !== 0),
    [customers],
  );

  const filtered = withBalance.filter(
    (c) =>
      (matchesQuery(c.name, search) ||
        matchesQuery(c.email, search) ||
        (Boolean(c.phone) && c.phone.includes(search))) &&
      (!typeFilter || c.customerType === typeFilter) &&
      (!balanceFilter ||
        (balanceFilter === "debt" ? (c.remainingDebt || 0) > 0 : (c.remainingDebt || 0) < 0)),
  );

  const stats = useMemo(() => {
    const debtRows = filtered.filter((c) => (c.remainingDebt || 0) > 0);
    const creditRows = filtered.filter((c) => (c.remainingDebt || 0) < 0);
    return {
      debtorsCount: debtRows.length,
      totalDebt: debtRows.reduce((s, c) => s + (c.remainingDebt || 0), 0),
      creditCount: creditRows.length,
      totalCredit: creditRows.reduce((s, c) => s + Math.abs(c.remainingDebt || 0), 0),
      net: filtered.reduce((s, c) => s + (c.remainingDebt || 0), 0),
    };
  }, [filtered]);

  const hasActiveFilters = search !== "" || typeFilter !== "" || balanceFilter !== "";

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("");
    setBalanceFilter("");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const dateFmt = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB") : "—";

  const openStatement = async (customer: Customer) => {
    try {
      const res = await fetch(`/api/customers/${customer.id}/statement-token`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) {
        toastError(apiErrorMessage(data, t));
        return;
      }
      window.open(`${window.location.origin}/s/${encodeURIComponent(data.token)}`, "_blank", "noopener,noreferrer");
    } catch {
      toastError(t("common.error"));
    }
  };

  const getExport = () => ({
    headers: [
      t("customers.name"),
      t("customers.phone"),
      t("customers.type"),
      t("customers.totalDebt"),
      t("customers.remaining"),
      t("customers.lastPayment"),
      "قيمة آخر دفعة",
    ],
    rows: filtered.map((c) => [
      c.name,
      c.phone || "",
      TYPE_LABELS[c.customerType] || c.customerType,
      String(c.totalDebt || 0),
      String(c.remainingDebt || 0),
      c.lastPaymentDate ? new Date(c.lastPaymentDate).toISOString().slice(0, 10) : "",
      String(c.payments?.[0]?.amount || 0),
    ]),
  });

  const today = new Date().toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB");

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm 10mm 12mm 10mm; }
          body { font-size: 10pt !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: white !important; }
          .no-print { display: none !important; }
          * { overflow: visible !important; max-height: none !important; }
          table { page-break-inside: auto; width: 100% !important; border-collapse: collapse; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
        }
      `}</style>

      <div dir={dir} className="space-y-5">
        {/* Top Header Controls (No-Print) */}
        <div className="no-print flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/customers"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-600 transition hover:bg-gray-50"
              title={t("customers.backToCustomers")}
            >
              <ArrowRight size={18} />
            </Link>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-600">ERP</p>
              <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
                {t("customers.balancesTitle")}
                <span className="ms-2 text-sm font-medium text-gray-400">({filtered.length})</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton filename="customer-balances" getExport={getExport} disabled={filtered.length === 0} />
            <button
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              <Printer size={16} />{t("common.print")}
            </button>
          </div>
        </div>

        {/* Stats Cards (No-Print on Screen Only) */}
        <div className="no-print grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-medium text-red-500">{t("customers.statsDebtors")}</p>
            <p className="mt-1 text-lg font-bold text-red-600">
              {stats.debtorsCount} — {stats.totalDebt.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-3">
            <p className="text-xs font-medium text-green-600">{t("customers.statsTotalCredit")}</p>
            <p className="mt-1 text-lg font-bold text-green-700">
              {stats.creditCount > 0 ? `${stats.totalCredit.toLocaleString("ar-EG")} ج.م (${stats.creditCount})` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-600">{t("customers.statsTotalRemaining")}</p>
            <p className="mt-1 text-lg font-bold text-amber-700">{stats.net.toLocaleString("ar-EG")} ج.م</p>
          </div>
        </div>

        {/* Search & Filters (No-Print) */}
        <div className="no-print rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
            <div className="w-full md:w-80 md:flex-none">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t("customers.searchPlaceholder")} />
            </div>
            <FilterSelect
              value={typeFilter}
              onChange={(v) => { setTypeFilter(v); setPage(1); }}
              options={[
                { value: "INDIVIDUAL", label: TYPE_LABELS.INDIVIDUAL },
                { value: "COMPANY", label: TYPE_LABELS.COMPANY },
              ]}
              allLabel={`${t("customers.typeFilter")} — ${t("common.all")}`}
              className="md:w-44"
            />
            <FilterSelect
              value={balanceFilter}
              onChange={(v) => { setBalanceFilter(v); setPage(1); }}
              options={[
                { value: "debt", label: t("customers.debtorFilter") },
                { value: "credit", label: t("customers.creditorFilter") },
              ]}
              allLabel={`${t("customers.balanceFilter")} — ${t("common.all")}`}
              className="md:w-44"
            />
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-sm text-gray-500 underline hover:text-gray-700">
                {t("common.resetFilters")}
              </button>
            )}
          </div>
        </div>

        {/* Screen Table (Paginated, Hidden in Print) */}
        <div className="no-print rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
              <PrinterLoader size="md" label={t("common.loading")} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <p className="text-sm text-gray-400">{t("common.noData")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.name")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.phone")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.totalDebt")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.remaining")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.lastPayment")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paged.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-sm"><span dir="ltr">{c.phone || "—"}</span></td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {c.totalDebt > 0 ? `${c.totalDebt.toLocaleString("ar-EG")} ج.م` : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {c.remainingDebt > 0 ? (
                          <span className="font-semibold text-red-600">{c.remainingDebt.toLocaleString("ar-EG")} ج.م</span>
                        ) : (
                          <span className="font-semibold text-green-600">
                            <span className="me-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                              {t("customers.underAccount")}
                            </span>
                            {Math.abs(c.remainingDebt).toLocaleString("ar-EG")} ج.م
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {c.payments?.[0] ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200/60 shadow-xs">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span>{c.payments[0].amount.toLocaleString("ar-EG")} ج.م</span>
                            </span>
                            <span className="text-[11px] font-medium text-slate-500 tracking-tight ps-1" dir="ltr">
                              {dateFmt(c.payments[0].paymentDate)}
                            </span>
                          </div>
                        ) : c.lastPaymentDate ? (
                          <span className="text-xs font-medium text-slate-500" dir="ltr">{dateFmt(c.lastPaymentDate)}</span>
                        ) : (
                          <span className="text-slate-300 font-medium">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openStatement(c)}
                          className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100"
                        >
                          <FileText size={14} />{t("statement.openStatement")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
            />
          </div>
        </div>

        {/* Full Print Report (Prints ALL rows/pages, visible ONLY during print) */}
        <div className="hidden print:block">
          {/* Print Header */}
          <div className="border-b-2 border-slate-900 pb-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Alex Copier ERP</p>
                <h1 className="text-2xl font-black text-slate-900 mt-0.5">{t("customers.balancesTitle")}</h1>
                <p className="text-xs text-slate-600 mt-1">تقرير شامل بأرصدة ومديونيات العملاء</p>
              </div>
              <div className="text-end text-xs text-slate-700 space-y-0.5">
                <p><span className="font-bold">{t("customers.reportDate")}:</span> <span dir="ltr">{today}</span></p>
                <p><span className="font-bold">إجمالي العملاء:</span> {filtered.length} عميل</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-300 pt-2 text-xs font-medium text-slate-800">
              <div className="rounded border border-red-200 bg-red-50/50 p-2">
                <span className="block text-[10px] text-red-600 font-bold">{t("customers.statsDebtors")}</span>
                <span className="text-sm font-bold text-red-700">{stats.debtorsCount} عميل ({stats.totalDebt.toLocaleString("ar-EG")} ج.م)</span>
              </div>
              <div className="rounded border border-green-200 bg-green-50/50 p-2">
                <span className="block text-[10px] text-green-700 font-bold">{t("customers.statsTotalCredit")}</span>
                <span className="text-sm font-bold text-green-800">{stats.creditCount} عميل ({stats.totalCredit.toLocaleString("ar-EG")} ج.م)</span>
              </div>
              <div className="rounded border border-slate-300 bg-slate-50 p-2">
                <span className="block text-[10px] text-slate-600 font-bold">{t("customers.statsTotalRemaining")} (الصافي)</span>
                <span className="text-sm font-black text-slate-900">{stats.net.toLocaleString("ar-EG")} ج.م</span>
              </div>
            </div>
          </div>

          {/* Full Table */}
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-sm text-slate-400">{t("common.noData")}</p>
          ) : (
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-y-2 border-slate-900 bg-slate-100 text-slate-900">
                  <th className="py-2 px-2 text-start font-bold w-8">#</th>
                  <th className="py-2 px-2 text-start font-bold">{t("customers.name")}</th>
                  <th className="py-2 px-2 text-start font-bold">{t("customers.phone")}</th>
                  <th className="py-2 px-2 text-start font-bold">{t("customers.type")}</th>
                  <th className="py-2 px-2 text-end font-bold">{t("customers.totalDebt")}</th>
                  <th className="py-2 px-2 text-end font-bold">{t("customers.remaining")}</th>
                  <th className="py-2 px-2 text-start font-bold">{t("customers.lastPayment")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((c, idx) => (
                  <tr key={c.id} className="border-b border-slate-200">
                    <td className="py-2 px-2 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                    <td className="py-2 px-2 font-bold text-slate-900">{c.name}</td>
                    <td className="py-2 px-2 font-mono text-slate-600" dir="ltr">{c.phone || "—"}</td>
                    <td className="py-2 px-2 text-slate-600">{TYPE_LABELS[c.customerType] || c.customerType}</td>
                    <td className="py-2 px-2 text-end font-medium text-slate-700">
                      {c.totalDebt > 0 ? `${c.totalDebt.toLocaleString("ar-EG")} ج.م` : "—"}
                    </td>
                    <td className="py-2 px-2 text-end font-bold">
                      {c.remainingDebt > 0 ? (
                        <span className="text-red-700">{c.remainingDebt.toLocaleString("ar-EG")} ج.م</span>
                      ) : (
                        <span className="text-green-700 font-bold">
                          ({Math.abs(c.remainingDebt).toLocaleString("ar-EG")} ج.م)
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-slate-700">
                      {c.payments?.[0] ? (
                        <div>
                          <span className="font-bold text-emerald-800">{c.payments[0].amount.toLocaleString("ar-EG")} ج.م</span>
                          <span className="text-[10px] text-slate-500 ms-1" dir="ltr">({dateFmt(c.payments[0].paymentDate)})</span>
                        </div>
                      ) : c.lastPaymentDate ? (
                        <span dir="ltr">{dateFmt(c.lastPaymentDate)}</span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 bg-slate-100 font-bold text-slate-900">
                  <td colSpan={4} className="py-2.5 px-2 text-start">الإجمالي العام ({filtered.length} عميل)</td>
                  <td className="py-2.5 px-2 text-end">{filtered.reduce((s, c) => s + (c.totalDebt || 0), 0).toLocaleString("ar-EG")} ج.م</td>
                  <td className="py-2.5 px-2 text-end text-red-700 font-black">{stats.net.toLocaleString("ar-EG")} ج.م</td>
                  <td className="py-2.5 px-2"></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
