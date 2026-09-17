"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import { Eye, Package, Printer, Pencil, Plus, Save, Trash2, Wrench } from "lucide-react";
import PrinterLoader from "@/components/PrinterLoader";
import { AddFormBoundary, useAutoAddForm } from "@/hooks/useAutoAddForm";
import { useConfirm, useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import FormModal from "@/components/FormModal";
import StatsCards from "@/components/StatsCards";
import SubmitButton from "@/components/SubmitButton";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Company {
  id: string;
  name: string;
  nameAr?: string | null;
}

interface Product {
  id: string;
  name: string;
  description?: string | null;
  productType: string;
  companyId: string;
  company?: Company;
  sku?: string | null;
  egsCode?: string | null;
  purchasePrice?: number | null;
  pricingTiers?: Record<string, number | null> | null;
  isActive: boolean;
}

const PRICE_TIER_OPTIONS = [
  { key: "legacyCustomer", label: "عميل قديم" },
  { key: "newCustomer", label: "عميل جديد" },
  { key: "jumlaMachines", label: "شركة جملة آلات" },
  { key: "jumlaParts", label: "شركة جملة قطع غيار" },
  { key: "sectori", label: "شركة قطاعي" },
  { key: "engineer", label: "مهندس" },
] as const;

const emptyPricingTiers = {
  legacyCustomer: "",
  newCustomer: "",
  jumlaMachines: "",
  jumlaParts: "",
  sectori: "",
  engineer: "",
};

const emptyForm = {
  name: "",
  productType: "SPARE_PART",
  companyId: "",
  sku: "",
  egsCode: "",
  purchasePrice: "",
  quantity: "",
  pricingTiers: { ...emptyPricingTiers },
  description: "",
};

const TYPE_BADGES: Record<string, string> = {
  SPARE_PART: "bg-orange-100 text-orange-800",
  MACHINE: "bg-blue-100 text-blue-800",
};

export default function ProductsPage() {
  const { t, dir } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [inventoryByProduct, setInventoryByProduct] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const fetchData = async () => {
    try {
      // ?all=true — admins manage inactive products here too.
      const [pRes, cRes, inventoryRes] = await Promise.all([
        fetch("/api/products?all=true"),
        fetch("/api/companies"),
        fetch("/api/inventory?catalog=true"),
      ]);
      const [pData, cData, inventoryData] = await Promise.all([pRes.json(), cRes.json(), inventoryRes.json()]);
      setProducts(Array.isArray(pData) ? pData : []);
      setCompanies(Array.isArray(cData) ? cData : []);
      const stockMap: Record<string, number> = {};
      for (const entry of Array.isArray(inventoryData.inventory) ? inventoryData.inventory : []) {
        stockMap[entry.productId] = (stockMap[entry.productId] ?? 0) + Number(entry.quantity || 0);
      }
      setInventoryByProduct(stockMap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchData, ["products", "inventory", "sales", "purchases", "returns", "warehouses"]);

  const autoAddOpen = useAutoAddForm();
  useEffect(() => {
    if (autoAddOpen) setShowForm(true);
  }, [autoAddOpen]);

  const filtered = products.filter(
    (p) =>
      (matchesQuery(p.name, search) ||
        matchesQuery(p.sku, search) ||
        matchesQuery(p.egsCode, search)) &&
      (!typeFilter || p.productType === typeFilter) &&
      (!companyFilter || p.companyId === companyFilter) &&
      (!activeFilter || String(p.isActive) === activeFilter)
  );
  const hasActiveFilters = typeFilter !== "" || companyFilter !== "" || activeFilter !== "" || search !== "";

  const stats = useMemo(() => ({
    total: products.length,
    machines: products.filter((p) => p.productType === "MACHINE").length,
    spareParts: products.filter((p) => p.productType === "SPARE_PART").length,
    stockQty: Object.values(inventoryByProduct).reduce((sum, qty) => sum + (qty || 0), 0),
  }), [products, inventoryByProduct]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportProducts = () => ({
    headers: [
      t("products.name"),
      t("products.type"),
      t("warehouses.company"),
      t("products.sku"),
      t("products.purchasePrice"),
      "الكمية المتاحة",
      t("common.status"),
    ],
    rows: filtered.map((p) => [
      p.name,
      p.productType === "MACHINE" ? t("products.machine") : t("products.sparePart"),
      p.company?.nameAr || p.company?.name || "",
      p.sku || "",
      p.purchasePrice != null ? String(p.purchasePrice) : "",
      String(inventoryByProduct[p.id] ?? 0),
      p.isActive ? t("common.active") : t("common.inactive"),
    ]),
  });

  const openCreate = () => {
    setForm({ ...emptyForm, pricingTiers: { ...emptyPricingTiers } });
    setEditingId(null);
    setError("");
    setShowForm(!showForm);
  };

  const openEdit = (product: Product) => {
    setForm({
      name: product.name,
      productType: product.productType,
      companyId: product.companyId,
      sku: product.sku || "",
      egsCode: product.egsCode || "",
      purchasePrice: product.purchasePrice != null ? String(product.purchasePrice) : "",
      quantity: "",
      pricingTiers: {
        legacyCustomer: product.pricingTiers?.legacyCustomer != null ? String(product.pricingTiers.legacyCustomer) : "",
        newCustomer: product.pricingTiers?.newCustomer != null ? String(product.pricingTiers.newCustomer) : "",
        jumlaMachines: product.pricingTiers?.jumlaMachines != null ? String(product.pricingTiers.jumlaMachines) : "",
        jumlaParts: product.pricingTiers?.jumlaParts != null ? String(product.pricingTiers.jumlaParts) : "",
        sectori: product.pricingTiers?.sectori != null ? String(product.pricingTiers.sectori) : "",
        engineer: product.pricingTiers?.engineer != null ? String(product.pricingTiers.engineer) : "",
      },
      description: product.description || "",
    });
    setEditingId(product.id);
    setError("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        quantity: form.quantity === "" ? undefined : Number(form.quantity),
        pricingTiers: Object.fromEntries(
          PRICE_TIER_OPTIONS.map(({ key }) => [key, form.pricingTiers[key]])
        ),
      };
      const res = await fetch(editingId ? `/api/products/${editingId}` : "/api/products", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(data, t));
        return;
      }
      setShowForm(false);
      setForm({ ...emptyForm, pricingTiers: { ...emptyPricingTiers } });
      setEditingId(null);
      refresh();
      notifyDataChanged(["products", "inventory", "sales", "purchases", "returns"]);
      toastSuccess(t("common.savedSuccessfully"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("products.deleteConfirm") }))) return;
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    setError("");
    if (!res.ok) {
      toastError(apiErrorMessage(data, t));
      return;
    }
    refresh();
    notifyDataChanged(["products", "inventory", "sales", "purchases", "returns"]);
    toastSuccess(data?.archived ? t("products.archivedNotice") : t("common.deletedSuccessfully"));
  };

  const toggleActive = async (product: Product) => {
    const res = await fetch(`/api/products/${product.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !product.isActive }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toastError(apiErrorMessage(data, t));
      return;
    }
    refresh();
    notifyDataChanged(["products", "inventory", "sales", "purchases", "returns"]);
    toastSuccess(t("common.savedSuccessfully"));
  };

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">{t("products.title")}</h1>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
        >
          <Plus size={16} />{t("products.addProduct")}
        </button>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("products.stats.total"), value: stats.total.toLocaleString("ar-EG"), icon: <Package size={18} />, tone: "sky" },
          { label: t("products.stats.machines"), value: stats.machines.toLocaleString("ar-EG"), icon: <Printer size={18} />, tone: "blue" },
          { label: t("products.stats.spareParts"), value: stats.spareParts.toLocaleString("ar-EG"), icon: <Wrench size={18} />, tone: "orange" },
          { label: t("products.stats.stockQty"), value: stats.stockQty.toLocaleString("ar-EG"), icon: <Package size={18} />, tone: "green" },
        ]}
      />

      {error && (
        <div
          className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="status"
        >
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label={t("common.close")} className="text-inherit">
            ✕
          </button>
        </div>
      )}

      <FormModal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? t("products.editProduct") : t("products.addProduct")} wide>
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("products.name")}</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div className="space-y-1.5">
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("products.type")}</label>
                <select value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                  <option value="SPARE_PART">{t("products.sparePart")}</option>
                  <option value="MACHINE">{t("products.machine")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("warehouses.company")}</label>
                <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                  <option value="">{t("common.selectOption")}</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.nameAr || company.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="mb-1 block text-sm font-medium text-slate-700">SKU</label>
                <input type="text" dir="ltr" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1.5">
                <label className="mb-1 block text-sm font-medium text-slate-700">EGS</label>
                <input type="text" dir="ltr" value={form.egsCode} onChange={(e) => setForm({ ...form, egsCode: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">أسعار المنتج</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t("products.purchasePrice")}</label>
                  <input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="mb-1 block text-sm font-medium text-slate-700">الكمية الحالية</label>
                  <input type="number" min="0" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">أسعار البيع حسب شريحة العميل</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {PRICE_TIER_OPTIONS.map(({ key, label }) => (
                  <div key={key} className="space-y-1.5">
                    <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
                    <input type="number" min="0" step="0.01" value={form.pricingTiers[key] ?? ""} onChange={(e) => setForm({ ...form, pricingTiers: { ...form.pricingTiers, [key]: e.target.value } })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("products.description")}</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
              <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
            </div>
          </form>
      </FormModal>

      <FormModal open={!!viewProduct} onClose={() => setViewProduct(null)} title={t("common.view") + " — " + (viewProduct?.name ?? "")} wide>
        {viewProduct && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-slate-500">{t("products.name")}</p>
                <p className="mt-1 text-sm text-slate-800">{viewProduct.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">SKU</p>
                <p className="mt-1 text-sm text-slate-800" dir="ltr">{viewProduct.sku || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{t("products.type")}</p>
                <p className="mt-1 text-sm text-slate-800">{viewProduct.productType === "MACHINE" ? t("products.machine") : t("products.sparePart")}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{t("products.purchasePrice")}</p>
                <p className="mt-1 text-sm text-slate-800">{viewProduct.purchasePrice != null ? viewProduct.purchasePrice.toLocaleString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{t("products.wholesalePrice")}</p>
                <p className="mt-1 text-sm text-slate-800">{viewProduct.pricingTiers?.jumlaMachines != null ? Number(viewProduct.pricingTiers.jumlaMachines).toLocaleString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{t("products.retailPrice")}</p>
                <p className="mt-1 text-sm text-slate-800">{viewProduct.pricingTiers?.newCustomer != null ? Number(viewProduct.pricingTiers.newCustomer).toLocaleString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">الكمية المتاحة</p>
                <p className="mt-1 text-sm text-slate-800">{inventoryByProduct[viewProduct.id] ?? 0}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{t("common.status")}</p>
                <p className="mt-1 text-sm text-slate-800">{viewProduct.isActive ? t("common.active") : t("common.inactive")}</p>
              </div>
            </div>
          </div>
        )}
      </FormModal>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none">
            <SearchInput value={search} onChange={setSearch} placeholder={`${t("common.search")} ${t("products.title")}`} />
          </div>
          <FilterSelect value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} options={[{ value: "SPARE_PART", label: t("products.sparePart") }, { value: "MACHINE", label: t("products.machine") }]} allLabel={`${t("products.type")} — ${t("common.all")}`} className="md:w-44" />
          <FilterSelect value={companyFilter} onChange={(v) => { setCompanyFilter(v); setPage(1); }} options={companies.map((c) => ({ value: c.id, label: c.nameAr || c.name }))} allLabel={`${t("warehouses.company")} — ${t("common.all")}`} className="md:w-52" />
          <FilterSelect value={activeFilter} onChange={(v) => { setActiveFilter(v); setPage(1); }} options={[{ value: "true", label: t("common.active") }, { value: "false", label: t("common.inactive") }]} allLabel={`${t("common.status")} — ${t("common.all")}`} className="md:w-36" />
          {hasActiveFilters && (<button onClick={() => { setSearch(""); setTypeFilter(""); setCompanyFilter(""); setActiveFilter(""); }} className="text-sm text-slate-500 underline transition hover:text-slate-700">{t("common.resetFilters")}</button>)}
          <div className="flex flex-wrap gap-2 md:ms-auto mt-2 md:mt-0"><RefreshButton onRefresh={refresh} refreshing={refreshing} /><ExportButton filename="products" getExport={exportProducts} disabled={filtered.length === 0} /></div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-start text-sm font-semibold text-slate-600">{t("products.name")}</th>
                <th className="px-4 py-3 text-start text-sm font-semibold text-slate-600">{t("products.type")}</th>
                <th className="px-4 py-3 text-start text-sm font-semibold text-slate-600">{t("warehouses.company")}</th>
                <th className="px-4 py-3 text-start text-sm font-semibold text-slate-600">SKU</th>
                <th className="px-4 py-3 text-start text-sm font-semibold text-slate-600">{t("products.purchasePrice")}</th>
                <th className="px-4 py-3 text-start text-sm font-semibold text-slate-600">الكمية المتاحة</th>
                <th className="px-4 py-3 text-start text-sm font-semibold text-slate-600">{t("common.status")}</th>
                <th className="px-4 py-3 text-start text-sm font-semibold text-slate-600">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="py-10"><div className="flex items-center justify-center"><PrinterLoader size="sm" label={t("common.loading")} /></div></td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-slate-400">{t("common.noData")}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-slate-400">{t("common.noData")}</td></tr>
              ) : (
                paged.map((product) => (
                  <tr key={product.id} className={`transition hover:bg-slate-50 ${product.isActive ? "" : "opacity-60"}`}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{product.name}</td>
                    <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${TYPE_BADGES[product.productType] || ""}`}>{product.productType === "MACHINE" ? t("products.machine") : t("products.sparePart")}</span></td>
                    <td className="px-4 py-3 text-sm text-slate-600">{product.company?.nameAr || product.company?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600"><span dir="ltr">{product.sku || "—"}</span></td>
                    <td className="px-4 py-3 text-sm text-slate-600">{product.purchasePrice != null ? product.purchasePrice.toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      {(() => {
                        const qty = inventoryByProduct[product.id] ?? 0;
                        return (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${qty > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                            {qty}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3"><button onClick={() => toggleActive(product)} title={t("common.edit")} className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${product.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{product.isActive ? t("common.active") : t("common.inactive")}</button></td>
                    <td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => setViewProduct(product)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-100"><Eye size={14} />{t("common.view")}</button><button onClick={() => openEdit(product)} className="text-sm font-medium text-sky-600 hover:text-sky-800"><Pencil size={14} className="me-1 inline-block" />{t("common.edit")}</button><button onClick={() => handleDelete(product.id)} className="text-sm font-medium text-red-600 hover:text-red-800"><Trash2 size={14} className="me-1 inline-block" />{t("common.delete")}</button></div></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 bg-slate-50/60 p-3"><Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} /></div>
      </div>
    </div>
  );
}
