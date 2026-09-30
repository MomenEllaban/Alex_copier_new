"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import { AddFormBoundary } from "@/hooks/useAutoAddForm";
import { useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import FormModal from "@/components/FormModal";
import { DateTimeCell } from "@/components/DateTimeCell";
import { RotateCcw, Save, X, Package, Wallet, CircleCheck, Tag, Boxes, Warehouse } from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import StatsCards from "@/components/StatsCards";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Company {
  id: string;
  name: string;
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

const CONDITION_LABELS: Record<string, string> = {
  excellent: "ممتاز",
  good: "جيد",
  fair: "مقبول",
  poor: "ضعيف",
};

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

export default function TradeInsPage() {
  const { t, dir } = useI18n();
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

  const filtered = products.filter(
    (p) =>
      (!companyFilter || p.companyId === companyFilter) &&
      (!conditionFilter || p.condition === conditionFilter) &&
      (matchesQuery(p.name, search) ||
        matchesQuery(p.brand, search) ||
        matchesQuery(p.sku, search) ||
        matchesQuery(p.company?.name, search) ||
        matchesQuery(machineLabel(p), search) ||
        matchesQuery(p.machineReplacement?.[0]?.contract?.customer?.name, search) ||
        matchesQuery(p.machineReplacement?.[0]?.contract?.contractNumber, search) ||
        matchesQuery(CONDITION_LABELS[p.condition || ""], search))
  );

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
    setLoading(true);
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
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchData, ["trade-ins", "products", "inventory"]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error);
      // A returned machine always has stock and a movement row against it, so
      // the server archives it rather than deleting. Dropping the row locally
      // would leave it back on screen after a refresh, so say what happened.
      if (data?.archived) {
        setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: false } : p)));
        toastSuccess("المنتج مرتبط بمخزون فتم إيقافه بدل حذفه للحفاظ على السجل");
      } else {
        setProducts((prev) => prev.filter((p) => p.id !== id));
        toastSuccess("تم حذف المنتج بنجاح");
      }
      refresh();
      notifyDataChanged(["trade-ins", "products", "inventory"]);
    } catch (e) {
      toastError(e instanceof Error && e.message ? e.message : "فشل في حذف المنتج");
    }
  };

  const exportData = () => ({
    headers: ["الاسم", "الرقم التسلسلي", "الحالة", "قيمة الاستبدال", "المستودع", "الكمية", "العميل السابق", "العقد", "الشركة", "النوع", "التاريخ"],
    rows: filtered.map((p) => [
      p.name,
      machineLabel(p),
      CONDITION_LABELS[p.condition || ""] || "—",
      String(p.tradeInValue ?? 0),
      mainWarehouseOf(p)?.name || "",
      String(stockOf(p)),
      p.machineReplacement?.[0]?.contract?.customer?.name || "",
      p.machineReplacement?.[0]?.contract?.contractNumber || "",
      p.company?.name || "",
      p.productType === "MACHINE" ? "ماكينة" : "قطعة غيار",
      new Date(p.createdAt).toISOString().slice(0, 10),
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
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">{filtered.length} منتج</span>
        </div>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("tradeIns.total"), value: stats.total.toLocaleString("ar-EG"), icon: <Package size={18} />, tone: "sky" },
          { label: t("tradeIns.stockTotal"), value: stats.stockUnits.toLocaleString("ar-EG"), icon: <Boxes size={18} />, tone: "violet" },
          { label: t("tradeIns.totalValue"), value: `${stats.totalValue.toLocaleString("ar-EG")} ج.م`, icon: <Wallet size={18} />, tone: "emerald" },
          { label: t("tradeIns.active"), value: stats.active.toLocaleString("ar-EG"), icon: <CircleCheck size={18} />, tone: "green" },
          { label: t("tradeIns.classified"), value: stats.classified.toLocaleString("ar-EG"), icon: <Tag size={18} />, tone: "purple" },
        ]}
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:row-span-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="بحث..." />
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <FilterSelect value={companyFilter} onChange={setCompanyFilter} options={companies.map((c) => ({ value: c.id, label: c.name }))} allLabel={t("tradeIns.holdingCompany")} className="w-full sm:w-48" />
          <FilterSelect value={conditionFilter} onChange={setConditionFilter} options={[
            { value: "excellent", label: "ممتاز" },
            { value: "good", label: "جيد" },
            { value: "fair", label: "مقبول" },
            { value: "poor", label: "ضعيف" },
          ]} allLabel="الكل" className="w-full sm:w-40" />
          <RefreshButton onRefresh={refresh} refreshing={refreshing} />
          <ExportButton filename="products-trade-in" getExport={exportData} />
        </div>
      </div>

      {/* A replacement always lands in the receiving company's own main
          warehouse, so say where the stock is rather than leaving it implicit. */}
      <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <Warehouse size={14} className="mt-0.5 shrink-0" />
        {t("tradeIns.companyRoutingHint")}
      </p>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-start text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">المنتج</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">الرقم التسلسلي</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">الحالة</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">قيمة الاستبدال</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">{t("tradeIns.warehouse")}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">{t("tradeIns.stock")}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">مستبدلة من</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">{t("tradeIns.holdingCompany")}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500">
                    {filtered.length === 0 ? "لا توجد منتجات استبدال" : "لا توجد نتائج مطابقة"}
                  </td>
                </tr>
              ) : (
                paged.map((product) => {
                  const stock = stockOf(product);
                  const contract = product.machineReplacement?.[0]?.contract;
                  return (
                  <tr key={product.id} className="transition hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{product.name}</div>
                      {product.brand && <div className="text-xs text-gray-500 mt-0.5">{product.brand}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {machineLabel(product) || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        product.condition === "excellent" ? "bg-green-100 text-green-800" :
                        product.condition === "good" ? "bg-blue-100 text-blue-800" :
                        product.condition === "fair" ? "bg-yellow-100 text-yellow-800" :
                        product.condition === "poor" ? "bg-red-100 text-red-800" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        {CONDITION_LABELS[product.condition || ""] || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-amber-600">{(product.tradeInValue || 0).toLocaleString("ar-EG")} ج.م</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{mainWarehouseOf(product)?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        stock > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                      }`}>
                        {stock > 0 ? `${stock} — ${t("tradeIns.inStock")}` : t("tradeIns.outOfStock")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {contract ? (
                        <>
                          <div className="font-medium text-slate-800">{contract.customer?.name || "—"}</div>
                          <div className="text-xs text-gray-500">{contract.contractNumber}</div>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{product.company?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setShowView(product)} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-100" title="عرض">
                          <RotateCcw size={14} />
                        </button>
                        <button onClick={() => handleDelete(product.id)} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100" title="حذف">
                          <X size={14} />
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
        {totalPages > 1 && <div className="border-t border-gray-100 px-4 py-3"><Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} /></div>}
      </div>

      {/* View Modal */}
      {showView && (
        <FormModal open={!!showView} onClose={() => setShowView(null)} title="تفاصيل منتج الاستبدال">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div><span className="text-xs font-medium text-gray-500">اسم المنتج</span><p className="mt-1 text-sm font-medium text-slate-900">{showView.name}</p></div>
              <div><span className="text-xs font-medium text-gray-500">الرقم التسلسلي للماكينة</span><p className="mt-1 font-mono text-sm text-slate-900">{machineLabel(showView) || "—"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">الحالة</span><p className="mt-1 text-sm text-slate-900">{CONDITION_LABELS[showView.condition || ""] || "—"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">قيمة الاستبدال</span><p className="mt-1 text-lg font-bold text-amber-600">{(showView.tradeInValue || 0).toLocaleString("ar-EG")} ج.م</p></div>
              <div><span className="text-xs font-medium text-gray-500">النوع</span><p className="mt-1 text-sm text-slate-900">{showView.productType === "MACHINE" ? "ماكينة" : "قطعة غيار"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">{t("tradeIns.holdingCompany")}</span><p className="mt-1 text-sm text-slate-900">{showView.company?.name || "—"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">{t("tradeIns.warehouse")}</span><p className="mt-1 text-sm text-slate-900">{mainWarehouseOf(showView)?.name || "—"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">{t("tradeIns.stock")}</span><p className="mt-1 text-sm font-semibold text-slate-900">{stockOf(showView)}</p></div>
              <div><span className="text-xs font-medium text-gray-500">العميل السابق</span><p className="mt-1 text-sm text-slate-900">{showView.machineReplacement?.[0]?.contract?.customer?.name || "—"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">العقد</span><p className="mt-1 text-sm text-slate-900">{showView.machineReplacement?.[0]?.contract?.contractNumber || "—"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">الحالة النشطة</span><p className="mt-1 text-sm text-slate-900">{showView.isActive ? "نشط" : "غير نشط"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">تاريخ الإضافة</span><p className="mt-1 text-sm text-slate-900"><DateTimeCell value={showView.createdAt} /></p></div>
            </div>
          </div>
        </FormModal>
      )}
    </div>
  );
}
