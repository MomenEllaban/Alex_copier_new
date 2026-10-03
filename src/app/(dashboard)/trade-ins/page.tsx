"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import { AddFormBoundary } from "@/hooks/useAutoAddForm";
import { useConfirm, useToast } from "@/components/UIProvider";
import FormModal from "@/components/FormModal";
import { DateTimeCell } from "@/components/DateTimeCell";
import {
  Boxes,
  CircleCheck,
  Eye,
  Package,
  Pencil,
  Tag,
  Trash2,
  Truck,
  Wallet,
  Warehouse,
} from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import StatsCards from "@/components/StatsCards";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";
import { formatEgyptDateTimeFull } from "@/lib/datetime";

interface Company {
  id: string;
  name: string;
  nameAr?: string | null;
}

interface TradeInStock {
  quantity: number;
  warehouse: { id: string; name: string; isMain: boolean };
}

interface TradeInReplacement {
  id: string;
  createdAt: string;
  oldMachine: { id: string; serialNumber: string; manufacturer: string | null; model: string | null };
  contract: {
    id: string;
    contractNumber: string;
    customer: { id: string; name: string } | null;
  } | null;
}

interface TradeInProduct {
  id: string;
  name: string;
  description?: string | null;
  productType: string;
  companyId: string;
  company?: Company;
  brand?: string | null;
  condition?: string | null;
  tradeInValue?: number | null;
  sku?: string | null;
  isActive: boolean;
  createdAt: string;
  inventoryItems: TradeInStock[];
  machineReplacement?: TradeInReplacement[] | null;
}

/** Pill colours per condition, so the state reads at a glance without the text. */
const CONDITION_TONES: Record<string, string> = {
  excellent: "bg-green-100 text-green-800",
  good: "bg-blue-100 text-blue-800",
  fair: "bg-yellow-100 text-yellow-800",
  poor: "bg-red-100 text-red-800",
};

const EMPTY_TONE = "bg-slate-100 text-slate-600";

/** Units on the shelf. A returned machine is one unit, keyed on its serial. */
function stockOf(p: TradeInProduct): number {
  return (p.inventoryItems ?? []).reduce((sum, row) => sum + row.quantity, 0);
}

/** The main warehouse holds it; that is the position the replacement flow wrote. */
function mainWarehouseOf(p: TradeInProduct): TradeInStock["warehouse"] | null {
  const rows = p.inventoryItems ?? [];
  return rows.find((r) => r.warehouse?.isMain)?.warehouse ?? rows[0]?.warehouse ?? null;
}

/** Serial number of the machine this product was made from. */
function machineLabel(p: TradeInProduct): string {
  return p.machineReplacement?.[0]?.oldMachine?.serialNumber ?? p.sku ?? "";
}

function typeLabel(t: (key: string) => string, productType: string): string {
  return productType === "MACHINE" ? t("products.machine") : t("products.sparePart");
}

export default function TradeInsPage() {
  const { t, dir } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [products, setProducts] = useState<TradeInProduct[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showView, setShowView] = useState<TradeInProduct | null>(null);
  const PAGE_SIZE = 10;

  // The condition words are searched as well, so a user can type "ممتاز" and
  // land on the rows carrying that state without knowing the enum value.
  const conditionText = useMemo<Record<string, string>>(
    () => ({
      excellent: t("tradeIns.conditions.excellent"),
      good: t("tradeIns.conditions.good"),
      fair: t("tradeIns.conditions.fair"),
      poor: t("tradeIns.conditions.poor"),
    }),
    [t]
  );

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (!companyFilter || p.companyId === companyFilter) &&
          (!conditionFilter || p.condition === conditionFilter) &&
          (matchesQuery(p.name, search) ||
            matchesQuery(p.brand, search) ||
            matchesQuery(p.sku, search) ||
            matchesQuery(p.company?.name, search) ||
            matchesQuery(p.company?.nameAr, search) ||
            matchesQuery(machineLabel(p), search) ||
            matchesQuery(p.machineReplacement?.[0]?.contract?.customer?.name, search) ||
            matchesQuery(p.machineReplacement?.[0]?.contract?.contractNumber, search) ||
            matchesQuery(conditionText[p.condition || ""], search) ||
            matchesQuery(typeLabel(t, p.productType), search))
      ),
    [products, search, companyFilter, conditionFilter, conditionText, t]
  );

  const hasActiveFilters = search !== "" || companyFilter !== "" || conditionFilter !== "";

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    const totalValue = filtered.reduce((sum, p) => sum + (p.tradeInValue || 0), 0);
    return {
      total: filtered.length,
      totalValue,
      active: filtered.filter((p) => p.isActive).length,
      classified: filtered.filter((p) => Boolean(p.condition)).length,
      // How many physical units are actually on the shelf, not how many rows.
      stockUnits: filtered.reduce((sum, p) => sum + stockOf(p), 0),
    };
  }, [filtered]);

  const fetchData = async () => {
    try {
      // `/api/trade-ins` rather than `/api/products?tradeIn=true`: this page
      // shows where each returned machine is held and how many units are there,
      // and the products route does not return the warehouse position.
      const [pRes, cRes] = await Promise.all([
        fetch("/api/trade-ins"),
        fetch("/api/companies"),
      ]);
      const pData = await pRes.json();
      const cData = await cRes.json();
      setProducts(Array.isArray(pData) ? pData : []);
      setCompanies(Array.isArray(cData) ? cData : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchData, ["trade-ins", "products", "inventory"]);

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("tradeIns.deleteConfirm") }))) return;
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error);
      // A returned machine always has stock and a movement row against it, so
      // the server archives it rather than deleting. Dropping the row locally
      // would leave it back on screen after a refresh, so say what happened.
      if (data?.archived) {
        setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: false } : p)));
        toastSuccess(t("tradeIns.archivedNotice"));
      } else {
        setProducts((prev) => prev.filter((p) => p.id !== id));
        toastSuccess(t("common.deletedSuccessfully"));
      }
      refresh();
      notifyDataChanged(["trade-ins", "products", "inventory"]);
    } catch (e) {
      toastError(e instanceof Error && e.message ? e.message : t("tradeIns.deleteFailed"));
    }
  };

  const exportData = () => ({
    headers: [
      t("tradeIns.product"),
      t("tradeIns.machineSerial"),
      t("tradeIns.condition"),
      t("tradeIns.tradeInValue"),
      t("tradeIns.warehouse"),
      t("tradeIns.stock"),
      t("tradeIns.replacedFrom"),
      t("tradeIns.contract"),
      t("tradeIns.holdingCompany"),
      t("common.type"),
      t("tradeIns.receivedAt"),
    ],
    rows: filtered.map((p) => [
      p.name,
      machineLabel(p),
      p.condition ? conditionText[p.condition] : t("tradeIns.unclassified"),
      String(p.tradeInValue ?? 0),
      mainWarehouseOf(p)?.name || "",
      String(stockOf(p)),
      p.machineReplacement?.[0]?.contract?.customer?.name || "",
      p.machineReplacement?.[0]?.contract?.contractNumber || "",
      p.company?.name || "",
      typeLabel(t, p.productType),
      formatEgyptDateTimeFull(p.createdAt),
    ]),
  });

  if (loading) return <PrinterLoader />;

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />

      {/* Header */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">{t("tradeIns.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("tradeIns.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            <Package size={13} className="shrink-0" />
            {filtered.length} {t("tradeIns.itemsUnit")}
          </span>
        </div>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("tradeIns.total"), value: stats.total.toLocaleString("ar-EG"), icon: <Package size={18} />, tone: "sky" },
          { label: t("tradeIns.stockTotal"), value: stats.stockUnits.toLocaleString("ar-EG"), icon: <Boxes size={18} />, tone: "violet" },
          { label: t("tradeIns.totalValue"), value: `${stats.totalValue.toLocaleString("ar-EG")} ${t("tradeIns.currency")}`, icon: <Wallet size={18} />, tone: "emerald" },
          { label: t("tradeIns.active"), value: stats.active.toLocaleString("ar-EG"), icon: <CircleCheck size={18} />, tone: "green" },
          { label: t("tradeIns.classified"), value: stats.classified.toLocaleString("ar-EG"), icon: <Tag size={18} />, tone: "purple" },
        ]}
      />

      {/* A replacement always lands in the receiving company's own main
          warehouse, so say where the stock is rather than leaving it implicit. */}
      <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <Warehouse size={14} className="mt-0.5 shrink-0" />
        {t("tradeIns.companyRoutingHint")}
      </p>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none">
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder={t("tradeIns.searchPlaceholder")}
            />
          </div>
          <FilterSelect
            value={companyFilter}
            onChange={(v) => { setCompanyFilter(v); setPage(1); }}
            options={companies.map((c) => ({ value: c.id, label: c.nameAr || c.name }))}
            allLabel={`${t("tradeIns.holdingCompany")} — ${t("common.all")}`}
            className="w-full md:w-52"
          />
          <FilterSelect
            value={conditionFilter}
            onChange={(v) => { setConditionFilter(v); setPage(1); }}
            options={[
              { value: "excellent", label: conditionText.excellent },
              { value: "good", label: conditionText.good },
              { value: "fair", label: conditionText.fair },
              { value: "poor", label: conditionText.poor },
            ]}
            allLabel={t("tradeIns.allConditions")}
            className="w-full md:w-44"
          />
          {hasActiveFilters && (
            <button
              onClick={() => { setSearch(""); setCompanyFilter(""); setConditionFilter(""); setPage(1); }}
              className="text-sm text-slate-500 underline transition hover:text-slate-700"
            >
              {t("common.resetFilters")}
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2 md:ms-auto">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton filename="products-trade-in" getExport={exportData} disabled={filtered.length === 0} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-start text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-600">{t("tradeIns.product")}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-600">{t("tradeIns.machineSerial")}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-600">{t("tradeIns.condition")}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-600">{t("tradeIns.tradeInValue")}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-600">{t("tradeIns.warehouse")}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-600">{t("tradeIns.stock")}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-600">{t("tradeIns.replacedFrom")}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-600">{t("tradeIns.holdingCompany")}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-600">{t("tradeIns.receivedAt")}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-slate-600">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-400">
                    {filtered.length === 0 ? t("tradeIns.empty") : t("tradeIns.noResults")}
                  </td>
                </tr>
              ) : (
                paged.map((product) => {
                  const stock = stockOf(product);
                  const contract = product.machineReplacement?.[0]?.contract;
                  const condition = product.condition || "";
                  return (
                    <tr
                      key={product.id}
                      className={`transition hover:bg-slate-50 ${product.isActive ? "" : "opacity-60"}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{product.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          {product.brand && <span>{product.brand}</span>}
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                            {product.productType === "MACHINE" ? <Truck size={11} className="shrink-0" /> : <Pencil size={11} className="shrink-0" />}
                            {typeLabel(t, product.productType)}
                          </span>
                          {!product.isActive && (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
                              {t("common.inactive")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span dir="ltr" className="font-mono text-xs text-slate-700">
                          {machineLabel(product) || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            CONDITION_TONES[condition] || EMPTY_TONE
                          }`}
                        >
                          {condition ? conditionText[condition] : t("tradeIns.unclassified")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="whitespace-nowrap font-bold text-amber-600">
                          {(product.tradeInValue || 0).toLocaleString("ar-EG")} {t("tradeIns.currency")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{mainWarehouseOf(product)?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            stock > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <Boxes size={12} className="shrink-0" />
                          {stock > 0 ? `${stock} ${t("tradeIns.inStock")}` : t("tradeIns.outOfStock")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {contract ? (
                          <>
                            <div className="font-medium text-slate-800">{contract.customer?.name || "—"}</div>
                            <div dir="ltr" className="text-start text-xs text-slate-500">{contract.contractNumber}</div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{product.company?.nameAr || product.company?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <DateTimeCell value={product.createdAt} className="text-xs text-slate-700" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowView(product)}
                            title={t("common.view")}
                            aria-label={t("common.view")}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-100"
                          >
                            <Eye size={14} className="shrink-0" />
                            {t("common.view")}
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            title={t("common.delete")}
                            aria-label={t("common.delete")}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100"
                          >
                            <Trash2 size={14} className="shrink-0" />
                            {t("common.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 bg-slate-50/60 p-3">
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      </div>

      {/* View Modal */}
      {showView && (
        <FormModal open={!!showView} onClose={() => setShowView(null)} title={t("tradeIns.viewTitle")} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div><span className="text-xs font-medium text-slate-500">{t("tradeIns.productName")}</span><p className="mt-1 text-sm font-medium text-slate-900">{showView.name}</p></div>
              <div><span className="text-xs font-medium text-slate-500">{t("tradeIns.machineSerialFull")}</span><p dir="ltr" className="mt-1 text-start font-mono text-sm text-slate-900">{machineLabel(showView) || "—"}</p></div>
              <div><span className="text-xs font-medium text-slate-500">{t("tradeIns.condition")}</span><p className="mt-1 text-sm text-slate-900">{showView.condition ? conditionText[showView.condition] : t("tradeIns.unclassified")}</p></div>
              <div><span className="text-xs font-medium text-slate-500">{t("tradeIns.tradeInValue")}</span><p className="mt-1 text-lg font-bold text-amber-600">{(showView.tradeInValue || 0).toLocaleString("ar-EG")} {t("tradeIns.currency")}</p></div>
              <div><span className="text-xs font-medium text-slate-500">{t("common.type")}</span><p className="mt-1 text-sm text-slate-900">{typeLabel(t, showView.productType)}</p></div>
              <div><span className="text-xs font-medium text-slate-500">{t("tradeIns.holdingCompany")}</span><p className="mt-1 text-sm text-slate-900">{showView.company?.nameAr || showView.company?.name || "—"}</p></div>
              <div><span className="text-xs font-medium text-slate-500">{t("tradeIns.warehouse")}</span><p className="mt-1 text-sm text-slate-900">{mainWarehouseOf(showView)?.name || "—"}</p></div>
              <div><span className="text-xs font-medium text-slate-500">{t("tradeIns.stock")}</span><p className="mt-1 text-sm font-semibold text-slate-900">{stockOf(showView)}</p></div>
              <div><span className="text-xs font-medium text-slate-500">{t("tradeIns.previousCustomer")}</span><p className="mt-1 text-sm text-slate-900">{showView.machineReplacement?.[0]?.contract?.customer?.name || "—"}</p></div>
              <div><span className="text-xs font-medium text-slate-500">{t("tradeIns.contract")}</span><p dir="ltr" className="mt-1 text-start text-sm text-slate-900">{showView.machineReplacement?.[0]?.contract?.contractNumber || "—"}</p></div>
              <div><span className="text-xs font-medium text-slate-500">{t("common.status")}</span><p className="mt-1 text-sm text-slate-900">{showView.isActive ? t("common.active") : t("common.inactive")}</p></div>
              <div>
                <span className="text-xs font-medium text-slate-500">{t("tradeIns.receivedAt")}</span>
                <p className="mt-1 text-sm text-slate-900"><DateTimeCell value={showView.createdAt} /></p>
              </div>
            </div>
          </div>
        </FormModal>
      )}
    </div>
  );
}