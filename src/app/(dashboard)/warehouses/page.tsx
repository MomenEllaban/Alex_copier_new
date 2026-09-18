"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import { Pencil, Plus, Save, Trash2, Box, ArrowDownToLine, ArrowUpFromLine, Warehouse as WarehouseIcon, Building2, Package } from "lucide-react";
import PrinterLoader from "@/components/PrinterLoader";
import { AddFormBoundary, useAutoAddForm } from "@/hooks/useAutoAddForm";
import { useConfirm, useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import FormModal from "@/components/FormModal";
import StatsCards from "@/components/StatsCards";
import SubmitButton from "@/components/SubmitButton";
import { DateTimeCell } from "@/components/DateTimeCell";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Company {
  id: string;
  name: string;
  nameAr?: string | null;
}

interface Warehouse {
  id: string;
  name: string;
  isMain: boolean;
  companyId: string;
  company?: Company;
  _count?: { inventory: number };
}

interface InventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  product?: { id: string; name: string; sku?: string | null; productType: string };
}

interface StockMovement {
  id: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  movementType: string;
  referenceId?: string | null;
  notes?: string | null;
  createdAt: string;
  product?: { id: string; name: string; sku?: string | null };
}

const MOVEMENT_LABELS: Record<string, { ar: string; en: string }> = {
  PURCHASE_IN: { ar: "وارد شراء", en: "Purchase In" },
  INTER_COMPANY_IN: { ar: "وارد بين الشركات", en: "Inter-Company In" },
  INTER_COMPANY_OUT: { ar: "صادر بين الشركات", en: "Inter-Company Out" },
  SALE_OUT: { ar: "صادر مبيعات", en: "Sale Out" },
  ENGINEER_CUSTODY_OUT: { ar: "عهدة مهندس (صادر)", en: "Engineer Custody Out" },
  ENGINEER_RETURN: { ar: "مرتجع مهندس", en: "Engineer Return" },
  CONSUMED: { ar: "مستهلك", en: "Consumed" },
  SCRAP: { ar: "مهمل", en: "Scrap" },
  ADJUSTMENT: { ar: "تسوية", en: "Adjustment" },
};

function movementLabel(type: string, lang: string) {
  const entry = MOVEMENT_LABELS[type];
  return entry ? entry[lang === "ar" ? "ar" : "en"] : type;
}

function isIncoming(type: string) {
  return ["PURCHASE_IN", "INTER_COMPANY_IN", "ENGINEER_RETURN"].includes(type);
}

const emptyForm = { name: "", companyId: "", isMain: false };

export default function WarehousesPage() {
  const { t, dir } = useI18n();
  const lang = dir === "rtl" ? "ar" : "en";
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [detailWarehouse, setDetailWarehouse] = useState<Warehouse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailInventory, setDetailInventory] = useState<InventoryItem[]>([]);
  const [detailMovements, setDetailMovements] = useState<StockMovement[]>([]);
  const [detailTab, setDetailTab] = useState<"inventory" | "movements">("inventory");

  const fetchData = async () => {
    try {
      const [wRes, cRes] = await Promise.all([fetch("/api/warehouses"), fetch("/api/companies")]);
      const [wData, cData] = await Promise.all([wRes.json(), cRes.json()]);
      setWarehouses(Array.isArray(wData) ? wData : []);
      setCompanies(Array.isArray(cData) ? cData : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchData, ["warehouses", "inventory", "products", "purchases"]);

  const autoAddOpen = useAutoAddForm();
  useEffect(() => {
    if (autoAddOpen) setShowForm(true);
  }, [autoAddOpen]);

  const openDetail = async (warehouse: Warehouse) => {
    setDetailWarehouse(warehouse);
    setDetailLoading(true);
    setDetailTab("inventory");
    try {
      const res = await fetch(`/api/warehouses/${warehouse.id}/inventory`);
      const data = await res.json();
      setDetailInventory(Array.isArray(data.inventory) ? data.inventory : []);
      setDetailMovements(Array.isArray(data.movements) ? data.movements : []);
    } catch {
      setDetailInventory([]);
      setDetailMovements([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = warehouses.filter(
    (w) =>
      (matchesQuery(w.name, search) ||
        matchesQuery(w.company?.nameAr, search) ||
        matchesQuery(w.company?.name, search)) &&
      (!companyFilter || w.companyId === companyFilter)
  );
  const hasActiveFilters = companyFilter !== "" || search !== "";

  const stats = useMemo(() => {
    const items = warehouses.reduce((sum, w) => sum + (w._count?.inventory || 0), 0);
    const companiesCount = new Set(warehouses.filter((w) => w.companyId).map((w) => w.companyId)).size;
    return {
      total: warehouses.length,
      main: warehouses.filter((w) => w.isMain).length,
      items,
      companiesCount,
    };
  }, [warehouses]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportWarehouses = () => ({
    headers: [t("warehouses.name"), t("warehouses.company"), t("warehouses.isMain"), t("warehouses.itemsCount")],
    rows: filtered.map((w) => [
      w.name,
      w.company?.nameAr || w.company?.name || "",
      w.isMain ? t("common.yes") : t("common.no"),
      String(w._count?.inventory ?? 0),
    ]),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setShowForm(!showForm);
  };

  const openEdit = (warehouse: Warehouse) => {
    setForm({ name: warehouse.company?.nameAr || warehouse.company?.name || warehouse.name, companyId: warehouse.companyId, isMain: warehouse.isMain });
    setEditingId(warehouse.id);
    setError("");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(editingId ? `/api/warehouses/${editingId}` : "/api/warehouses", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(data, t));
        return;
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      refresh();
      notifyDataChanged(["warehouses", "inventory"]);
      toastSuccess(t("common.savedSuccessfully"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("warehouses.deleteConfirm") }))) return;
    const res = await fetch(`/api/warehouses/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toastError(apiErrorMessage(data, t));
      return;
    }
    refresh();
    notifyDataChanged(["warehouses", "inventory"]);
    toastSuccess(t("common.deletedSuccessfully"));
  };

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">{t("warehouses.title")}</h1>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
        >
<Plus size={16} />{t("warehouses.addWarehouse")}
        </button>

      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("warehouses.stats.total"), value: stats.total.toLocaleString("ar-EG"), icon: <WarehouseIcon size={18} />, tone: "sky" },
          { label: t("warehouses.stats.main"), value: stats.main.toLocaleString("ar-EG"), icon: <Building2 size={18} />, tone: "green" },
          { label: t("warehouses.stats.items"), value: stats.items.toLocaleString("ar-EG"), icon: <Package size={18} />, tone: "purple" },
          { label: t("warehouses.stats.companies"), value: stats.companiesCount.toLocaleString("ar-EG"), icon: <Box size={18} />, tone: "amber" },
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

      <FormModal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? t("warehouses.editWarehouse") : t("warehouses.addWarehouse")}>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("warehouses.company")}</label>
            <select
              value={form.companyId}
              onChange={(e) => {
                const companyId = e.target.value;
                const company = companies.find((c) => c.id === companyId);
                setForm({ ...form, companyId, name: company ? (company.nameAr || company.name) : "" });
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">{t("common.selectOption")}</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nameAr || company.name}
                </option>
              ))}
            </select>
          </div>
          <input type="hidden" value={form.name} />
          <div className="flex items-end gap-2 pb-1">
            <input
              id="warehouse-isMain"
              type="checkbox"
              checked={form.isMain}
              onChange={(e) => setForm({ ...form, isMain: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="warehouse-isMain" className="text-sm font-medium">
              {t("warehouses.isMain")}
            </label>
          </div>
          <div className="md:col-span-3 flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      <FormModal open={!!detailWarehouse} onClose={() => setDetailWarehouse(null)} title={detailWarehouse ? `${t("warehouses.inventoryDetails")} — ${detailWarehouse.name}` : ""} wide>
        {detailLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <PrinterLoader size="sm" label={t("common.loading")} />
          </div>
        ) : (
          <>
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setDetailTab("inventory")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${detailTab === "inventory" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                <Box size={14} className="inline-block me-1.5" />{t("warehouses.itemsCount")} ({detailInventory.length})
              </button>
              <button
                onClick={() => setDetailTab("movements")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${detailTab === "movements" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {t("warehouses.movements")} ({detailMovements.length})
              </button>
            </div>

            {detailTab === "inventory" && (
              detailInventory.length === 0 ? (
                <div className="flex min-h-[120px] items-center justify-center">
                  <p className="text-sm text-gray-400">{t("warehouses.noInventory")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full min-w-[480px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">#</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("warehouses.product")}</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("warehouses.sku")}</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("warehouses.quantity")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {detailInventory.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-500">{idx + 1}</td>
                          <td className="px-4 py-3 text-sm font-medium">{item.product?.name || "—"}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{item.product?.sku || "—"}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex whitespace-nowrap rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                              {item.quantity}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {detailTab === "movements" && (
              detailMovements.length === 0 ? (
                <div className="flex min-h-[120px] items-center justify-center">
                  <p className="text-sm text-gray-400">{t("warehouses.noInventory")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full min-w-[640px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">#</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("warehouses.date")}</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("warehouses.product")}</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("warehouses.movementType")}</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("warehouses.quantity")}</th>
                        <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("warehouses.notes")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {detailMovements.map((m, idx) => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-500">{idx + 1}</td>
                          <td className="px-4 py-3 text-sm text-gray-500"><DateTimeCell value={m.createdAt} /></td>
                          <td className="px-4 py-3 text-sm font-medium">{m.product?.name || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${isIncoming(m.movementType) ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                              {isIncoming(m.movementType) ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />}
                              {movementLabel(m.movementType, lang)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-semibold ${isIncoming(m.movementType) ? "text-green-600" : "text-red-600"}`}>
                              {isIncoming(m.movementType) ? "+" : "-"}{m.quantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{m.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </FormModal>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={`${t("common.search")} ${t("warehouses.title")}`}
            />
          </div>
          <FilterSelect
            value={companyFilter}
            onChange={(v) => { setCompanyFilter(v); setPage(1); }}
            options={companies.map((c) => ({ value: c.id, label: c.nameAr || c.name }))}
            allLabel={`${t("warehouses.company")} — ${t("common.all")}`}
            className="md:w-52"
          />
          {hasActiveFilters && (
            <button
              onClick={() => { setSearch(""); setCompanyFilter(""); }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              {t("common.resetFilters")}
            </button>
          )}
          <div className="flex flex-wrap gap-2 md:ms-auto mt-2 md:mt-0"><RefreshButton onRefresh={refresh} refreshing={refreshing} /><ExportButton filename="warehouses" getExport={exportWarehouses} disabled={filtered.length === 0} /></div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : warehouses.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("warehouses.name")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("warehouses.company")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("warehouses.isMain")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("warehouses.itemsCount")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paged.map((warehouse) => (
                  <tr key={warehouse.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{warehouse.name}</td>
                    <td className="px-4 py-3 text-sm">{warehouse.company?.nameAr || warehouse.company?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex whitespace-nowrap px-2 py-1 rounded-full text-xs font-medium ${warehouse.isMain ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                        {warehouse.isMain ? t("common.yes") : t("common.no")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openDetail(warehouse)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 hover:text-blue-800 cursor-pointer"
                      >
                        <Box size={13} />
                        {warehouse._count?.inventory ?? 0}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(warehouse)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          <Pencil size={14} className="inline-block me-1" />{t("common.edit")}
                        </button>
                        <button
                          onClick={() => handleDelete(warehouse.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          <Trash2 size={14} className="inline-block me-1" />{t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        )}
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
        />
      </div>
    </div>
  );
}
