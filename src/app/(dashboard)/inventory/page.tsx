"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import { useToast } from "@/components/UIProvider";
import { useUrlParams, useSearchWithDefault } from "@/hooks/useUrlParams";
import { apiErrorMessage } from "@/lib/api-client";
import { Save } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import SearchableSelect from "@/components/SearchableSelect";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface InventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  product?: { id: string; name: string; sku?: string | null; productType: string };
  warehouse?: { id: string; name: string; companyId?: string };
}
interface Warehouse { id: string; name: string; companyId?: string; }
interface Product { id: string; name: string; sku?: string | null; productType: string; }
interface Company { id: string; name: string; nameAr?: string | null; }

interface StockMovementForm {
  warehouseId: string;
  productId: string;
  quantity: number;
  movementType: string;
  notes: string;
}

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_IN: "وارد شراء",
  INTER_COMPANY_IN: "وارد بين الشركات",
  INTER_COMPANY_OUT: "صادر بين الشركات",
  SALE_OUT: "صادر مبيعات",
  ENGINEER_CUSTODY_OUT: "عهدة مهندس (صادر)",
  ENGINEER_RETURN: "مرتجع مهندس",
  CONSUMED: "مستهلك",
  SCRAP: "مهمل",
  ADJUSTMENT: "تسوية",
};

export default function InventoryPage() {
  const { t, dir } = useI18n();
  
  const { success: toastSuccess, error: toastError } = useToast();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const urlParams = useUrlParams(["q"]);
  const [search, setSearchInput] = useSearchWithDefault(urlParams.q ?? "");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<StockMovementForm>({
    warehouseId: "",
    productId: "",
    quantity: 1,
    movementType: "PURCHASE_IN",
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const companyMap = companies.reduce<Record<string, string>>((acc, company) => {
    const normalized = (company.nameAr || company.name || "").toLowerCase();
    if (normalized.includes("جملة") && normalized.includes("آلات")) acc.jumlaMachines = company.id;
    if (normalized.includes("جملة") && normalized.includes("قطع")) acc.jumlaParts = company.id;
    if (normalized.includes("قطاعي") || normalized.includes("قطاعى")) acc.sectori = company.id;
    return acc;
  }, {});

  const filtered = inventory.filter((item) => {
    const matchesCompany = (() => {
      if (!companyFilter) return true;
      const companyId = item.warehouse?.companyId;
      if (companyFilter === "jumla-both") {
        return [companyMap.jumlaMachines, companyMap.jumlaParts].includes(companyId || "");
      }
      return companyId === companyMap[companyFilter as keyof typeof companyMap];
    })();

    return (
      matchesCompany &&
      (!warehouseFilter || item.warehouseId === warehouseFilter) &&
      (matchesQuery(item.product?.name, search) ||
        matchesQuery(item.product?.sku, search) ||
        matchesQuery(item.warehouse?.name, search))
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportInventory = () => ({
    headers: [
      t("inventory.product"),
      t("inventory.product") + " SKU",
      t("inventory.warehouse"),
      t("inventory.quantity"),
    ],
    rows: filtered.map((item) => [
      item.product?.name || item.productId,
      item.product?.sku || "",
      item.warehouse?.name || item.warehouseId,
      String(item.quantity),
    ]),
  });

  const fetchInventory = () => {
    Promise.all([
      fetch("/api/inventory?catalog=true"),
      fetch("/api/companies"),
    ])
      .then(async ([inventoryRes, companiesRes]) => {
        const data = await inventoryRes.json();
        const companyData = await companiesRes.json();
        setInventory(Array.isArray(data.inventory) ? data.inventory : []);
        setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []);
        setProducts(Array.isArray(data.products) ? data.products : []);
        setCompanies(Array.isArray(companyData) ? companyData : []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchInventory();
  }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchInventory, ["inventory", "products", "purchases", "returns", "warehouses", "sales"]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const response = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toastError(apiErrorMessage(data, t));
      setSaving(false);
      return;
    }
    setSaving(false);
    setForm({ warehouseId: "", productId: "", quantity: 1, movementType: "PURCHASE_IN", notes: "" });
    setShowForm(false);
    refresh();
    notifyDataChanged(["inventory", "products", "warehouses"]);
    toastSuccess(t("common.savedSuccessfully"));
  };

  return (
    <div dir={dir} className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{t("inventory.title")}</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
        >
          {t("inventory.addStockMovement")}
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{t("inventory.stockMovement")}</h2>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("inventory.warehouse")}</label>
              <select
                value={form.warehouseId}
                onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
                required
              ><option value="">{t("common.selectOption")}</option>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("inventory.product")}</label>
              <SearchableSelect
                value={form.productId}
                onChange={(v) => setForm({ ...form, productId: v })}
                options={products.map(product => ({ value: product.id, label: `${product.name}${product.sku ? ` · ${product.sku}` : ""}` }))}
                placeholder={t("common.selectOption")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("inventory.quantity")}</label>
              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("inventory.movementType")}</label>
              <select
                value={form.movementType}
                onChange={(e) => setForm({ ...form, movementType: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
              >
                {Object.entries(MOVEMENT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("common.notes")}</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
                rows={3}
              />
            </div>
            <div className="md:col-span-2 flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200">
                {t("common.cancel")}
              </button>
              <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Save size={16} /></SubmitButton>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:flex-wrap md:items-center">
          <div className="w-full md:w-80 md:flex-none">
            <SearchInput value={search} onChange={setSearchInput} placeholder={`${t("common.search")} ${t("inventory.product")} / SKU...`} />
          </div>
          <FilterSelect value={companyFilter} onChange={(v) => { setCompanyFilter(v); setPage(1); }} options={[
            { value: "", label: `الشركة — ${t("common.all")}` },
            { value: "jumla-machines", label: "شركة جملة الآلات" },
            { value: "jumla-parts", label: "شركة جملة قطع غيار" },
            { value: "sectori", label: "شركة قطاعي" },
            { value: "jumla-both", label: "جملة الآلات + جملة قطع غيار" },
          ]} allLabel={`الشركة — ${t("common.all")}`} className="md:w-52" />
          <FilterSelect value={warehouseFilter} onChange={(v) => { setWarehouseFilter(v); setPage(1); }} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} allLabel={`${t("inventory.warehouse")} — ${t("common.all")}`} className="md:w-44" />
          {(search !== "" || warehouseFilter !== "" || companyFilter !== "") && (
            <button onClick={() => { setSearchInput(null); setWarehouseFilter(""); setCompanyFilter(""); }} className="text-sm text-slate-500 underline transition hover:text-slate-700">
              {t("common.resetFilters")}
            </button>
          )}
          <div className="flex flex-wrap gap-2 md:ms-auto mt-2 md:mt-0">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton filename="inventory" getExport={exportInventory} disabled={filtered.length === 0} />
          </div>
        </div>
        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-slate-600">{t("inventory.product")}</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-slate-600">{t("inventory.warehouse")}</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-slate-600">{t("inventory.quantity")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.product?.name || item.productId}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.warehouse?.name || item.warehouseId}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${item.quantity > 10 ? "bg-emerald-100 text-emerald-700" : item.quantity > 0 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                        {item.quantity}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">{t("common.noData")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-200 bg-slate-50/60 p-3">
          <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
        </div>
      </div>
    </div>
  );
}
