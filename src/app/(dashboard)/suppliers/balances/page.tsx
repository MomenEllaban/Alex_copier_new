"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Printer, FileText, Wallet, Building2 } from "lucide-react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import RefreshButton from "@/components/RefreshButton";
import SupplierStatementModal from "@/components/SupplierStatementModal";
import RecordSupplierPaymentModal, { type SupplierForPayment } from "@/components/RecordSupplierPaymentModal";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { PurchaseOrderLite, PurchaseReturnLite, SupplierPaymentLite } from "@/lib/supplier-statement";

interface Supplier {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  companyId: string;
  company?: { id: string; name: string } | null;
  balance?: number;
  totalPurchases?: number;
  totalPayments?: number;
  returnsTotal?: number;
  ordersCount?: number;
  lastOrderDate?: string | null;
  purchaseOrders?: PurchaseOrderLite[];
  returns?: PurchaseReturnLite[];
  payments?: SupplierPaymentLite[];
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
  const [payments, setPayments] = useState<SupplierPaymentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [page, setPage] = useState(1);
  const [statementId, setStatementId] = useState<string | null>(null);
  const [paymentSupplier, setPaymentSupplier] = useState<SupplierForPayment | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const PAGE_SIZE = 10;

  const fetchAll = async () => {
    try {
      const [supRes, compRes] = await Promise.all([
        fetch("/api/suppliers"),
        fetch("/api/companies"),
      ]);
      const [supData, compData] = await Promise.all([
        supRes.json(),
        compRes.json(),
      ]);
      const supList = Array.isArray(supData) ? supData : [];
      setSuppliers(supList);

      const allOrders: PurchaseOrderLite[] = [];
      const allReturns: PurchaseReturnLite[] = [];
      const allPayments: SupplierPaymentLite[] = [];
      for (const s of supList) {
        if (Array.isArray(s.purchaseOrders)) allOrders.push(...s.purchaseOrders);
        if (Array.isArray(s.returns)) allReturns.push(...s.returns);
        if (Array.isArray(s.payments)) allPayments.push(...s.payments);
      }
      setOrders(allOrders);
      setReturns(allReturns);
      setPayments(allPayments);
      setCompanies(Array.isArray(compData) ? compData : []);
    } finally {
      setLoading(false);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchAll, ["suppliers", "purchases", "returns", "payments"]);

  useEffect(() => {
    fetchAll();
  }, []);

  // Filter suppliers who have balance due
  const withBalance = useMemo(
    () => suppliers.filter((s) => (s.balance || 0) !== 0 || (s.ordersCount || 0) > 0),
    [suppliers],
  );

  const filtered = withBalance.filter(
    (s) =>
      (matchesQuery(s.name, search) ||
        matchesQuery(s.contactName || "", search) ||
        matchesQuery(s.email || "", search) ||
        matchesQuery(s.company?.name || "", search) ||
        (Boolean(s.phone) && s.phone!.includes(search))) &&
      (!companyFilter || s.companyId === companyFilter),
  );

  const stats = useMemo(() => {
    return {
      count: filtered.length,
      totalDue: filtered.reduce((sum, s) => sum + (s.balance || 0), 0),
      totalPurchases: filtered.reduce((sum, s) => sum + (s.totalPurchases || s.balance || 0), 0),
      ordersCount: filtered.reduce((sum, s) => sum + (s.ordersCount || s.purchaseOrders?.length || 0), 0),
      returnsTotal: filtered.reduce((sum, s) => sum + (s.returnsTotal || 0), 0),
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

  const dateFmt = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB") : "—";

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
    rows: filtered.map((s) => [
      s.name,
      s.company?.name || "",
      s.phone || "",
      String(s.ordersCount || s.purchaseOrders?.length || 0),
      String(s.totalPurchases || s.balance || 0),
      String(s.returnsTotal || 0),
      String(s.balance || 0),
      s.lastOrderDate ? new Date(s.lastOrderDate).toISOString().slice(0, 10) : "",
    ]),
  });

  const today = new Date().toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB");
  const statementSupplier = statementId ? suppliers.find((s) => s.id === statementId) || null : null;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm 10mm 12mm 10mm; }
          html, body { height: auto !important; overflow: visible !important; }
          body { font-size: 10pt !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: white !important; }
          .no-print { display: none !important; visibility: hidden !important; }
          * { overflow: visible !important; max-height: none !important; box-shadow: none !important; }
          .print-all { display: block !important; visibility: visible !important; }
          .print-table-wrapper { display: block !important; }
          table { page-break-inside: auto !important; width: 100% !important; border-collapse: collapse !important; }
          thead { display: table-header-group !important; }
          tfoot { display: table-footer-group !important; }
          tr { page-break-inside: avoid !important; page-break-after: auto !important; }
          td, th { page-break-inside: avoid !important; }
        }
      `}</style>

      <div dir={dir} className="space-y-5">
        {/* Top Header Controls (No-Print) */}
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

        {/* Stats Cards (No-Print on Screen Only) */}
        <div className="no-print grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-amber-700">{t("suppliers.balanceDue")} (دائن)</p>
              <Wallet size={18} className="text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-black text-amber-800">
              {stats.totalDue.toLocaleString("ar-EG")} ج.م
            </p>
            <p className="mt-1 text-xs text-amber-600 font-medium">{stats.count} مورد مستحق لهم</p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-blue-700">{t("suppliers.totalPurchases")}</p>
              <span className="text-xs font-bold text-blue-600">صافي المشتريات</span>
            </div>
            <p className="mt-2 text-2xl font-black text-blue-800">
              {stats.totalPurchases.toLocaleString("ar-EG")} ج.م
            </p>
            <p className="mt-1 text-xs text-blue-600 font-medium">{stats.ordersCount} فاتورة مشتريات</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">عدد الحركات والفواتير</p>
              <Building2 size={18} className="text-slate-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-slate-800">
              {stats.ordersCount} <span className="text-sm font-normal text-slate-500">فاتورة</span>
            </p>
            <p className="mt-1 text-xs text-slate-500 font-medium">عبر {stats.count} موردين معتمدين</p>
          </div>
        </div>

        {/* Search & Filters (No-Print) */}
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
              <table className="w-full min-w-[820px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">#</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.name")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.company")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.phone")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.ordersCount")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.totalPurchases")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.balanceDue")} (دائن)</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.lastOrder")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paged.map((supplier, idx) => (
                    <tr key={supplier.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs font-mono text-gray-400">{(safePage - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-900">{supplier.name}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {supplier.company?.name || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm"><span dir="ltr">{supplier.phone || "—"}</span></td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-700">{supplier.ordersCount || supplier.purchaseOrders?.length || 0}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {(supplier.totalPurchases || supplier.balance || 0).toLocaleString("ar-EG")} ج.م
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex rounded-lg bg-amber-100 px-2.5 py-1 text-sm font-black text-amber-800">
                          {(supplier.balance || 0).toLocaleString("ar-EG")} ج.م
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {dateFmt(supplier.lastOrderDate)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={() => {
                              setPaymentSupplier(supplier);
                              setShowPaymentModal(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                            title="تسجيل دفعة سداد"
                          >
                            <Wallet size={14} />تسجيل دفعة
                          </button>
                          <button
                            onClick={() => setStatementId(supplier.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                          >
                            <FileText size={14} />{t("suppliers.statement")}
                          </button>
                        </div>
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

        {/* Full Print Report (Prints ALL rows/pages cleanly, visible ONLY during print) */}
        <div className="hidden print:block print-all">
          <div className="border-b-2 border-slate-900 pb-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Alex Copier ERP</p>
                <h1 className="text-2xl font-black text-slate-900 mt-0.5">{t("suppliers.balancesTitle")}</h1>
                <p className="text-xs text-slate-600 mt-1">تقرير شامل بأرصدة ومستحقات الموردين — شركة جملة آلات</p>
              </div>
              <div className="text-end text-xs text-slate-700 space-y-0.5">
                <p><span className="font-bold">{t("customers.reportDate")}:</span> <span dir="ltr">{today}</span></p>
                <p><span className="font-bold">إجمالي الموردين:</span> {filtered.length} مورد</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-300 pt-2 text-xs font-medium text-slate-800">
              <div className="rounded border border-amber-300 bg-amber-50/70 p-2">
                <span className="block text-[10px] text-amber-700 font-bold">{t("suppliers.balanceDue")} (إجمالي الدائن)</span>
                <span className="text-sm font-black text-amber-800">{stats.totalDue.toLocaleString("ar-EG")} ج.م</span>
              </div>
              <div className="rounded border border-blue-200 bg-blue-50/70 p-2">
                <span className="block text-[10px] text-blue-700 font-bold">{t("suppliers.totalPurchases")}</span>
                <span className="text-sm font-bold text-blue-800">{stats.totalPurchases.toLocaleString("ar-EG")} ج.م</span>
              </div>
              <div className="rounded border border-slate-300 bg-slate-50 p-2">
                <span className="block text-[10px] text-slate-600 font-bold">إجمالي الفواتير المسجلة</span>
                <span className="text-sm font-black text-slate-900">{stats.ordersCount} فاتورة</span>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-center py-8 text-sm text-slate-400">{t("common.noData")}</p>
          ) : (
            <div className="print-table-wrapper">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="border-y-2 border-slate-900 bg-slate-100 text-slate-900">
                    <th className="py-2 px-2 text-start font-bold w-8">#</th>
                    <th className="py-2 px-2 text-start font-bold">{t("suppliers.name")}</th>
                    <th className="py-2 px-2 text-start font-bold">{t("common.company")}</th>
                    <th className="py-2 px-2 text-start font-bold">{t("suppliers.phone")}</th>
                    <th className="py-2 px-2 text-center font-bold">{t("suppliers.ordersCount")}</th>
                    <th className="py-2 px-2 text-end font-bold">{t("suppliers.totalPurchases")}</th>
                    <th className="py-2 px-2 text-end font-bold">{t("suppliers.balanceDue")} (دائن)</th>
                    <th className="py-2 px-2 text-start font-bold">{t("suppliers.lastOrder")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filtered.map((s, idx) => (
                    <tr key={s.id} className="border-b border-slate-200">
                      <td className="py-2 px-2 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                      <td className="py-2 px-2 font-bold text-slate-900">{s.name}</td>
                      <td className="py-2 px-2 text-slate-700">{s.company?.name || "—"}</td>
                      <td className="py-2 px-2 font-mono text-slate-600" dir="ltr">{s.phone || "—"}</td>
                      <td className="py-2 px-2 text-center font-medium text-slate-700">{s.ordersCount || s.purchaseOrders?.length || 0}</td>
                      <td className="py-2 px-2 text-end font-medium text-slate-800">
                        {(s.totalPurchases || s.balance || 0).toLocaleString("ar-EG")} ج.م
                      </td>
                      <td className="py-2 px-2 text-end font-black text-amber-800">
                        {(s.balance || 0).toLocaleString("ar-EG")} ج.م
                      </td>
                      <td className="py-2 px-2 text-slate-600 whitespace-nowrap">
                        {dateFmt(s.lastOrderDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 bg-slate-100 font-bold text-slate-900">
                    <td colSpan={4} className="py-2.5 px-2 text-start">الإجمالي العام ({filtered.length} مورد)</td>
                    <td className="py-2.5 px-2 text-center">{stats.ordersCount}</td>
                    <td className="py-2.5 px-2 text-end">{stats.totalPurchases.toLocaleString("ar-EG")} ج.م</td>
                    <td className="py-2.5 px-2 text-end font-black text-amber-800">{stats.totalDue.toLocaleString("ar-EG")} ج.م</td>
                    <td className="py-2.5 px-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      <RecordSupplierPaymentModal
        open={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentSupplier(null);
        }}
        supplier={paymentSupplier}
        companies={companies}
        onSuccess={refresh}
      />

      {statementSupplier && (
        <SupplierStatementModal
          open={!!statementSupplier}
          onClose={() => setStatementId(null)}
          supplierId={statementSupplier.id}
          supplierName={statementSupplier.name}
          companyName={statementSupplier.company?.name}
          orders={orders}
          returns={returns}
          payments={payments}
          onRecordPayment={(id) => {
            const s = suppliers.find((x) => x.id === id);
            if (s) {
              setPaymentSupplier(s);
              setShowPaymentModal(true);
            }
          }}
        />
      )}
    </>
  );
}
