"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useI18n } from "@/i18n/context";
import { useRouter } from "next/navigation";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import Pagination from "@/components/Pagination";
import { ArrowRight, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import PrinterLoader from "@/components/PrinterLoader";
import { AddFormBoundary } from "@/hooks/useAutoAddForm";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import { useConfirm, useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Company { id: string; name: string; }
interface Category {
  id: string; name: string; companyId: string;
  company?: { id: string; name: string };
}

export default function ExpenseCategoriesPage() {
  const { t, dir } = useI18n();
  const router = useRouter();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ name: "", companyId: "" });

  const PAGE_SIZE = 10;

  const fetchData = async () => {
    try {
      const [cRes, coRes] = await Promise.all([fetch("/api/expense-categories"), fetch("/api/companies")]);
      if (cRes.status === 401 || coRes.status === 401) {
        signOut({ callbackUrl: "/login" });
        return;
      }
      const catData = await cRes.json().catch(() => []);
      const coData = await coRes.json().catch(() => []);
      setCategories(Array.isArray(catData) ? catData : []);
      setCompanies(Array.isArray(coData) ? coData : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchData, ["expenses", "companies"]);

  useEffect(() => {
    const handler = () => setShowForm(true);
    window.addEventListener("erp-open-add", handler);
    return () => window.removeEventListener("erp-open-add", handler);
  }, []);

  const filtered = categories.filter((cat) =>
    (!companyFilter || cat.companyId === companyFilter) &&
    (matchesQuery(cat.name, search) || matchesQuery(cat.company?.name, search))
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openCreate = () => {
    setForm({ name: "", companyId: "" });
    setEditingId(null);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (cat: Category) => {
    setForm({ name: cat.name, companyId: cat.companyId });
    setEditingId(cat.id);
    setFormError("");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    const res = await fetch(editingId ? `/api/expense-categories/${editingId}` : "/api/expense-categories", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.status === 401) {
      signOut({ callbackUrl: "/login" });
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setFormError(apiErrorMessage(data, t));
      return;
    }
    setForm({ name: "", companyId: "" });
    setEditingId(null);
    setShowForm(false);
    toastSuccess(t("common.savedSuccessfully"));
    refresh();
    notifyDataChanged(["expenses"]);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: `${t("finance.deleteCategoryConfirm")} ${t("common.deleteConfirm")}` }))) return;
    const res = await fetch(`/api/expense-categories/${id}`, { method: "DELETE" });
    if (res.status === 401) {
      signOut({ callbackUrl: "/login" });
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toastError(apiErrorMessage(data, t));
      return;
    }
    toastSuccess(t("common.deletedSuccessfully"));
    refresh();
    notifyDataChanged(["expenses"]);
  };

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/expenses")} className="inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-600 transition hover:bg-gray-50" title={t("common.back")}>
              <ArrowRight size={18} />
            </button>
            <p className="text-xs font-medium tracking-[0.2em] text-orange-600 uppercase">ERP</p>
          </div>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">
            {t("finance.expenseCategories")}
            <span className="ms-2 text-sm font-medium text-gray-400">({filtered.length})</span>
          </h1>
        </div>
        <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700"><Plus size={16} />{t("finance.addCategory")}</button>
      </div>

      {formError && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status">
          <span>{formError}</span>
          <button onClick={() => setFormError("")} aria-label={t("common.close")} className="text-inherit">✕</button>
        </div>
      )}

      <FormModal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? t("finance.editCategory") : t("finance.addCategory")}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("common.company")}</label><select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required><option value="">{t("finance.selectCompany")}</option>{companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></div>
          <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("finance.categoryName")}</label><input type="text" placeholder={t("finance.categoryName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required disabled={!!editingId} /></div>
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"><X size={16} className="ms-1 inline-block" />{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-orange-600 hover:bg-orange-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none"><SearchInput value={search} onChange={setSearch} placeholder={t("finance.searchCategoryPlaceholder")} /></div>
          <FilterSelect value={companyFilter} onChange={(v) => { setCompanyFilter(v); setPage(1); }} options={companies.map((c) => ({ value: c.id, label: c.name }))} allLabel={`${t("common.company")} — ${t("common.all")}`} className="md:w-40" />
          <div className="md:ms-auto">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
          </div>
        </div>
        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : categories.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("finance.categoryName")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.company")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paged.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{cat.name}</td>
                    <td className="px-4 py-3 text-sm">{cat.company?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(cat)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100" title={t("common.edit")}>
                          <Pencil size={14} />{t("common.edit")}
                        </button>
                        <button onClick={() => handleDelete(cat.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100" title={t("common.delete")}>
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
    </div>
  );
}
