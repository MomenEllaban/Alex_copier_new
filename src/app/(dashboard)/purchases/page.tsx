"use client";

import { useEffect, useState } from "react";
import { AddFormBoundary, useAutoAddForm } from "@/hooks/useAutoAddForm";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import DateRangeFilter, { inDateRange } from "@/components/DateRangeFilter";
import { Eye, FileText, Pencil, Plus, Printer, Save, Trash2, X } from "lucide-react";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import FormModal from "@/components/FormModal";
import SelectWithAdd from "@/components/SelectWithAdd";
import { useConfirm, useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import SubmitButton from "@/components/SubmitButton";
import { DateTimeCell } from "@/components/DateTimeCell";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Supplier { id: string; name: string; }
interface Company { id: string; name: string; }
interface Customer { id: string; name: string; }
interface Product {
  id: string; name: string;
  pricingTiers?: Record<string, number>; wholesalePrice?: number | null; retailPrice?: number | null; purchasePrice?: number | null;
}
interface PurchaseItem { id: string; productId: string; quantity: number; unitPrice: number; product: Product; }
interface PurchaseOrder {
  id: string; companyId: string; supplierId: string; status: string; total: number; notes: string | null;
  orderDate: string; createdAt: string; supplier: Supplier; company?: Company; items: PurchaseItem[];
}
interface ItemRow { productId: string; quantity: string; unitPrice: string; }

interface PriceHistory {
  lastSalePrice: number | null;
  lastSaleTier: string | null;
  lastSaleAt: string | null;
  lastPurchasePrice: number | null;
  lastPurchaseAt: string | null;
}
interface InterCompanyItem { id: string; productId: string; product: Product | null; quantity: number; unitPrice: number; }
interface InterCompanyInvoice {
  id: string; invoiceNumber: string; total: number; invoiceDate: string; createdAt: string; notes: string | null;
  fromCompany: Company; toCompany: Company; items: InterCompanyItem[]; internalPaymentMethod?: string;
  internalPaidAmount?: number; salesOrderId?: string | null;
  customer?: { id: string; name: string } | null;
  engineer?: { id: string; name: string } | null;
  orderType?: string; paymentMethod?: string; paidAmount?: number; taxRate?: number; discount?: number; discountType?: string;
}
interface InterRow { productId: string; quantity: string; internalPrice: string; customerPrice: string; costPrice: string; }
interface InterForm {
  fromCompanyId: string; toCompanyId: string; customerId: string; engineerId: string; orderType: string; paymentMethod: string;
  internalPaymentMethod: string; paidAmount: string; internalPaidAmount: string; isTaxInvoice: boolean; taxRate: string;
  discount: string; notes: string;
}

const COMPANY_ORDER_TIERS: Record<string, string> = {
  company1: "jumlaMachines",
  company2: "jumlaParts",
  company3: "sectori",
};

const getProductTierPrice = (product: Product | undefined, tier: string) => {
  const tiers = product?.pricingTiers ?? {};
  const tierValue = tiers[tier];
  if (typeof tierValue === "number" && Number.isFinite(tierValue)) return tierValue;
  if (tier === "engineer") return product?.wholesalePrice ?? product?.retailPrice ?? 0;
  return product?.retailPrice ?? product?.wholesalePrice ?? 0;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  CONFIRMED: "مؤكد",
  RECEIVED: "تم الاستلام",
  CANCELLED: "ملغي",
};

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  RECEIVED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default function PurchasesPage() {
  const { t, dir } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [intercompanyInvoices, setIntercompanyInvoices] = useState<InterCompanyInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [form, setForm] = useState({ companyId: "", supplierId: "", notes: "", status: "CONFIRMED" });
  const [itemRows, setItemRows] = useState<ItemRow[]>([{ productId: "", quantity: "", unitPrice: "" }]);
  const [priceHistory, setPriceHistory] = useState<Record<string, PriceHistory>>({});
  const [priceHistoryLoading, setPriceHistoryLoading] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;
  const [icPage, setIcPage] = useState(1);
  const IC_PAGE_SIZE = 10;
  const [tab, setTab] = useState<"external" | "inter">("external");
  const [icSearch, setIcSearch] = useState("");
  const [icCompanyFilter, setIcCompanyFilter] = useState("");
  const [icDateFrom, setIcDateFrom] = useState("");
  const [icDateTo, setIcDateTo] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingOrder, setViewingOrder] = useState<PurchaseOrder | null>(null);
  const [viewingIc, setViewingIc] = useState<InterCompanyInvoice | null>(null);
  const [editingIc, setEditingIc] = useState<string | null>(null);
  const [interForm, setInterForm] = useState<InterForm>({
    fromCompanyId: "", toCompanyId: "", customerId: "", engineerId: "", orderType: "MACHINE_SALE", paymentMethod: "CREDIT",
    internalPaymentMethod: "CREDIT", paidAmount: "", internalPaidAmount: "", isTaxInvoice: false, taxRate: "0",
    discount: "0", notes: "",
  });
  const [interRows, setInterRows] = useState<InterRow[]>([{ productId: "", quantity: "", internalPrice: "", customerPrice: "", costPrice: "" }]);
  const [showIcForm, setShowIcForm] = useState(false);

  const fetchData = async () => {
    try {
      const [pRes, sRes, prRes, coRes, cuRes, enRes] = await Promise.all([fetch("/api/purchases"), fetch("/api/suppliers"), fetch("/api/inventory"), fetch("/api/companies"), fetch("/api/customers"), fetch("/api/engineers")]);
      const pData = await pRes.json();
      setOrders(Array.isArray(pData) ? pData : pData.orders || []);
      setIntercompanyInvoices(Array.isArray(pData) ? [] : pData.intercompany || []);
      setSuppliers(await sRes.json());
      setCompanies(await coRes.json());
      const en = await enRes.json();
      setEngineers(Array.isArray(en) ? en.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })) : []);
      const cu = await cuRes.json();
      setCustomers(Array.isArray(cu) ? cu.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) : []);
      const inv = await prRes.json();
      const allProducts: (Product | undefined)[] = Array.isArray(inv) ? inv.map((i: { product?: Product }) => i.product) : [];
      setProducts(Array.from(new Map(allProducts.filter((p): p is Product => Boolean(p)).map((p) => [p.id, p])).values()));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchData, ["purchases", "products", "inventory", "warehouses", "suppliers", "returns"]);

  const autoAddOpen = useAutoAddForm();
  useEffect(() => {
    if (autoAddOpen) setShowForm(true);
  }, [autoAddOpen]);

  const filtered = orders.filter(order =>
    (!statusFilter || order.status === statusFilter) &&
    (!companyFilter || order.companyId === companyFilter) &&
    (!supplierFilter || order.supplierId === supplierFilter) &&
    inDateRange(order.orderDate || order.createdAt, dateFrom, dateTo) &&
    (matchesQuery(order.supplier?.name, search) ||
      matchesQuery(order.company?.name, search) ||
      matchesQuery(STATUS_LABELS[order.status], search) ||
      matchesQuery(order.items.map(i => i.product?.name).join(" "), search))
  );
  const hasActiveFilters = statusFilter !== "" || companyFilter !== "" || supplierFilter !== "" || dateFrom !== "" || dateTo !== "" || search !== "";
  const icFiltered = intercompanyInvoices.filter(ic =>
    (!icCompanyFilter || ic.toCompany.id === icCompanyFilter) &&
    inDateRange(ic.invoiceDate || ic.createdAt, icDateFrom, icDateTo) &&
    (matchesQuery(ic.fromCompany?.name, icSearch) ||
      matchesQuery(ic.toCompany?.name, icSearch) ||
      matchesQuery(ic.invoiceNumber, icSearch))
  );
  const icHasActiveFilters = icSearch !== "" || icCompanyFilter !== "" || icDateFrom !== "" || icDateTo !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const icTotalPages = Math.max(1, Math.ceil(icFiltered.length / IC_PAGE_SIZE));
  const icSafePage = Math.min(icPage, icTotalPages);
  const icPaged = icFiltered.slice((icSafePage - 1) * IC_PAGE_SIZE, icSafePage * IC_PAGE_SIZE);

  const exportPurchases = () => ({
    headers: [
      t("purchases.orderNumber"),
      t("common.company"),
      t("purchases.supplier"),
      t("common.status"),
      t("purchases.total"),
      t("common.date"),
    ],
    rows: filtered.map((order) => [
      order.id.slice(0, 8),
      order.company?.name || companies.find((c) => c.id === order.companyId)?.name || "",
      order.supplier.name,
      STATUS_LABELS[order.status] || order.status,
      String(order.total),
      new Date(order.orderDate || order.createdAt).toISOString().slice(0, 10),
    ]),
  });

  const addRow = () => setItemRows([...itemRows, { productId: "", quantity: "", unitPrice: "" }]);
  const removeRow = (index: number) => { if (itemRows.length > 1) setItemRows(itemRows.filter((_, i) => i !== index)); };
  const updateRow = (index: number, field: keyof ItemRow, value: string) => {
    const updated = [...itemRows];
    updated[index] = { ...updated[index], [field]: value };
    setItemRows(updated);
    if (field === "productId" && value) loadPriceHistory([value], form.companyId);
  };

  const loadPriceHistory = (productIds: string[], companyId: string) => {
    const missing = productIds.filter((id) => id && !priceHistory[id]);
    if (missing.length === 0) return;
    setPriceHistoryLoading((prev) => {
      const next = { ...prev };
      for (const id of missing) next[id] = true;
      return next;
    });
    fetch("/api/products/price-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, productIds: missing }),
    })
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        if (data?.prices) setPriceHistory((prev) => ({ ...prev, ...data.prices }));
      })
      .catch(() => {})
      .finally(() => {
        setPriceHistoryLoading((prev) => {
          const next = { ...prev };
          for (const id of missing) next[id] = false;
          return next;
        });
      });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = itemRows.filter((r) => r.productId && r.quantity && r.unitPrice).map((r) => ({ productId: r.productId, quantity: parseInt(r.quantity), unitPrice: parseFloat(r.unitPrice) }));
    if (items.length === 0) { setSaving(false); return; }
    if (!form.companyId) { toastError(t("purchases.selectCompany")); return; }
    if (!form.supplierId) { toastError(t("purchases.selectSupplier")); return; }
    setSaving(true);
    try {
      const payload = editingId ? { ...form, items } : { ...form, orderDate: new Date().toISOString(), items };
      const url = editingId ? `/api/purchases/${editingId}` : "/api/purchases";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toastError(apiErrorMessage(data, t)); return; }
      toastSuccess(editingId ? t("common.updatedSuccessfully") : t("common.addedSuccessfully"));
    } finally {
      setSaving(false);
    }
    setForm({ companyId: "", supplierId: "", notes: "", status: "CONFIRMED" });
    setItemRows([{ productId: "", quantity: "", unitPrice: "" }]);
    setEditingId(null);
    setShowForm(false);
    setPriceHistory({});
    setPriceHistoryLoading({});
    refresh();
    notifyDataChanged(["purchases", "products", "inventory", "warehouses", "suppliers"]);
  };

  const openEditOrder = (order: PurchaseOrder) => {
    setEditingId(order.id);
    setForm({ companyId: order.companyId, supplierId: order.supplierId, notes: order.notes || "", status: order.status });
    setItemRows(
      order.items.length > 0
        ? order.items.map((it) => ({ productId: it.productId, quantity: String(it.quantity), unitPrice: String(it.unitPrice) }))
        : [{ productId: "", quantity: "", unitPrice: "" }]
    );
    setShowForm(true);
    loadPriceHistory(
      order.items.map((it) => it.productId),
      order.companyId
    );
  };

  const updateInterRow = (index: number, field: keyof InterRow, value: string) => {
    const updated = [...interRows];
    updated[index] = { ...updated[index], [field]: value };
    setInterRows(updated);
  };

  const openEditIc = (ic: InterCompanyInvoice) => {
    if (!ic.salesOrderId) { toastError("لا يمكن تعديل هذه الفاتورة — لا يوجد أمر بيع مرتبط"); return; }
    setEditingIc(ic.id);
    const toCompanyId = ic.toCompany?.id || ic.fromCompany?.id || "";
    const tier = COMPANY_ORDER_TIERS[toCompanyId] || "sectori";
    setInterForm({
      fromCompanyId: ic.fromCompany?.id || "",
      toCompanyId: ic.toCompany?.id || "",
      customerId: ic.customer?.id || "",
      engineerId: ic.engineer?.id || "",
      orderType: ic.orderType || "MACHINE_SALE",
      paymentMethod: ic.paymentMethod || "CREDIT",
      internalPaymentMethod: ic.internalPaymentMethod === "CASH" ? "CASH" : "CREDIT",
      paidAmount: String(ic.paidAmount ?? 0),
      internalPaidAmount: String(ic.internalPaidAmount ?? 0),
      isTaxInvoice: (ic.taxRate ?? 0) > 0,
      taxRate: String(ic.taxRate ?? 0),
      discount: String(ic.discount ?? 0),
      notes: ic.notes || "",
    });
    setInterRows(
      ic.items.length > 0
        ? ic.items.map((it) => {
            const product = products.find((p) => p.id === it.productId);
            const internalPrice = product ? getProductTierPrice(product, tier) : 0;
            return {
              productId: it.productId,
              quantity: String(it.quantity),
              internalPrice: String(internalPrice),
              customerPrice: String(it.unitPrice),
              costPrice: String(product?.purchasePrice || ""),
            };
          })
        : [{ productId: "", quantity: "", internalPrice: "", customerPrice: "", costPrice: "" }]
    );
    setShowIcForm(true);
  };

  const handleInterSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIc) return;
    const items = interRows
      .filter((r) => r.productId && r.quantity && r.customerPrice)
      .map((r) => ({
        productId: r.productId,
        quantity: parseInt(r.quantity),
        internalPrice: parseFloat(r.internalPrice) || 0,
        customerPrice: parseFloat(r.customerPrice) || 0,
        costPrice: parseFloat(r.costPrice) || 0,
      }));
    if (items.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sales/intercompany/${editingIc}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...interForm, discountType: "FIXED", items }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toastError(apiErrorMessage(data, t)); return; }
      toastSuccess(t("common.updatedSuccessfully"));
      refresh();
      notifyDataChanged(["purchases", "products", "inventory", "warehouses", "suppliers"]);
    } finally {
      setSaving(false);
    }
    setEditingIc(null);
    setShowIcForm(false);
    setPriceHistory({});
    setPriceHistoryLoading({});
  };


  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("common.deleteConfirm") }))) return;
    const res = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) { toastError(apiErrorMessage(data, t)); return; }
    setPriceHistory({});
    setPriceHistoryLoading({});
    refresh();
    notifyDataChanged(["purchases", "products", "inventory", "warehouses", "suppliers"]);
    toastSuccess(t("common.deletedSuccessfully"));
  };

  const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">{t("purchases.title")}</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"><Plus size={16} />{t("purchases.addOrder")}</button>
      </div>

      <FormModal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? "تعديل فاتورة شراء" : t("purchases.addOrder")} wide>
        <form onSubmit={handleCreate} className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-purple-700">
            <span className="text-sm font-bold">{editingId ? "تعديل فاتورة شراء" : t("purchases.addOrder")}</span>
            <span className="text-xs opacity-80">{editingId ? "تعديل" : "إضافة جديدة"}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("companies.selectCompany")}</label>
              <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className={inputClass} required>
                <option value="">{t("companies.selectCompany")}</option>
                {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <SelectWithAdd
              label={t("purchases.selectSupplier")}
              value={form.supplierId}
              onChange={(v) => setForm({ ...form, supplierId: v })}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={t("purchases.selectSupplier")}
              required
              quickAddTitle="إضافة مورد جديد"
              quickAddFields={[
                { key: "companyId", label: "الشركة", type: "select", required: true, options: companies.map((c) => ({ value: c.id, label: c.name })) },
                { key: "name", label: "اسم المورد", required: true },
                { key: "contactName", label: "اسم التواصل" },
                { key: "phone", label: "الهاتف", placeholder: "01xxxxxxxxx" },
                { key: "email", label: "البريد الإلكتروني", type: "email" },
                { key: "address", label: "العنوان" },
              ]}
              quickAddDefaults={{ companyId: form.companyId }}
              quickAddEndpoint="/api/suppliers"
              onQuickAddSuccess={(item) => {
                setSuppliers((prev) => [...prev, item]);
                setForm((f) => ({ ...f, supplierId: item.id }));
              }}
            />
          </div>
          {editingId && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("common.status")}</label>
              <select value={form.status || "CONFIRMED"} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (<option key={value} value={value}>{label}</option>))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("common.notes")}</label>
            <textarea placeholder={t("common.notes")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} rows={2} />
          </div>
          <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">{t("purchases.items")}</h3>
              <button type="button" onClick={addRow} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"><Plus size={16} />{t("purchases.addRow")}</button>
            </div>
            <div className="space-y-3">
              {itemRows.map((row, idx) => {
                const ph = row.productId ? priceHistory[row.productId] : undefined;
                const phLoading = row.productId ? Boolean(priceHistoryLoading[row.productId]) : false;
                const lastPurchase = ph?.lastPurchasePrice != null ? ph.lastPurchasePrice.toLocaleString() : null;
                return (
                  <div key={idx} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_130px_160px_auto]">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("sales.product")}</label>
                        <select value={row.productId} onChange={(e) => updateRow(idx, "productId", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="">{t("purchases.selectProduct")}</option>
                          {products.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("purchases.quantity")}</label>
                        <input type="number" placeholder={t("purchases.quantity")} value={row.quantity} onChange={(e) => updateRow(idx, "quantity", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" min="1" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("purchases.unitPrice")}</label>
                        <input type="number" placeholder={t("purchases.unitPrice")} value={row.unitPrice} onChange={(e) => updateRow(idx, "unitPrice", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" min="0" step="0.01" />
                      </div>
                      {itemRows.length > 1 && <button type="button" onClick={() => removeRow(idx)} className="mt-7 inline-flex h-11 w-11 items-center justify-center self-start rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100">×</button>}
                    </div>
                    {row.productId && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-blue-50/60 px-3 py-2">
                        <span className="text-sm text-slate-700"><span className="font-semibold">{t("sales.unitPrice")}:</span> {row.unitPrice ? Number(row.unitPrice).toLocaleString() : "—"}</span>
                        {phLoading && (
                          <span className="text-sm text-slate-400">جاري تحميل آخر سعر شراء...</span>
                        )}
                        {!phLoading && ph && lastPurchase && (
                          <span className="text-sm font-semibold text-blue-700">آخر شراء: {lastPurchase}</span>
                        )}
                        {!phLoading && ph && !lastPurchase && (
                          <span className="text-sm text-slate-400">لا يوجد سجل شراء لهذا المنتج</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"><X size={16} className="ms-1 inline-block" />{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm" role="tablist">
        {([{ id: "external", label: t("purchases.tabExternal") }, { id: "inter", label: t("purchases.tabIntercompany") }] as const).map((tb) => (
          <button
            key={tb.id}
            role="tab"
            aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${tab === tb.id ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "external" ? (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none"><SearchInput value={search} onChange={setSearch} placeholder={t("purchases.searchPlaceholder")} /></div>
          <FilterSelect value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} allLabel={`${t("common.status")} — ${t("common.all")}`} className="md:w-40" />
          <FilterSelect value={companyFilter} onChange={(v) => { setCompanyFilter(v); setPage(1); }} options={companies.map((c) => ({ value: c.id, label: c.name }))} allLabel={`${t("common.company")} — ${t("common.all")}`} className="md:w-40" />
          <FilterSelect value={supplierFilter} onChange={(v) => { setSupplierFilter(v); setPage(1); }} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} allLabel={`${t("purchases.supplier")} — ${t("common.all")}`} className="md:w-44" />
          <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={(v) => { setDateFrom(v); setPage(1); }} onToChange={(v) => { setDateTo(v); setPage(1); }} />
          {hasActiveFilters && (
            <button onClick={() => { setSearch(""); setStatusFilter(""); setCompanyFilter(""); setSupplierFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }} className="text-sm text-gray-500 hover:text-gray-700 underline">
              {t("common.resetFilters")}
            </button>
          )}
          <div className="md:ms-auto mt-2 md:mt-0">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton filename="purchase-orders" getExport={exportPurchases} disabled={filtered.length === 0} />
          </div>
        </div>
        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        )
        : orders.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        )
        : filtered.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        )
        : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("purchases.orderNumber")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.company")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("purchases.supplier")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.status")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("purchases.total")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.date")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paged.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{order.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-sm">{order.company?.name || companies.find(c => c.id === order.companyId)?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm">{order.supplier.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[order.status] || ""}`}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{order.total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm"><DateTimeCell value={order.orderDate || order.createdAt} /></td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewingOrder(order)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-100" title={t("common.view")}>
                        <Eye size={14} />
                      </button>
                      <button onClick={() => openEditOrder(order)} className="ms-1 inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs font-medium text-sky-600 transition hover:bg-sky-100" title={t("common.edit")}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => window.open(`/api/invoices?type=purchase&id=${order.id}`, "_blank")} className="ms-1 inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-2 text-xs font-medium text-green-600 transition hover:bg-green-100" title="طباعة الفاتورة">
                        <Printer size={14} />
                      </button>
                      <button onClick={() => window.open(`/api/invoices?type=purchase&id=${order.id}&format=receipt`, "_blank")} className="ms-1 inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-600 transition hover:bg-emerald-100" title="طباعة الريسيت">
                        <FileText size={14} />
                      </button>
                      <button onClick={() => handleDelete(order.id)} className="ms-1 inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100" title={t("common.delete")}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
      </div>
      ) : (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none"><SearchInput value={icSearch} onChange={setIcSearch} placeholder={t("purchases.searchPlaceholder")} /></div>
          <FilterSelect value={icCompanyFilter} onChange={(v) => { setIcCompanyFilter(v); setIcPage(1); }} options={companies.map((c) => ({ value: c.id, label: c.name }))} allLabel={`${t("purchases.buyerCompany")} — ${t("common.all")}`} className="md:w-44" />
          <DateRangeFilter from={icDateFrom} to={icDateTo} onFromChange={(v) => { setIcDateFrom(v); setIcPage(1); }} onToChange={(v) => { setIcDateTo(v); setIcPage(1); }} />
          {icHasActiveFilters && (
            <button onClick={() => { setIcSearch(""); setIcCompanyFilter(""); setIcDateFrom(""); setIcDateTo(""); setIcPage(1); }} className="text-sm text-gray-500 hover:text-gray-700 underline">
              {t("common.resetFilters")}
            </button>
          )}
        </div>
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-base font-semibold text-slate-900">{t("purchases.intercompanyTitle")}</h2>
          <span className="text-xs text-slate-400">{t("purchases.intercompanyHint")}</span>
        </div>
        {icFiltered.length === 0 ? (
          <div className="flex min-h-[100px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("purchases.orderNumber")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("purchases.sellerCompany")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("purchases.buyerCompany")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("purchases.items")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("purchases.total")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("sales.paymentMethod")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.date")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {icPaged.map((ic) => (
                  <tr key={ic.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{ic.invoiceNumber}</td>
                    <td className="px-4 py-3 text-sm">{ic.fromCompany?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm">{ic.toCompany?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm">{ic.items && ic.items.length ? ic.items.map((x) => x.product?.name).join("، ") : "—"}</td>
                    <td className="px-4 py-3 text-sm">{ic.total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm">
                      {ic.internalPaymentMethod === "CASH" ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{t("sales.cash")}</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">{t("sales.credit")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm"><DateTimeCell value={ic.invoiceDate || ic.createdAt} /></td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewingIc(ic)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-100" title={t("common.view")}>
                        <Eye size={14} />
                      </button>
                      <button onClick={() => openEditIc(ic)} className="ms-1 inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100" title={t("common.edit")}>
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {icFiltered.length > 0 && (
          <Pagination currentPage={icSafePage} totalPages={icTotalPages} onPageChange={setIcPage} totalItems={icFiltered.length} pageSize={IC_PAGE_SIZE} />
        )}
      </div>
      )}

      {viewingOrder && (
        <FormModal open={!!viewingOrder} onClose={() => setViewingOrder(null)} title="عرض فاتورة شراء">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-purple-700">
              <span className="text-sm font-bold">فاتورة شراء</span>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[viewingOrder.status] || ""}`}>{STATUS_LABELS[viewingOrder.status] || viewingOrder.status}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500">{t("common.company")}</p>
                <p className="text-sm font-medium">{viewingOrder.company?.name || companies.find(c => c.id === viewingOrder.companyId)?.name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t("purchases.supplier")}</p>
                <p className="text-sm font-medium">{viewingOrder.supplier.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t("purchases.orderNumber")}</p>
                <p className="text-sm font-medium">{viewingOrder.id.slice(0, 8)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t("common.date")}</p>
                <p className="text-sm font-medium"><DateTimeCell value={viewingOrder.orderDate || viewingOrder.createdAt} /></p>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("purchases.product")}</th>
                    <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("purchases.quantity")}</th>
                    <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("purchases.unitPrice")}</th>
                    <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("purchases.lineTotal")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {viewingOrder.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 text-sm">{it.product.name}</td>
                      <td className="px-3 py-2 text-sm">{it.quantity}</td>
                      <td className="px-3 py-2 text-sm">{it.unitPrice.toLocaleString()}</td>
                      <td className="px-3 py-2 text-sm">{(it.quantity * it.unitPrice).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-end text-sm font-medium text-slate-700">{t("purchases.total")}</td>
                    <td className="px-3 py-2 text-sm font-bold text-slate-900">{viewingOrder.total.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {viewingOrder.notes && (
              <div>
                <p className="text-xs text-gray-500">{t("common.notes")}</p>
                <p className="text-sm">{viewingOrder.notes}</p>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => window.open(`/api/invoices?type=purchase&id=${viewingOrder.id}`, "_blank")} className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700"><Printer size={15} />طباعة</button>
              <button onClick={() => { const o = viewingOrder; setViewingOrder(null); openEditOrder(o); }} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Pencil size={15} />{t("common.edit")}</button>
            </div>
          </div>
        </FormModal>
      )}

      {viewingIc && (
        <FormModal open={!!viewingIc} onClose={() => setViewingIc(null)} title="عرض فاتورة داخلية">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-700">
              <span className="text-sm font-bold">فاتورة داخلية</span>
              <span className="text-xs opacity-80">{viewingIc.invoiceNumber}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500">{t("purchases.sellerCompany")}</p>
                <p className="text-sm font-medium">{viewingIc.fromCompany?.name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t("purchases.buyerCompany")}</p>
                <p className="text-sm font-medium">{viewingIc.toCompany?.name || "—"}</p>
              </div>
              {viewingIc.customer && (
                <div>
                  <p className="text-xs text-gray-500">{t("sales.customer")}</p>
                  <p className="text-sm font-medium">{viewingIc.customer.name}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500">{t("common.date")}</p>
                <p className="text-sm font-medium"><DateTimeCell value={viewingIc.invoiceDate || viewingIc.createdAt} /></p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t("sales.paymentMethod")}</p>
                <p className="text-sm font-medium">{viewingIc.paymentMethod === "CASH" ? t("sales.cash") : t("sales.credit")}</p>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("purchases.product")}</th>
                    <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("purchases.quantity")}</th>
                    <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("purchases.unitPrice")}</th>
                    <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("purchases.lineTotal")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {viewingIc.items && viewingIc.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 text-sm">{it.product?.name || "—"}</td>
                      <td className="px-3 py-2 text-sm">{it.quantity}</td>
                      <td className="px-3 py-2 text-sm">{it.unitPrice.toLocaleString()}</td>
                      <td className="px-3 py-2 text-sm">{(it.quantity * it.unitPrice).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-end text-sm font-medium text-slate-700">{t("purchases.total")}</td>
                    <td className="px-3 py-2 text-sm font-bold text-slate-900">{viewingIc.total.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => { setViewingIc(null); openEditIc(viewingIc); }} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><Pencil size={15} />{t("common.edit")}</button>
            </div>
          </div>
        </FormModal>
      )}

      {showIcForm && editingIc && (
        <FormModal open={showIcForm} onClose={() => { setShowIcForm(false); setEditingIc(null); }} title="تعديل فاتورة داخلية" wide>
          <form onSubmit={handleInterSave} className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-700">
              <span className="text-sm font-bold">تعديل فاتورة داخلية</span>
              <span className="text-xs opacity-80">تعديل</span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("purchases.sellerCompany")}</label>
                <select value={interForm.fromCompanyId} onChange={(e) => setInterForm({ ...interForm, fromCompanyId: e.target.value })} className={inputClass} required>
                  <option value="">{t("purchases.sellerCompany")}</option>
                  {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("purchases.buyerCompany")}</label>
                <select value={interForm.toCompanyId} onChange={(e) => setInterForm({ ...interForm, toCompanyId: e.target.value })} className={inputClass} required>
                  <option value="">{t("purchases.buyerCompany")}</option>
                  {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("sales.customer")}</label>
                <select value={interForm.customerId} onChange={(e) => setInterForm({ ...interForm, customerId: e.target.value })} className={inputClass} required>
                  <option value="">{t("sales.customer")}</option>
                  {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">المهندس (اختياري)</label>
                <select value={interForm.engineerId} onChange={(e) => setInterForm({ ...interForm, engineerId: e.target.value })} className={inputClass}>
                  <option value="">المهندس (اختياري)</option>
                  {engineers.map((en) => (<option key={en.id} value={en.id}>{en.name}</option>))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("sales.orderType")}</label>
                <select value={interForm.orderType} onChange={(e) => setInterForm({ ...interForm, orderType: e.target.value })} className={inputClass}>
                  <option value="MACHINE_SALE">{t("sales.machineSale")}</option>
                  <option value="SPARE_PART_SALE">{t("sales.sparePartSale")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("sales.paymentMethod")}</label>
                <select value={interForm.paymentMethod} onChange={(e) => setInterForm({ ...interForm, paymentMethod: e.target.value })} className={inputClass}>
                  <option value="CREDIT">{t("sales.credit")}</option>
                  <option value="CASH">{t("sales.cash")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("purchases.internalPaymentMethod")}</label>
                <select value={interForm.internalPaymentMethod} onChange={(e) => setInterForm({ ...interForm, internalPaymentMethod: e.target.value })} className={inputClass}>
                  <option value="CREDIT">{t("sales.credit")}</option>
                  <option value="CASH">{t("sales.cash")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("sales.paidAmount")}</label>
                <input type="number" value={interForm.paidAmount} onChange={(e) => setInterForm({ ...interForm, paidAmount: e.target.value })} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("purchases.internalPaidAmount")}</label>
                <input type="number" value={interForm.internalPaidAmount} onChange={(e) => setInterForm({ ...interForm, internalPaidAmount: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={interForm.isTaxInvoice} onChange={(e) => setInterForm({ ...interForm, isTaxInvoice: e.target.checked })} className="h-4 w-4" />
                فاتورة ضريبية
              </label>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("sales.taxRate")} (%)</label>
                <input type="number" value={interForm.taxRate} onChange={(e) => setInterForm({ ...interForm, taxRate: e.target.value })} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("sales.discount")}</label>
                <input type="number" value={interForm.discount} onChange={(e) => setInterForm({ ...interForm, discount: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-700">{t("purchases.items")}</h3>
                <button type="button" onClick={() => setInterRows([...interRows, { productId: "", quantity: "", internalPrice: "", customerPrice: "", costPrice: "" }])} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"><Plus size={16} />{t("purchases.addRow")}</button>
              </div>
              <div className="space-y-3">
                {interRows.map((row, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_100px_140px_140px_140px_auto]">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("sales.product")}</label>
                        <select value={row.productId} onChange={(e) => updateInterRow(idx, "productId", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="">{t("purchases.selectProduct")}</option>
                          {products.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("purchases.quantity")}</label>
                        <input type="number" placeholder={t("purchases.quantity")} value={row.quantity} onChange={(e) => updateInterRow(idx, "quantity", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">سعر داخلي</label>
                        <input type="number" placeholder="سعر داخلي" value={row.internalPrice} onChange={(e) => updateInterRow(idx, "internalPrice", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("purchases.customerPrice")}</label>
                        <input type="number" placeholder={t("purchases.customerPrice")} value={row.customerPrice} onChange={(e) => updateInterRow(idx, "customerPrice", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("purchases.costPrice")}</label>
                        <input type="number" placeholder={t("purchases.costPrice")} value={row.costPrice} onChange={(e) => updateInterRow(idx, "costPrice", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      {interRows.length > 1 && (
                        <button type="button" onClick={() => setInterRows(interRows.filter((_, i) => i !== idx))} className="mt-7 inline-flex h-11 w-11 items-center justify-center self-start rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"><Trash2 size={16} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("common.notes")}</label>
              <textarea placeholder={t("common.notes")} value={interForm.notes} onChange={(e) => setInterForm({ ...interForm, notes: e.target.value })} className={inputClass} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowIcForm(false); setEditingIc(null); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"><X size={15} />{t("common.cancel")}</button>
              <SubmitButton loading={saving} label={t("purchases.saveOrder")} />
            </div>
          </form>
        </FormModal>
      )}
    </div>
  );
}
