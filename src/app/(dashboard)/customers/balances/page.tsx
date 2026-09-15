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
  companyName: string;
  phone: string;
  email: string;
  customerType: string;
  totalDebt: number;
  remainingDebt: number;
  lastPaymentDate: string | null;
  createdAt: string;
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
  const PAGE_SIZE = 15;

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
        matchesQuery(c.companyName, search) ||
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

  const dateFmt = (v: string | null) =>
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
      t("customers.companyName"),
      t("customers.phone"),
      t("customers.type"),
      t("customers.totalDebt"),
      t("customers.remaining"),
      t("customers.lastPayment"),
    ],
    rows: filtered.map((c) => [
      c.name,
      c.companyName || "",
      c.phone || "",
      TYPE_LABELS[c.customerType] || c.customerType,
      String(c.totalDebt || 0),
      String(c.remainingDebt || 0),
      c.lastPaymentDate ? new Date(c.lastPaymentDate).toISOString().slice(0, 10) : "",
    ]),
  });

  const today = new Date().toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB");

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { font-size: 11pt !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          * { overflow: visible !important; max-height: none !important; }
          table { page-break-inside: auto; width: 100% !important; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>

      <div dir={dir} className="space-y-5">
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

        {/* Print-only header */}
        <div className="hidden print:block rounded-2xl border border-slate-300 bg-white p-5">
          <h1 className="text-xl font-bold">{t("customers.balancesTitle")}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {t("customers.reportDate")}: {today} — {t("customers.statsDebtors")}: {stats.debtorsCount} (
            {stats.totalDebt.toLocaleString("ar-EG")} ج.م) — {t("customers.statsTotalCredit")}:{" "}
            {stats.totalCredit.toLocaleString("ar-EG")} ج.م ({stats.creditCount})
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.companyName")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.phone")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.totalDebt")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.remaining")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.lastPayment")}</th>
                    <th className="no-print px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paged.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-sm">{c.companyName || "—"}</td>
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
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{dateFmt(c.lastPaymentDate)}</td>
                      <td className="no-print px-4 py-3">
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
          <div className="no-print">
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
            />
          </div>
        </div>
      </div>
    </>
  );
}
