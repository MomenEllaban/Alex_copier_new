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
import { RotateCcw, Save, X, Package, Wallet, CircleCheck, Tag } from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import StatsCards from "@/components/StatsCards";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Company {
  id: string;
  name: string;
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
  isActive: boolean;
  createdAt: string;
}

const CONDITION_LABELS: Record<string, string> = {
  excellent: "ممتاز",
  good: "جيد",
  fair: "مقبول",
  poor: "ضعيف",
};

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
        matchesQuery(p.company?.name, search) ||
        matchesQuery(CONDITION_LABELS[p.condition || ""], search))
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    const totalValue = products.reduce((sum, p) => sum + (p.tradeInValue || 0), 0);
    return {
      total: products.length,
      totalValue,
      active: products.filter((p) => p.isActive).length,
      classified: products.filter((p) => Boolean(p.condition)).length,
    };
  }, [products]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch("/api/products?tradeIn=true"),
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
      if (!res.ok) throw new Error();
      setProducts((prev) => prev.filter((p) => p.id !== id));
      refresh();
      notifyDataChanged(["trade-ins", "products", "inventory"]);
      toastSuccess("تم حذف المنتج بنجاح");
    } catch {
      toastError("فشل في حذف المنتج");
    }
  };

  const exportData = () => ({
    headers: ["الاسم", "الماركة", "الحالة", "قيمة الاستبدال", "الشركة", "النوع", "التاريخ"],
    rows: filtered.map((p) => [
      p.name,
      p.brand || "—",
      CONDITION_LABELS[p.condition || ""] || "—",
      String(p.tradeInValue ?? 0),
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
          { label: t("tradeIns.totalValue"), value: `${stats.totalValue.toLocaleString("ar-EG")} ج.م`, icon: <Wallet size={18} />, tone: "emerald" },
          { label: t("tradeIns.active"), value: stats.active.toLocaleString("ar-EG"), icon: <CircleCheck size={18} />, tone: "green" },
          { label: t("tradeIns.classified"), value: stats.classified.toLocaleString("ar-EG"), icon: <Tag size={18} />, tone: "purple" },
        ]}
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="بحث..." />
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <FilterSelect value={companyFilter} onChange={setCompanyFilter} options={companies.map((c) => ({ value: c.id, label: c.name }))} allLabel="الكل" className="w-full sm:w-48" />
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

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500">إجمالي المنتجات</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{filtered.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500">إجمالي القيمة</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{filtered.reduce((sum, p) => sum + (p.tradeInValue || 0), 0).toLocaleString("ar-EG")} ج.م</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500">متوسط القيمة</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {filtered.length > 0 ? Math.round(filtered.reduce((sum, p) => sum + (p.tradeInValue || 0), 0) / filtered.length).toLocaleString("ar-EG") : 0} ج.م
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-start text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">المنتج</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">الماركة</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">الحالة</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">قيمة الاستبدال</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">الشركة</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">التاريخ</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-500">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                    {filtered.length === 0 ? "لا توجد منتجات استبدال" : "لا توجد نتائج مطابقة"}
                  </td>
                </tr>
              ) : (
                paged.map((product) => (
                  <tr key={product.id} className="transition hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{product.name}</div>
                      {product.description && <div className="text-xs text-gray-500 mt-0.5">{product.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{product.brand || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        product.condition === "excellent" ? "bg-green-100 text-green-800" :
                        product.condition === "good" ? "bg-blue-100 text-blue-800" :
                        product.condition === "fair" ? "bg-yellow-100 text-yellow-800" :
                        "bg-red-100 text-red-800"
                      }`}>
                        {CONDITION_LABELS[product.condition || ""] || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-amber-600">{(product.tradeInValue || 0).toLocaleString("ar-EG")} ج.م</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{product.company?.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500"><DateTimeCell value={product.createdAt} /></td>
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
                ))
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
              <div><span className="text-xs font-medium text-gray-500">الماركة</span><p className="mt-1 text-sm text-slate-900">{showView.brand || "—"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">الحالة</span><p className="mt-1 text-sm text-slate-900">{CONDITION_LABELS[showView.condition || ""] || "—"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">قيمة الاستبدال</span><p className="mt-1 text-lg font-bold text-amber-600">{(showView.tradeInValue || 0).toLocaleString("ar-EG")} ج.م</p></div>
              <div><span className="text-xs font-medium text-gray-500">النوع</span><p className="mt-1 text-sm text-slate-900">{showView.productType === "MACHINE" ? "ماكينة" : "قطعة غيار"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">الشركة</span><p className="mt-1 text-sm text-slate-900">{showView.company?.name || "—"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">الحالة النشطة</span><p className="mt-1 text-sm text-slate-900">{showView.isActive ? "نشط" : "غير نشط"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">تاريخ الإضافة</span><p className="mt-1 text-sm text-slate-900"><DateTimeCell value={showView.createdAt} /></p></div>
            </div>
          </div>
        </FormModal>
      )}
    </div>
  );
}
