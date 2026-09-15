"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import DateRangeFilter, { inDateRange } from "@/components/DateRangeFilter";
import { Eye, Pencil, Plus, Save, Tags, Trash2, X } from "lucide-react";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import { AddFormBoundary } from "@/hooks/useAutoAddForm";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import { DateTimeCell } from "@/components/DateTimeCell";
import { useConfirm, useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Company { id: string; name: string; }
interface Category { id: string; name: string; }
interface Expense {
  id: string; companyId: string; categoryId: string | null; category: string; description: string; amount: number;
  paidBy: string; date: string; createdAt: string; company: Company;
  payer?: { id: string; name?: string | null };
  expenseCategory?: { id: string; name: string } | null;
}

const payerName = (expense: Expense) => expense.payer?.name || expense.paidBy;

export default function FinancePage() {
  const { t, dir } = useI18n();
  const router = useRouter();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ companyId: "", categoryId: "", category: "", description: "", amount: "" });
  const PAGE_SIZE = 15;

  const fetchData = async () => {
    try {
      const [eRes, cRes, catRes] = await Promise.all([fetch("/api/expenses"), fetch("/api/companies"), fetch("/api/expense-categories")]);
      if (eRes.status === 401 || cRes.status === 401) {
        signOut({ callbackUrl: "/login" });
        return;
      }
      const cats = await catRes.json().catch(() => []);
      const eData = await eRes.json().catch(() => []);
      setExpenses(Array.isArray(eData) ? eData : []);
      const cData = await cRes.json().catch(() => []);
      setCompanies(Array.isArray(cData) ? cData : []);
      setCategories(Array.isArray(cats) ? cats : []);
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

  const filtered = expenses.filter(expense =>
    (!companyFilter || expense.companyId === companyFilter) &&
    (!categoryFilter || (expense.expenseCategory?.id || expense.categoryId) === categoryFilter) &&
    inDateRange(expense.date || expense.createdAt, dateFrom, dateTo) &&
    (matchesQuery(expense.category, search) ||
      matchesQuery(expense.description, search) ||
      matchesQuery(expense.company?.name, search))
  );
  const hasActiveFilters = companyFilter !== "" || categoryFilter !== "" || dateFrom !== "" || dateTo !== "" || search !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const categoryOptions = categories.map((cat) => ({ value: cat.id, label: cat.name }));

  const exportExpenses = () => ({
    headers: [
      t("common.date"),
      t("common.company"),
      t("finance.category"),
      t("common.description"),
      t("common.amount"),
      t("finance.paidBy"),
    ],
    rows: filtered.map((expense) => [
      new Date(expense.date || expense.createdAt).toISOString().slice(0, 10),
      expense.company?.name || "",
      expense.expenseCategory?.name || expense.category,
      expense.description,
      String(expense.amount),
      payerName(expense),
    ]),
  });

  const openCreate = () => {
    setForm({ companyId: "", categoryId: "", category: "", description: "", amount: "" });
    setEditingId(null);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (expense: Expense) => {
    setSelected(null);
    setForm({
      companyId: expense.companyId,
      categoryId: expense.expenseCategory?.id || expense.categoryId || "",
      category: expense.expenseCategory?.name || expense.category,
      description: expense.description,
      amount: String(expense.amount),
    });
    setEditingId(expense.id);
    setFormError("");
    setShowForm(true);
  };

  const selectCategory = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    setForm((f) => ({ ...f, categoryId, category: cat?.name || "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    const res = await fetch(editingId ? `/api/expenses/${editingId}` : "/api/expenses", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, categoryId: form.categoryId || null, category: form.category || (categories.find((c) => c.id === form.categoryId)?.name || ""), amount: parseFloat(form.amount) || 0 }),
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
    setForm({ companyId: "", categoryId: "", category: "", description: "", amount: "" });
    setEditingId(null);
    setShowForm(false);
    toastSuccess(t("common.savedSuccessfully"));
    refresh();
    notifyDataChanged(["expenses"]);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("common.deleteConfirm") }))) return;
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (res.status === 401) {
      signOut({ callbackUrl: "/login" });
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toastError(apiErrorMessage(data, t));
      return;
    }
    setSelected(null);
    toastSuccess(t("common.deletedSuccessfully"));
    refresh();
    notifyDataChanged(["expenses"]);
  };

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
            <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">
              {t("finance.expenses")}
              <span className="ms-2 text-sm font-medium text-gray-400">({filtered.length})</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"><Plus size={16} />{t("finance.newExpense")}</button>
            <button onClick={() => router.push("/expenses/categories")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"><Tags size={16} />{t("finance.expenseCategories")}</button>
          </div>
        </div>

        {formError && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status">
            <span>{formError}</span>
            <button onClick={() => setFormError("")} aria-label={t("common.close")} className="text-inherit">✕</button>
          </div>
        )}

        <FormModal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? t("finance.editExpense") : t("finance.newExpense")}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("finance.selectCompany")}</label><select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required><option value="">{t("finance.selectCompany")}</option>{companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("finance.category")}</label><select value={form.categoryId} onChange={(e) => selectCategory(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required><option value="">{t("finance.selectCategory")}</option>{categoryOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select></div>
              <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("common.amount")}</label><input type="number" placeholder={t("common.amount")} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required min="0" step="0.01" /></div>
            </div>
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("common.description")}</label><textarea placeholder={t("common.description")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} required /></div>
            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"><X size={16} className="ms-1 inline-block" />{t("common.cancel")}</button>
              <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
            </div>
          </form>
        </FormModal>

        <FormModal open={!!selected} onClose={() => setSelected(null)} title={selected ? t("finance.expenses") : ""} wide>
          {selected && (
            <>
              <div className="mb-4 grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("common.date")}</span><span className="mt-1 block font-medium text-slate-800"><DateTimeCell value={selected.date || selected.createdAt} /></span></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("common.company")}</span><span className="mt-1 block font-medium text-slate-800">{selected.company?.name || "—"}</span></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("finance.category")}</span><span className="mt-1 block font-medium text-slate-800">{selected.expenseCategory?.name || selected.category}</span></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("common.amount")}</span><span className="mt-1 block font-bold text-slate-800">{selected.amount.toLocaleString()}</span></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("finance.paidBy")}</span><span className="mt-1 block font-medium text-slate-800">{payerName(selected)}</span></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 md:col-span-2 xl:col-span-3"><span className="block text-xs text-gray-500">{t("common.description")}</span><span className="mt-1 block font-medium text-slate-800">{selected.description}</span></div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setSelected(null)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.close")}</button>
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
            <div className="w-full md:w-80 md:flex-none"><SearchInput value={search} onChange={setSearch} placeholder={t("finance.searchPlaceholder")} /></div>
            <FilterSelect value={companyFilter} onChange={(v) => { setCompanyFilter(v); setPage(1); }} options={companies.map((c) => ({ value: c.id, label: c.name }))} allLabel={`${t("common.company")} — ${t("common.all")}`} className="md:w-40" />
            <FilterSelect value={categoryFilter} onChange={(v) => { setCategoryFilter(v); setPage(1); }} options={categoryOptions} allLabel={`${t("finance.categoryFilter")} — ${t("common.all")}`} className="md:w-44" />
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={(v) => { setDateFrom(v); setPage(1); }} onToChange={(v) => { setDateTo(v); setPage(1); }} />
            {hasActiveFilters && (
              <button onClick={() => { setSearch(""); setCompanyFilter(""); setCategoryFilter(""); setDateFrom(""); setDateTo(""); }} className="text-sm text-gray-500 hover:text-gray-700 underline">
                {t("common.resetFilters")}
              </button>
            )}
            <div className="flex flex-wrap gap-2 md:ms-auto mt-2 md:mt-0">
              <RefreshButton onRefresh={refresh} refreshing={refreshing} />
              <ExportButton filename="expenses" getExport={exportExpenses} disabled={filtered.length === 0} />
            </div>
          </div>
          {loading ? (
            <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
              <PrinterLoader size="md" label={t("common.loading")} />
            </div>
          ) : expenses.length === 0 ? (
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
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.date")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("finance.category")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.description")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.company")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.amount")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("finance.paidBy")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paged.map((expense) => (
                    <tr key={expense.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm"><DateTimeCell value={expense.date || expense.createdAt} /></td>
                      <td className="px-4 py-3 text-sm">{expense.expenseCategory?.name || expense.category}</td>
                      <td className="px-4 py-3 text-sm">{expense.description}</td>
                      <td className="px-4 py-3 text-sm">{expense.company?.name || "—"}</td>
                      <td className="px-4 py-3 text-sm">{expense.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm">{payerName(expense)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setSelected(expense)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100" title={t("common.view")}>
                            <Eye size={14} />{t("common.view")}
                          </button>
                          <button onClick={() => openEdit(expense)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100" title={t("common.edit")}>
                            <Pencil size={14} />{t("common.edit")}
                          </button>
                          <button onClick={() => handleDelete(expense.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100" title={t("common.delete")}>
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
          <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
        </div>
      </div>
    </div>
  );
}
