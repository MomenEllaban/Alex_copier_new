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
import SupplierStatementModal from "@/components/SupplierStatementModal";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import {
  buildSupplierBalances,
  type PurchaseOrderLite,
  type PurchaseReturnLite,
} from "@/lib/supplier-statement";

interface Supplier {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  companyId: string;
  company?: { id: string; name: string } | null;
}

interface Company {
  id: string;
  name: string;
}

export default function SupplierBalancesPage() {
  const { t, dir, locale } = useI18n();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderLite[]>([]);
  const [returns, setReturns] = useState<PurchaseReturnLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [page, setPage] = useState(1);
  const [statementId, setStatementId] = useState<string | null>(null);
  const PAGE_SIZE = 10;

  const fetchAll = async () => {
    try {
      const [supRes, purRes, retRes, compRes] = await Promise.all([
        fetch("/api/suppliers"),
        fetch("/api/purchases"),
        fetch("/api/returns"),
        fetch("/api/companies"),
      ]);
      const [supData, purData, retData, compData] = await Promise.all([
        supRes.json(),
        purRes.json(),
        retRes.json(),
        compRes.json(),
      ]);
      setSuppliers(Array.isArray(supData) ? supData : []);
      setOrders(Array.isArray(purData?.orders) ? purData.orders : []);
      setReturns(Array.isArray(retData) ? retData : []);
      setCompanies(Array.isArray(compData) ? compData : []);
    } finally {
      setLoading(false);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchAll, ["suppliers", "purchases", "returns"]);

  useEffect(() => {
    fetchAll();
  }, []);

  const balances = useMemo(
    () => buildSupplierBalances(suppliers.map((s) => s.id), orders, returns),
    [suppliers, orders, returns],
  );

  // Same rule as customers: only suppliers with money on the table.
  const withBalance = useMemo(
    () =>
      suppliers
        .map((s) => ({ supplier: s, row: balances.get(s.id) }))
        .filter((x) => x.row && x.row.balance !== 0),
    [suppliers, balances],
  );

  const filtered = withBalance.filter(
    ({ supplier }) =>
      (matchesQuery(supplier.name, search) ||
        matchesQuery(supplier.contactName || "", search) ||
        matchesQuery(supplier.email || "", search) ||
        matchesQuery(supplier.company?.name || "", search) ||
        (Boolean(supplier.phone) && supplier.phone!.includes(search))) &&
      (!companyFilter || supplier.companyId === companyFilter),
  );

  const stats = useMemo(() => {
    return {
      count: filtered.length,
      total: filtered.reduce((s, x) => s + (x.row?.balance || 0), 0),
      orders: filtered.reduce((s, x) => s + (x.row?.ordersCount || 0), 0),
      returnsTotal: filtered.reduce((s, x) => s + (x.row?.returnsTotal || 0), 0),
    };
  }, [filtered]);

  const hasActiveFilters = search !== "" || companyFilter !== "";
  const resetFilters = () => {
    setSearch("");
    setCompanyFilter("");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const getExport = () => ({
    headers: [
      t("suppliers.name"),
      t("common.company"),
      t("suppliers.phone"),
      t("suppliers.ordersCount"),
      t("suppliers.totalPurchases"),
      t("suppliers.returnsTotal"),
      t("suppliers.balanceDue"),
      t("suppliers.lastOrder"),
    ],
    rows: filtered.map(({ supplier, row }) => [
      supplier.name,
      supplier.company?.name || "",
      supplier.phone || "",
      String(row?.ordersCount || 0),
      String(row?.totalPurchases || 0),
      String(row?.returnsTotal || 0),
      String(row?.balance || 0),
      row?.lastOrderDate ? new Date(row.lastOrderDate).toISOString().slice(0, 10) : "",
    ]),
  });

  const today = new Date().toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB");
  const statementSupplier = statementId ? suppliers.find((s) => s.id === statementId) || null : null;

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
              href="/suppliers"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-600 transition hover:bg-gray-50"
              title={t("suppliers.backToSuppliers")}
            >
              <ArrowRight size={18} />
            </Link>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-600">ERP</p>
              <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
                {t("suppliers.balancesTitle")}
                <span className="ms-2 text-sm font-medium text-gray-400">({filtered.length})</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton filename="supplier-balances" getExport={getExport} disabled={filtered.length === 0} />
            <button
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              <Printer size={16} />{t("common.print")}
            </button>
          </div>
        </div>

        <div className="hidden print:block rounded-2xl border border-slate-300 bg-white p-5">
          <h1 className="text-xl font-bold">{t("suppliers.balancesTitle")}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {t("customers.reportDate")}: {today} — {t("suppliers.balanceDue")}:{" "}
            {stats.total.toLocaleString("ar-EG")} ج.م ({stats.count})
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-600">{t("suppliers.balanceDue")}</p>
            <p className="mt-1 text-lg font-bold text-amber-700">{stats.total.toLocaleString("ar-EG")} ج.م</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-medium text-blue-600">{t("suppliers.totalPurchases")}</p>
            <p className="mt-1 text-lg font-bold text-blue-700">
              {stats.total.toLocaleString("ar-EG")} ج.م ({stats.orders})
            </p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
            <p className="text-xs font-medium text-orange-600">{t("suppliers.returnsTotal")}</p>
            <p className="mt-1 text-lg font-bold text-orange-700">{stats.returnsTotal.toLocaleString("ar-EG")} ج.م</p>
          </div>
        </div>

        <div className="no-print rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
            <div className="w-full md:w-80 md:flex-none">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t("suppliers.searchPlaceholder")} />
            </div>
            <FilterSelect
              value={companyFilter}
              onChange={(v) => { setCompanyFilter(v); setPage(1); }}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              allLabel={`${t("common.company")} — ${t("common.all")}`}
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
              <table className="w-full min-w-[820px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.name")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.company")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.phone")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.ordersCount")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.totalPurchases")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.balanceDue")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.lastOrder")}</th>
                    <th className="no-print px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paged.map(({ supplier, row }) => (
                    <tr key={supplier.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{supplier.name}</td>
                      <td className="px-4 py-3 text-sm">{supplier.company?.name || "—"}</td>
                      <td className="px-4 py-3 text-sm"><span dir="ltr">{supplier.phone || "—"}</span></td>
                      <td className="px-4 py-3 text-sm">{row?.ordersCount || 0}</td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {(row?.totalPurchases || 0).toLocaleString("ar-EG")} ج.م
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-amber-700">
                        {(row?.balance || 0).toLocaleString("ar-EG")} ج.م
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {row?.lastOrderDate
                          ? new Date(row.lastOrderDate).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB")
                          : "—"}
                      </td>
                      <td className="no-print px-4 py-3">
                        <button
                          onClick={() => setStatementId(supplier.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100"
                        >
                          <FileText size={14} />{t("suppliers.statement")}
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

      {statementSupplier && (
        <SupplierStatementModal
          open={!!statementSupplier}
          onClose={() => setStatementId(null)}
          supplierId={statementSupplier.id}
          supplierName={statementSupplier.name}
          companyName={statementSupplier.company?.name}
          orders={orders}
          returns={returns}
        />
      )}
    </>
  );
}
