"use client";

import { useEffect, useMemo, useState } from "react";
import { AddFormBoundary, useAutoAddForm } from "@/hooks/useAutoAddForm";
import { Plus, RotateCcw, ArrowDownLeft, ArrowUpRight, Trash2, Pencil, Eye, Save } from "lucide-react";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
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
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Company { id: string; name: string; nameAr?: string; }
interface Customer { id: string; name: string; }
interface Supplier { id: string; name: string; }
interface Product { id: string; name: string; pricingTiers?: Record<string, number | null> | null; }
interface Warehouse { id: string; name: string; companyId: string; }

interface SalesOrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  product?: Product | null;
}

interface SalesOrder {
  id: string;
  orderNumber?: string;
  customerId: string;
  total: number;
  orderDate: string;
  customer?: Customer | null;
  items: SalesOrderItem[];
}

interface PurchaseOrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  product?: Product | null;
}

interface PurchaseOrder {
  id: string;
  supplierId: string;
  total: number;
  orderDate: string;
  supplier?: Supplier | null;
  items: PurchaseOrderItem[];
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [salesOrdersLoading, setSalesOrdersLoading] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseOrdersLoading, setPurchaseOrdersLoading] = useState(false);

  const [form, setForm] = useState({
    companyId: "",
    type: "SALE_RETURN" as "SALE_RETURN" | "PURCHASE_RETURN",
    salesOrderId: "",
    salesOrderItemId: "",
    purchaseOrderId: "",
    purchaseOrderItemId: "",
    quantity: "1",
    reason: "",
  });

  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [selectedItem, setSelectedItem] = useState<SalesOrderItem | null>(null);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [selectedPurchaseItem, setSelectedPurchaseItem] = useState<PurchaseOrderItem | null>(null);

  const [viewingReturn, setViewingReturn] = useState<ReturnRecord | null>(null);
  const [editingReturn, setEditingReturn] = useState<ReturnRecord | null>(null);

  const fetchData = async () => {
    try {
      const [returnsRes, companiesRes, customersRes, suppliersRes] = await Promise.all([
        fetch("/api/returns"),
        fetch("/api/companies"),
        fetch("/api/customers"),
        fetch("/api/suppliers"),
      ]);

      const returnData = await returnsRes.json();
      const companiesData = await companiesRes.json();
      const customersData = await customersRes.json();
      const suppliersData = await suppliersRes.json();

      setReturns(Array.isArray(returnData) ? returnData : []);
      setCompanies(Array.isArray(companiesData) ? companiesData : []);
      setCustomers(Array.isArray(customersData) ? customersData : []);
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchData, ["returns", "sales", "purchases", "customers", "suppliers", "products", "inventory"]);

  const autoAddOpen = useAutoAddForm();
  useEffect(() => {
    if (autoAddOpen) setShowForm(true);
  }, [autoAddOpen]);

  const fetchSalesOrders = async (companyId: string) => {
    setSalesOrdersLoading(true);
    try {
      const res = await fetch(`/api/returns/sales-orders?companyId=${companyId}`);
      const data = await res.json();
      setSalesOrders(Array.isArray(data) ? data : []);
    } catch {
      setSalesOrders([]);
    } finally {
      setSalesOrdersLoading(false);
    }
  };

  const fetchPurchaseOrders = async (companyId: string) => {
    setPurchaseOrdersLoading(true);
    try {
      const res = await fetch(`/api/returns/purchase-orders?companyId=${companyId}`);
      const data = await res.json();
      setPurchaseOrders(Array.isArray(data) ? data : []);
    } catch {
      setPurchaseOrders([]);
    } finally {
      setPurchaseOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (form.companyId && form.type === "SALE_RETURN") {
      fetchSalesOrders(form.companyId);
      setPurchaseOrders([]);
    } else if (form.companyId && form.type === "PURCHASE_RETURN") {
      fetchPurchaseOrders(form.companyId);
      setSalesOrders([]);
    } else {
      setSalesOrders([]);
      setPurchaseOrders([]);
    }
    setForm((prev) => ({ ...prev, salesOrderId: "", salesOrderItemId: "", purchaseOrderId: "", purchaseOrderItemId: "" }));
    setSelectedOrder(null);
    setSelectedItem(null);
    setSelectedPurchaseOrder(null);
    setSelectedPurchaseItem(null);
  }, [form.companyId, form.type]);

  useEffect(() => {
    if (form.salesOrderId) {
      const order = salesOrders.find((o) => o.id === form.salesOrderId);
      setSelectedOrder(order || null);
    } else {
      setSelectedOrder(null);
    }
    setForm((prev) => ({ ...prev, salesOrderItemId: "" }));
    setSelectedItem(null);
  }, [form.salesOrderId, salesOrders]);

  useEffect(() => {
    if (form.salesOrderItemId && selectedOrder) {
      const item = selectedOrder.items.find((i) => i.id === form.salesOrderItemId);
      setSelectedItem(item || null);
    } else {
      setSelectedItem(null);
    }
  }, [form.salesOrderItemId, selectedOrder]);

  useEffect(() => {
    if (form.purchaseOrderId) {
      const order = purchaseOrders.find((o) => o.id === form.purchaseOrderId);
      setSelectedPurchaseOrder(order || null);
    } else {
      setSelectedPurchaseOrder(null);
    }
    setForm((prev) => ({ ...prev, purchaseOrderItemId: "" }));
    setSelectedPurchaseItem(null);
  }, [form.purchaseOrderId, purchaseOrders]);

  useEffect(() => {
    if (form.purchaseOrderItemId && selectedPurchaseOrder) {
      const it = selectedPurchaseOrder.items.find((i) => i.id === form.purchaseOrderItemId);
      setSelectedPurchaseItem(it || null);
    } else {
      setSelectedPurchaseItem(null);
    }
  }, [form.purchaseOrderItemId, selectedPurchaseOrder]);

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

  const availableQuantity = useMemo(() => {
    if (form.type === "SALE_RETURN") {
      if (!selectedOrder || !selectedItem) return 0;
      const existingReturns = returns.filter(
        (r) => r.salesOrderId === selectedOrder.id && r.salesOrderItemId === selectedItem.id && r.status !== "REJECTED"
      );
      const totalReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);
      return selectedItem.quantity - totalReturned;
    }
    if (!selectedPurchaseOrder || !selectedPurchaseItem) return 0;
    const existingReturns = returns.filter(
      (r) => r.purchaseOrderId === selectedPurchaseOrder.id && r.purchaseOrderItemId === selectedPurchaseItem.id && r.status !== "REJECTED"
    );
    const totalReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);
    return selectedPurchaseItem.quantity - totalReturned;
  }, [form.type, selectedOrder, selectedItem, selectedPurchaseOrder, selectedPurchaseItem, returns]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.type === "SALE_RETURN") {
      if (!form.companyId || !form.salesOrderId || !form.salesOrderItemId) {
        toastError("يرجى اختيار الشركة وفاتورة البيع والمنتج");
        return;
      }
    } else {
      if (!form.companyId || !form.purchaseOrderId || !form.purchaseOrderItemId) {
        toastError("يرجى اختيار الشركة وفاتورة الشراء والمنتج");
        return;
      }
    }

    const qty = Number(form.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      toastError("الكمية يجب أن تكون عددًا صحيحًا أكبر من صفر");
      return;
    }

    if (qty > availableQuantity) {
      toastError(`الكمية المتاحة للمرتجع هي ${availableQuantity}`);
      return;
    }

    setSaving(true);
    try {
      const payload =
        form.type === "SALE_RETURN"
          ? {
              type: form.type,
              salesOrderId: form.salesOrderId,
              salesOrderItemId: form.salesOrderItemId,
              quantity: qty,
              reason: form.reason,
            }
          : {
              type: form.type,
              purchaseOrderId: form.purchaseOrderId,
              purchaseOrderItemId: form.purchaseOrderItemId,
              quantity: qty,
              reason: form.reason,
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
    setForm({ companyId: "", type: "SALE_RETURN", salesOrderId: "", salesOrderItemId: "", purchaseOrderId: "", purchaseOrderItemId: "", quantity: "1", reason: "" });
    setSelectedOrder(null);
    setSelectedItem(null);
    setSelectedPurchaseOrder(null);
    setSelectedPurchaseItem(null);
    setSalesOrders([]);
    setPurchaseOrders([]);
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{t("returns.totalReturns")}</p>
            <RotateCcw className="text-violet-600" size={18} />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{returns.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{t("returns.salesReturns")}</p>
            <ArrowDownLeft className="text-emerald-600" size={18} />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{totals.saleReturns}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{t("returns.totalValue")}</p>
            <ArrowUpRight className="text-amber-600" size={18} />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{totals.totalValue.toLocaleString()}</p>
        </div>
      </div>

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
            <FilterSelect
              value={companyFilter}
              onChange={(v) => { setCompanyFilter(v); setPage(1); }}
              options={companies.map((c) => ({ value: c.id, label: c.nameAr || c.name }))}
              allLabel={`${t("common.company")} — ${t("common.all")}`}
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
              <label className="block text-sm font-medium text-gray-700">{t("common.type")}</label>
              <select className={inputClass} value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as "SALE_RETURN" | "PURCHASE_RETURN" }))}>
                <option value="SALE_RETURN">{RETURN_TYPE_LABELS.SALE_RETURN}</option>
                <option value="PURCHASE_RETURN">{RETURN_TYPE_LABELS.PURCHASE_RETURN}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">{t("common.company")}</label>
              <select className={inputClass} value={form.companyId} onChange={(e) => setForm((prev) => ({ ...prev, companyId: e.target.value }))} required>
                <option value="">{t("common.selectOption")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.nameAr || c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {form.type === "SALE_RETURN" && form.companyId && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">{t("returns.selectSalesOrder")}</label>
              {salesOrdersLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
                  <PrinterLoader size="sm" label={t("common.loading")} />
                </div>
              ) : (
                <SearchableSelect value={form.salesOrderId} onChange={(v) => setForm((prev) => ({ ...prev, salesOrderId: v }))} options={salesOrders.map((order) => ({ value: order.id, label: `${order.id.slice(0, 8)} — ${order.customer?.name || ""} — ${new Date(order.orderDate).toLocaleDateString("en-GB")} ${new Date(order.orderDate).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` }))} placeholder={t("common.selectOption")} required />
              )}
            </div>
          )}

          {selectedOrder && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">{t("returns.selectProduct")}</label>
              <SearchableSelect
                value={form.salesOrderItemId}
                onChange={(v) => setForm((prev) => ({ ...prev, salesOrderItemId: v }))}
                options={selectedOrder.items.map((item) => {
                  const existingReturns = returns.filter(
                    (r) => r.salesOrderId === selectedOrder.id && r.salesOrderItemId === item.id && r.status !== "REJECTED"
                  );
                  const totalReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);
                  const available = item.quantity - totalReturned;
                  return { value: item.id, label: `${item.product?.name || item.productId} — ${item.unitPrice.toLocaleString()} — متبقي ${available}` };
                })}
                disabledValues={selectedOrder.items.filter((item) => {
                  const existingReturns = returns.filter(
                    (r) => r.salesOrderId === selectedOrder.id && r.salesOrderItemId === item.id && r.status !== "REJECTED"
                  );
                  const totalReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);
                  return item.quantity - totalReturned <= 0;
                }).map((item) => item.id)}
                placeholder={t("common.selectOption")}
                required
              />
            </div>
          )}

          {selectedItem && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 className="text-sm font-semibold text-blue-800 mb-2">{t("returns.saleDetails")}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">{t("common.product")}:</span> <span className="font-medium">{selectedItem.product?.name}</span></div>
                <div><span className="text-gray-500">{t("returns.unitPrice")}:</span> <span className="font-medium">{selectedItem.unitPrice.toLocaleString()}</span></div>
                <div><span className="text-gray-500">{t("returns.quantity")}:</span> <span className="font-medium">{selectedItem.quantity}</span></div>
                <div><span className="text-gray-500">{t("returns.availableForReturn")}:</span> <span className="font-bold text-blue-700">{availableQuantity}</span></div>
              </div>
            </div>
          )}

          {form.type === "PURCHASE_RETURN" && form.companyId && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">{t("returns.selectPurchaseOrder")}</label>
              {purchaseOrdersLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
                  <PrinterLoader size="sm" label={t("common.loading")} />
                </div>
              ) : (
                <SearchableSelect value={form.purchaseOrderId} onChange={(v) => setForm((prev) => ({ ...prev, purchaseOrderId: v }))} options={purchaseOrders.map((order) => ({ value: order.id, label: `${order.id.slice(0, 8)} — ${order.supplier?.name || ""} — ${new Date(order.orderDate).toLocaleDateString("en-GB")} ${new Date(order.orderDate).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` }))} placeholder={t("common.selectOption")} required />
              )}
            </div>
          )}

          {selectedPurchaseOrder && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">{t("returns.selectProduct")}</label>
              <SearchableSelect
                value={form.purchaseOrderItemId}
                onChange={(v) => setForm((prev) => ({ ...prev, purchaseOrderItemId: v }))}
                options={selectedPurchaseOrder.items.map((item) => {
                  const existingReturns = returns.filter(
                    (r) => r.purchaseOrderId === selectedPurchaseOrder.id && r.purchaseOrderItemId === item.id && r.status !== "REJECTED"
                  );
                  const totalReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);
                  const available = item.quantity - totalReturned;
                  return { value: item.id, label: `${item.product?.name || item.productId} — ${item.unitPrice.toLocaleString()} — متبقي ${available}` };
                })}
                disabledValues={selectedPurchaseOrder.items.filter((item) => {
                  const existingReturns = returns.filter(
                    (r) => r.purchaseOrderId === selectedPurchaseOrder.id && r.purchaseOrderItemId === item.id && r.status !== "REJECTED"
                  );
                  const totalReturned = existingReturns.reduce((sum, r) => sum + r.quantity, 0);
                  return item.quantity - totalReturned <= 0;
                }).map((item) => item.id)}
                placeholder={t("common.selectOption")}
                required
              />
            </div>
          )}

          {selectedPurchaseItem && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 className="text-sm font-semibold text-blue-800 mb-2">{t("returns.purchaseDetails")}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">{t("common.product")}:</span> <span className="font-medium">{selectedPurchaseItem.product?.name}</span></div>
                <div><span className="text-gray-500">{t("returns.unitPrice")}:</span> <span className="font-medium">{selectedPurchaseItem.unitPrice.toLocaleString()}</span></div>
                <div><span className="text-gray-500">{t("returns.quantity")}:</span> <span className="font-medium">{selectedPurchaseItem.quantity}</span></div>
                <div><span className="text-gray-500">{t("returns.availableForReturn")}:</span> <span className="font-bold text-blue-700">{availableQuantity}</span></div>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">{t("returns.quantity")}</label>
              <input
                type="number"
                min={1}
                max={availableQuantity || undefined}
                className={inputClass}
                value={form.quantity}
                onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                required
              />
            </div>

            {(selectedItem || selectedPurchaseItem) && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">{t("returns.total")}</label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-bold text-slate-900">
                  {(Number(form.quantity) * (selectedItem?.unitPrice ?? selectedPurchaseItem?.unitPrice ?? 0)).toLocaleString()}
                </div>
              </div>
            )}
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
