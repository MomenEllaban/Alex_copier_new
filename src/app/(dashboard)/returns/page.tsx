"use client";

import { useEffect, useMemo, useState } from "react";
import { AddFormBoundary, useAutoAddForm } from "@/hooks/useAutoAddForm";
import { Plus, RotateCcw, Trash2, Pencil, Eye, Save, Undo2, BadgeCheck, Ban } from "lucide-react";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import CompanyTabs from "@/components/CompanyTabs";
import FormModal from "@/components/FormModal";
import SearchableSelect from "@/components/SearchableSelect";
import PrintMenu from "@/components/PrintMenu";
import PrinterLoader from "@/components/PrinterLoader";
import { useI18n } from "@/i18n/context";
import { useToast, useConfirm } from "@/components/UIProvider";
import SubmitButton from "@/components/SubmitButton";
import { DateTimeCell } from "@/components/DateTimeCell";
import ExportButton from "@/components/ExportButton";
import Pagination from "@/components/Pagination";
import RefreshButton from "@/components/RefreshButton";
import StatsCards from "@/components/StatsCards";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Company { id: string; name: string; nameAr?: string; }
interface Customer { id: string; name: string; }
interface Supplier { id: string; name: string; }
interface Product { id: string; name: string; pricingTiers?: Record<string, number | null> | null; }
interface Warehouse { id: string; name: string; companyId: string; }

interface ReturnOption {
  id: string;
  name: string;
  companyName?: string | null;
  phone?: string | null;
  sku?: string | null;
  stock?: number;
  purchasePrice?: number | null;
  wholesalePrice?: number | null;
  retailPrice?: number | null;
}

interface ReturnOptions {
  customers: ReturnOption[];
  suppliers: ReturnOption[];
  products: ReturnOption[];
}

interface ReturnLine {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
}

interface ReturnRecord {
  id: string;
  companyId: string;
  type: string;
  status: string;
  quantity: number;
  unitPrice: number;
  total: number;
  reason: string | null;
  priceTier: string | null;
  createdAt: string;
  customerId?: string | null;
  supplierId?: string | null;
  warehouseId?: string | null;
  productId: string;
  salesOrderId?: string | null;
  salesOrderItemId?: string | null;
  purchaseOrderId?: string | null;
  purchaseOrderItemId?: string | null;
  company?: Company;
  customer?: Customer | null;
  supplier?: Supplier | null;
  product?: Product | null;
  warehouse?: Warehouse | null;
  salesOrder?: { id: string } | null;
  salesOrderItem?: { id: string; unitPrice: number; quantity: number } | null;
  purchaseOrder?: { id: string } | null;
  purchaseOrderItem?: { id: string; unitPrice: number; quantity: number } | null;
}

const RETURN_TYPE_LABELS: Record<string, string> = {
  SALE_RETURN: "مرتجع مبيعات",
  PURCHASE_RETURN: "مرتجع مشتريات",
};

const RETURN_STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد الانتظار",
  APPROVED: "موافق عليه",
  REJECTED: "مرفوض",
  COMPLETED: "مكتمل",
};

const statusClasses: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-red-100 text-red-800",
  COMPLETED: "bg-green-100 text-green-800",
};

export default function ReturnsPage() {
  const { t, dir } = useI18n();
  const { success: toastSuccess, error: toastError } = useToast();
  const confirmAction = useConfirm();
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [options, setOptions] = useState<ReturnOptions>({ customers: [], suppliers: [], products: [] });
  const [optionsLoading, setOptionsLoading] = useState(false);

  const [form, setForm] = useState({
    companyId: "",
    type: "SALE_RETURN" as "SALE_RETURN" | "PURCHASE_RETURN",
    customerId: "",
    supplierId: "",
    reason: "",
  });

  const [lines, setLines] = useState<ReturnLine[]>([
    { key: "line-1", productId: "", quantity: "1", unitPrice: "" },
  ]);

  const [viewingReturn, setViewingReturn] = useState<ReturnRecord | null>(null);
  const [editingReturn, setEditingReturn] = useState<ReturnRecord | null>(null);

  const fetchData = async () => {
    try {
      const [returnsRes, companiesRes] = await Promise.all([
        fetch("/api/returns"),
        fetch("/api/companies"),
      ]);

      const returnData = await returnsRes.json();
      const companiesData = await companiesRes.json();

      setReturns(Array.isArray(returnData) ? returnData : []);
      setCompanies(Array.isArray(companiesData) ? companiesData : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchData, ["returns", "sales", "purchases", "customers", "suppliers", "products", "inventory"]);

  useAutoAddForm(() => setShowForm(true));

  const fetchOptions = async (companyId: string) => {
    if (!companyId) {
      setOptions({ customers: [], suppliers: [], products: [] });
      return;
    }
    setOptionsLoading(true);
    try {
      const res = await fetch(`/api/returns/options?companyId=${encodeURIComponent(companyId)}`);
      const data = await res.json();
      setOptions({
        customers: Array.isArray(data?.customers) ? data.customers : [],
        suppliers: Array.isArray(data?.suppliers) ? data.suppliers : [],
        products: Array.isArray(data?.products) ? data.products : [],
      });
    } catch {
      setOptions({ customers: [], suppliers: [], products: [] });
    } finally {
      setOptionsLoading(false);
    }
  };

  const handleTypeChange = (type: "SALE_RETURN" | "PURCHASE_RETURN") => {
    setForm((prev) => ({ ...prev, type, customerId: "", supplierId: "" }));
  };

  const handleCompanyChange = (companyId: string) => {
    setForm((prev) => ({ ...prev, companyId, customerId: "", supplierId: "" }));
    void fetchOptions(companyId);
  };

  const updateLine = (key: string, patch: Partial<ReturnLine>) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const handleProductChange = (key: string, productId: string) => {
    const product = options.products.find((p) => p.id === productId);
    const suggested =
      form.type === "SALE_RETURN"
        ? product?.retailPrice ?? product?.wholesalePrice ?? 0
        : product?.purchasePrice ?? product?.wholesalePrice ?? 0;
    updateLine(key, { productId, unitPrice: String(suggested ?? 0) });
  };

  const filteredReturns = useMemo(() => {
    return returns.filter((item) => {
      const matchesType = !typeFilter || item.type === typeFilter;
      const matchesCompany = !companyFilter || item.companyId === companyFilter;
      const customerName = item.customer?.name ?? "";
      const supplierName = item.supplier?.name ?? "";
      const productName = item.product?.name ?? "";
      const orderNum = item.salesOrder?.id ?? "";
      const purchaseOrderNum = item.purchaseOrder?.id ?? "";
      return matchesType && matchesCompany && (
        matchesQuery(customerName, search) ||
        matchesQuery(supplierName, search) ||
        matchesQuery(productName, search) ||
        matchesQuery(orderNum, search) ||
        matchesQuery(purchaseOrderNum, search) ||
        matchesQuery(item.reason ?? "", search) ||
        matchesQuery(RETURN_TYPE_LABELS[item.type] ?? item.type, search)
      );
    });
  }, [returns, search, typeFilter, companyFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredReturns.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedReturns = filteredReturns.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportReturns = () => ({
    headers: [
      t("common.type"),
      t("common.company"),
      t("common.product"),
      t("returns.customerSupplier"),
      t("returns.quantity"),
      t("returns.unitPrice"),
      t("returns.total"),
      t("common.status"),
    ],
    rows: filteredReturns.map((item) => [
      RETURN_TYPE_LABELS[item.type] || item.type,
      item.company?.nameAr || item.company?.name || "",
      item.product?.name || "",
      item.customer?.name || item.supplier?.name || "",
      String(item.quantity),
      String(item.unitPrice),
      String(item.total),
      RETURN_STATUS_LABELS[item.status] || item.status,
    ]),
  });

  const totals = useMemo(() => {
    const saleReturns = returns.filter((i) => i.type === "SALE_RETURN").length;
    const purchaseReturns = returns.filter((i) => i.type === "PURCHASE_RETURN").length;
    const totalValue = returns.reduce((sum, i) => sum + Number(i.total || 0), 0);
    return { saleReturns, purchaseReturns, totalValue };
  }, [returns]);

  const formTotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const partyId = form.type === "SALE_RETURN" ? form.customerId : form.supplierId;
    if (!form.companyId || !partyId) {
      toastError(form.type === "SALE_RETURN" ? "يرجى اختيار الشركة والعميل" : "يرجى اختيار الشركة والمورد");
      return;
    }
    if (lines.length === 0 || lines.some((line) => !line.productId)) {
      toastError("يرجى اختيار منتج لكل سطر من المرتجع");
      return;
    }
    if (lines.some((line) => !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0)) {
      toastError("الكمية يجب أن تكون عددًا صحيحًا أكبر من صفر");
      return;
    }
    if (lines.some((line) => !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0)) {
      toastError("السعر غير صالح");
      return;
    }
    if (form.type === "PURCHASE_RETURN") {
      for (const line of lines) {
        const product = options.products.find((p) => p.id === line.productId);
        if (product && Number(line.quantity) > (product.stock ?? 0)) {
          toastError(`الكمية المتاحة للمنتج ${product.name} هي ${product.stock ?? 0}`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const payload = {
        companyId: form.companyId,
        type: form.type,
        ...(form.type === "SALE_RETURN" ? { customerId: form.customerId } : { supplierId: form.supplierId }),
        reason: form.reason,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
        })),
      };
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        toastError(data?.error || "تعذر تسجيل المرتجع");
        return;
      }

      setShowForm(false);
      resetForm();
      refresh();
      notifyDataChanged(["returns", "sales", "purchases", "customers", "suppliers", "products", "inventory"]);
      toastSuccess("تم تسجيل المرتجع بنجاح");
    } catch {
      toastError("حدث خطأ أثناء تسجيل المرتجع");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("common.deleteConfirm") }))) return;
    try {
      const res = await fetch(`/api/returns/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toastError(data?.error || "تعذر الحذف");
        return;
      }
      refresh();
      notifyDataChanged(["returns", "sales", "purchases", "customers", "suppliers", "products", "inventory"]);
      toastSuccess("تم الحذف بنجاح");
    } catch {
      toastError("حدث خطأ أثناء الحذف");
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/returns/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        toastError(data?.error || "تعذر التحديث");
        return;
      }
      refresh();
      notifyDataChanged(["returns", "sales", "purchases", "customers", "suppliers", "products", "inventory"]);
      toastSuccess("تم التحديث بنجاح");
    } catch {
      toastError("حدث خطأ أثناء التحديث");
    }
  };

  const resetForm = () => {
    setForm({ companyId: "", type: "SALE_RETURN", customerId: "", supplierId: "", reason: "" });
    setOptions({ customers: [], suppliers: [], products: [] });
    setLines([{ key: `line-${Date.now()}`, productId: "", quantity: "1", unitPrice: "" }]);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-violet-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{t("returns.title")}</h1>
        </div>
        <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700">
          <Plus size={16} />
          {t("returns.addReturn")}
        </button>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("returns.totalReturns"), value: returns.length.toLocaleString("ar-EG"), icon: <Undo2 size={18} />, tone: "violet" },
          { label: t("returns.salesReturns"), value: totals.saleReturns.toLocaleString("ar-EG"), icon: <BadgeCheck size={18} />, tone: "green" },
          { label: t("returns.purchaseReturns"), value: totals.purchaseReturns.toLocaleString("ar-EG"), icon: <Ban size={18} />, tone: "rose" },
          { label: t("returns.totalValue"), value: `${totals.totalValue.toLocaleString("ar-EG")} ج.م`, icon: <RotateCcw size={18} />, tone: "amber" },
        ]}
      />

      <CompanyTabs
        companies={companies}
        value={companyFilter}
        onChange={(v) => { setCompanyFilter(v); setPage(1); }}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:flex-wrap">
          <div className="w-full lg:flex-1 lg:max-w-80">
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t("returns.searchPlaceholder")} className="w-full" />
          </div>
          <div className="flex gap-2 md:ms-auto">
            <FilterSelect
              value={typeFilter}
              onChange={(v) => { setTypeFilter(v); setPage(1); }}
              options={[
                { value: "SALE_RETURN", label: RETURN_TYPE_LABELS.SALE_RETURN },
                { value: "PURCHASE_RETURN", label: RETURN_TYPE_LABELS.PURCHASE_RETURN },
              ]}
              allLabel={`${t("returns.typeFilter")} — ${t("common.all")}`}
              className="lg:w-56"
            />
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton filename="returns" getExport={exportReturns} disabled={filteredReturns.length === 0} />
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : returns.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : filteredReturns.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.type")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.company")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.product")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("returns.customerSupplier")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("sales.orderNumber")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("returns.quantity")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("returns.unitPrice")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("returns.total")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.status")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pagedReturns.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="whitespace-nowrap rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                        {RETURN_TYPE_LABELS[item.type] || item.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">{item.company?.nameAr || item.company?.name || "—"}</td>
                    <td className="px-4 py-3">{item.product?.name || "—"}</td>
                    <td className="px-4 py-3">{item.customer?.name || item.supplier?.name || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500"><span dir="ltr">{item.salesOrder?.id?.slice(0, 8) || item.purchaseOrder?.id?.slice(0, 8) || "—"}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{item.quantity}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.unitPrice.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{item.total.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[item.status] || "bg-slate-100 text-slate-700"}`}>
                        {RETURN_STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => setViewingReturn(item)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-100" title={t("common.view")}>
                          <Eye size={14} />
                        </button>
                        <PrintMenu type="return" id={item.id} />
                        {item.status === "PENDING" && (
                          <>
                            <button onClick={() => { setEditingReturn(item); }} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-100" title={t("common.edit")}>
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDelete(item.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100" title={t("common.delete")}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filteredReturns.length > 0 && (
          <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filteredReturns.length} pageSize={PAGE_SIZE} />
        )}
      </div>

      <FormModal open={showForm} onClose={() => { setShowForm(false); resetForm(); }} title={t("returns.addReturn")} wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">{t("common.company")}</label>
              <select className={inputClass} value={form.companyId} onChange={(e) => handleCompanyChange(e.target.value)} required>
                <option value="">{t("common.selectOption")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.nameAr || c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">{t("common.type")}</label>
              <select className={inputClass} value={form.type} onChange={(e) => handleTypeChange(e.target.value as "SALE_RETURN" | "PURCHASE_RETURN")}>
                <option value="SALE_RETURN">{RETURN_TYPE_LABELS.SALE_RETURN}</option>
                <option value="PURCHASE_RETURN">{RETURN_TYPE_LABELS.PURCHASE_RETURN}</option>
              </select>
            </div>
          </div>

          {form.companyId && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                {form.type === "SALE_RETURN" ? "العميل" : "المورد"}
              </label>
              {optionsLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
                  <PrinterLoader size="sm" label={t("common.loading")} />
                </div>
              ) : (
                <SearchableSelect
                  key={`${form.companyId}-${form.type}`}
                  value={form.type === "SALE_RETURN" ? form.customerId : form.supplierId}
                  onChange={(value) =>
                    setForm((prev) =>
                      prev.type === "SALE_RETURN" ? { ...prev, customerId: value } : { ...prev, supplierId: value }
                    )
                  }
                  options={(form.type === "SALE_RETURN" ? options.customers : options.suppliers).map((party) => ({
                    value: party.id,
                    label: `${party.name}${party.companyName ? ` — ${party.companyName}` : ""}`,
                  }))}
                  placeholder={t("common.selectOption")}
                  required
                />
              )}
            </div>
          )}

          {form.companyId && !optionsLoading && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {form.type === "SALE_RETURN"
                ? "سيتم إضافة الكمية للمخزون، وخصم المبلغ من حساب الشركة، وتقليل دين العميل."
                : "سيتم خصم الكمية من المخزون، وإضافة المبلغ لحساب الشركة، وتقليل المبلغ المستحق للمورد."}
            </p>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">{t("returns.selectProduct")}</label>
              <button
                type="button"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { key: `line-${Date.now()}-${prev.length}`, productId: "", quantity: "1", unitPrice: "" },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
              >
                <Plus size={14} />
                إضافة منتج
              </button>
            </div>

            {lines.map((line, index) => (
              <div key={line.key} className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-gray-600">المنتج {index + 1}</label>
                  <SearchableSelect
                    value={line.productId}
                    onChange={(value) => handleProductChange(line.key, value)}
                    options={options.products.map((p) => ({
                      value: p.id,
                      label: `${p.name}${p.sku ? ` — ${p.sku}` : ""} — متوفر ${p.stock ?? 0}`,
                    }))}
                    disabledValues={lines.filter((other) => other.key !== line.key && other.productId).map((other) => other.productId)}
                    placeholder={t("common.selectOption")}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-gray-600">{t("returns.quantity")}</label>
                  <input type="number" min={1} className={inputClass} value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-gray-600">{t("returns.unitPrice")}</label>
                  <input type="number" min={0} step="0.01" className={inputClass} value={line.unitPrice} onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })} placeholder="0.00" required />
                </div>
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((row) => row.key !== line.key))}
                  disabled={lines.length === 1}
                  className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                  title={t("common.delete")}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-600">{t("returns.total")}</span>
            <span className="text-lg font-bold text-slate-900">{formTotal.toLocaleString()}</span>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">{t("common.notes")}</label>
            <textarea rows={3} className={inputClass} value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder={t("returns.reasonPlaceholder")} />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {t("common.cancel")}
            </button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-violet-600 hover:bg-violet-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      <FormModal open={!!viewingReturn} onClose={() => setViewingReturn(null)} title={t("returns.returnDetails")}>
        {viewingReturn && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("common.type")}</span><span className="mt-1 block font-medium">{RETURN_TYPE_LABELS[viewingReturn.type]}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("common.company")}</span><span className="mt-1 block font-medium">{viewingReturn.company?.nameAr || viewingReturn.company?.name}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("common.product")}</span><span className="mt-1 block font-medium">{viewingReturn.product?.name}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("returns.customerSupplier")}</span><span className="mt-1 block font-medium">{viewingReturn.customer?.name || viewingReturn.supplier?.name || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("returns.orderRef")}</span><span className="mt-1 block font-medium">{viewingReturn.salesOrder?.id?.slice(0, 8) || viewingReturn.purchaseOrder?.id?.slice(0, 8) || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("returns.quantity")}</span><span className="mt-1 block font-medium">{viewingReturn.quantity}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("returns.unitPrice")}</span><span className="mt-1 block font-medium">{viewingReturn.unitPrice.toLocaleString()}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("returns.total")}</span><span className="mt-1 block font-bold">{viewingReturn.total.toLocaleString()}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("common.status")}</span><span className={`mt-1 block rounded-full px-2 py-0.5 text-xs font-medium inline-block w-fit ${statusClasses[viewingReturn.status]}`}>{RETURN_STATUS_LABELS[viewingReturn.status]}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("common.date")}</span><span className="mt-1 block font-medium"><DateTimeCell value={viewingReturn.createdAt} /></span></div>
            </div>
            {viewingReturn.reason && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm"><span className="block text-xs text-gray-500 mb-1">{t("common.notes")}</span><p>{viewingReturn.reason}</p></div>
            )}
            <div className="flex justify-end">
              <button onClick={() => setViewingReturn(null)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">{t("common.close")}</button>
            </div>
          </div>
        )}
      </FormModal>

      <FormModal open={!!editingReturn} onClose={() => setEditingReturn(null)} title={t("returns.editReturn")}>
        {editingReturn && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <p><span className="text-gray-500">{t("common.product")}:</span> <span className="font-medium">{editingReturn.product?.name}</span></p>
              <p><span className="text-gray-500">{t("returns.quantity")}:</span> <span className="font-medium">{editingReturn.quantity}</span></p>
              <p><span className="text-gray-500">{t("returns.total")}:</span> <span className="font-bold">{editingReturn.total.toLocaleString()}</span></p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">{t("common.status")}</label>
              <select className={inputClass} defaultValue={editingReturn.status} id="edit-status">
                <option value="PENDING">{RETURN_STATUS_LABELS.PENDING}</option>
                <option value="APPROVED">{RETURN_STATUS_LABELS.APPROVED}</option>
                <option value="REJECTED">{RETURN_STATUS_LABELS.REJECTED}</option>
                <option value="COMPLETED">{RETURN_STATUS_LABELS.COMPLETED}</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button onClick={() => setEditingReturn(null)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">{t("common.cancel")}</button>
              <button onClick={async () => {
                const status = (document.getElementById("edit-status") as HTMLSelectElement)?.value;
                if (status) await handleStatusChange(editingReturn.id, status);
                setEditingReturn(null);
              }} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">{t("common.save")}</button>
            </div>
          </div>
        )}
      </FormModal>
    </div>
  );
}
