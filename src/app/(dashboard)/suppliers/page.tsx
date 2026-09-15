"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import { Eye, FileText, Pencil, Plus, Trash2, Upload, Save, Wallet } from "lucide-react";
import ImportDialog from "@/components/ImportDialog";
import PrinterLoader from "@/components/PrinterLoader";
import { useConfirm, useToast } from "@/components/UIProvider";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import { apiErrorMessage } from "@/lib/api-client";
import { DateTimeCell } from "@/components/DateTimeCell";
import RefreshButton from "@/components/RefreshButton";
import SupplierStatementModal from "@/components/SupplierStatementModal";
import type { PurchaseOrderLite, PurchaseReturnLite } from "@/lib/supplier-statement";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  taxNumber: string;
  companyId: string;
  isActive: boolean;
  createdAt: string;
  company?: Company;
}
interface Company { id: string; name: string; }

const emptyForm = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  taxNumber: "",
  companyId: "",
};

export default function SuppliersPage() {
  const { t, dir } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyFilter, setCompanyFilter] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<PurchaseOrderLite[]>([]);
  const [returns, setReturns] = useState<PurchaseReturnLite[]>([]);
  const [statementId, setStatementId] = useState<string | null>(null);
  const PAGE_SIZE = 15;

  const fetchSuppliers = async () => {
    try {
      const [res, companyRes] = await Promise.all([fetch("/api/suppliers"), fetch("/api/companies")]);
      const data = await res.json();
      setSuppliers(data);
      setCompanies(await companyRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchSuppliers, ["suppliers", "purchases", "returns"]);

  const filtered = suppliers.filter(
    (s) =>
      (matchesQuery(s.name, search) ||
        matchesQuery(s.contactName, search) ||
        matchesQuery(s.email, search) ||
        matchesQuery(s.company?.name, search) ||
        (Boolean(s.phone) && s.phone.includes(search))) &&
      (!companyFilter || s.companyId === companyFilter)
  );
  const hasActiveFilters = companyFilter !== "" || search !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportSuppliers = () => ({
    headers: [
      t("suppliers.name"),
      t("common.company"),
      t("suppliers.contactName"),
      t("suppliers.phone"),
      t("suppliers.email"),
      t("suppliers.address"),
      t("suppliers.taxNumber"),
    ],
    rows: filtered.map((s) => [
      s.name,
      s.company?.name || "",
      s.contactName || "",
      s.phone || "",
      s.email || "",
      s.address || "",
      s.taxNumber || "",
    ]),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (supplier: Supplier) => {
    setSelected(null);
    setForm({
      name: supplier.name,
      contactName: supplier.contactName || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      taxNumber: supplier.taxNumber || "",
      companyId: supplier.companyId || "",
    });
    setEditingId(supplier.id);
    setFormError("");
    setShowForm(true);
  };

  const openDetails = (supplier: Supplier) => {
    setSelected(supplier);
  };

  const openStatement = async (supplierId: string) => {
    setStatementId(supplierId);
    if (orders.length === 0) {
      try {
        const [purRes, retRes] = await Promise.all([fetch("/api/purchases"), fetch("/api/returns")]);
        const [purData, retData] = await Promise.all([purRes.json(), retRes.json()]);
        setOrders(Array.isArray(purData?.orders) ? purData.orders : []);
        setReturns(Array.isArray(retData) ? retData : []);
      } catch {
        // Modal still opens; statement engine handles empty arrays.
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(editingId ? `/api/suppliers/${editingId}` : "/api/suppliers", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(apiErrorMessage(data, t));
        return;
      }
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      refresh();
      notifyDataChanged(["suppliers", "purchases"]);
      toastSuccess(t("common.savedSuccessfully"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("common.deleteConfirm") }))) return;
    const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toastError(apiErrorMessage(data, t));
      return;
    }
    setSelected(null);
    refresh();
    notifyDataChanged(["suppliers", "purchases"]);
    toastSuccess(t("common.deletedSuccessfully"));
  };

  const setField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div dir={dir} className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">
            {t("suppliers.title")}
            <span className="ms-2 text-sm font-medium text-gray-400">({filtered.length})</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/suppliers/balances"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 shadow-sm transition hover:bg-amber-100"
          >
            <Wallet size={16} />{t("suppliers.balancesBtn")}
          </Link>
          <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700">
            <Plus size={16} />{t("suppliers.addSupplier")}
          </button>
        </div>
      </div>

      {formError && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status">
          <span>{formError}</span>
          <button onClick={() => setFormError("")} aria-label={t("common.close")} className="text-inherit">✕</button>
        </div>
      )}

      <FormModal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? t("suppliers.editSupplier") : t("suppliers.addSupplier")} wide>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("suppliers.name")}</label>
            <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("suppliers.contactName")}</label>
            <input type="text" value={form.contactName} onChange={(e) => setField("contactName", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("suppliers.phone")}</label>
            <input type="text" value={form.phone} onChange={(e) => setField("phone", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("suppliers.email")}</label>
            <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("suppliers.address")}</label>
            <input type="text" value={form.address} onChange={(e) => setField("address", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("suppliers.taxNumber")}</label>
            <input type="text" value={form.taxNumber} onChange={(e) => setField("taxNumber", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("common.company")}</label>
            <select value={form.companyId} onChange={(e) => setField("companyId", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
              <option value="">{t("companies.selectCompany")}</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end md:col-span-2 lg:col-span-3">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      <FormModal open={!!selected} onClose={() => setSelected(null)} title={selected ? selected.name : ""} wide>
        {selected && (
          <>
            <div className="mb-4 grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("suppliers.name")}</span><span className="mt-1 block font-medium text-slate-800">{selected.name || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("common.company")}</span><span className="mt-1 block font-medium text-slate-800">{selected.company?.name || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("suppliers.contactName")}</span><span className="mt-1 block font-medium text-slate-800">{selected.contactName || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("suppliers.phone")}</span><span className="mt-1 block font-medium text-slate-800" dir="ltr">{selected.phone || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("suppliers.email")}</span><span className="mt-1 block font-medium text-slate-800" dir="ltr">{selected.email || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("suppliers.address")}</span><span className="mt-1 block font-medium text-slate-800">{selected.address || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("suppliers.taxNumber")}</span><span className="mt-1 block font-medium text-slate-800" dir="ltr">{selected.taxNumber || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("common.status")}</span><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${selected.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{selected.isActive ? t("common.active") : t("common.inactive")}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("common.creationDate")}</span><span className="mt-1 block font-medium text-slate-800"><DateTimeCell value={selected.createdAt} /></span></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.close")}</button>
              <button onClick={() => { const s = selected; setSelected(null); openStatement(s.id); }} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700">
                <FileText size={14} />{t("suppliers.statement")}
              </button>
              <button onClick={() => openEdit(selected)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                <Pencil size={14} />{t("common.edit")}
              </button>
              <button onClick={() => handleDelete(selected.id)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700">
                <Trash2 size={14} />{t("common.delete")}
              </button>
            </div>
          </>
        )}
      </FormModal>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
        <div className="w-full md:w-80 md:flex-none">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("suppliers.searchPlaceholder")}
          />
        </div>
        <FilterSelect
          value={companyFilter}
          onChange={(v) => { setCompanyFilter(v); setPage(1); }}
          options={companies.map((c) => ({ value: c.id, label: c.name }))}
          allLabel={`${t("common.company")} — ${t("common.all")}`}
          className="md:w-44"
        />
        {hasActiveFilters && (
          <button onClick={() => { setSearch(""); setCompanyFilter(""); }} className="text-sm text-gray-500 hover:text-gray-700 underline">
            {t("common.resetFilters")}
          </button>
        )}
        <div className="flex gap-2 md:ms-auto mt-2 md:mt-0">
          <RefreshButton onRefresh={refresh} refreshing={refreshing} />
          <ExportButton filename="suppliers" getExport={exportSuppliers} disabled={filtered.length === 0} />
          <button
            onClick={() => setShowImport(true)}
            className="border border-blue-600 text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-lg text-sm font-medium"
          >
            <Upload size={14} className="inline-block me-1" />{t("common.import")}
          </button>
        </div>
      </div>

        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : suppliers.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.name")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.contactName")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.phone")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.email")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.taxNumber")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paged.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{supplier.name}</td>
                    <td className="px-4 py-3 text-sm">{supplier.contactName || "—"}</td>
                    <td className="px-4 py-3 text-sm">{supplier.phone || "—"}</td>
                    <td className="px-4 py-3 text-sm">{supplier.email || "—"}</td>
                    <td className="px-4 py-3 text-sm">{supplier.taxNumber || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openStatement(supplier.id)} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100" title={t("suppliers.statement")}>
                          <FileText size={14} />{t("suppliers.statement")}
                        </button>
                        <button onClick={() => openDetails(supplier)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100" title={t("common.view")}>
                          <Eye size={14} />{t("common.view")}
                        </button>
                        <button onClick={() => openEdit(supplier)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100" title={t("common.edit")}>
                          <Pencil size={14} />{t("common.edit")}
                        </button>
                        <button onClick={() => handleDelete(supplier.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100" title={t("common.delete")}>
                          <Trash2 size={14} />{t("common.delete")}
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

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        entity="suppliers"
        title={`${t("common.import")} — ${t("suppliers.title")}`}
        onImported={refresh}
      />

      {statementId && (() => {
        const s = suppliers.find((x) => x.id === statementId) || null;
        return s ? (
          <SupplierStatementModal
            open={!!s}
            onClose={() => setStatementId(null)}
            supplierId={s.id}
            supplierName={s.name}
            companyName={s.company?.name}
            orders={orders}
            returns={returns}
          />
        ) : null;
      })()}
    </div>
  );
}