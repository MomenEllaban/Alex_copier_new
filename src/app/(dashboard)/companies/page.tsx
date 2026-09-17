"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/context";
import PrinterLoader from "@/components/PrinterLoader";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import { apiErrorMessage } from "@/lib/api-client";
import { AddFormBoundary, useAutoAddForm } from "@/hooks/useAutoAddForm";
import { useToast, useConfirm } from "@/components/UIProvider";
import { FileText, Pencil, Plus, Save, Trash2, Eraser, Building2, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import FormModal from "@/components/FormModal";
import StatsCards from "@/components/StatsCards";
import SubmitButton from "@/components/SubmitButton";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface CompanyData {
  id: string;
  name: string;
  nameAr: string | null;
  taxNumber?: string | null;
  tradeRegister?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  salesReturns: number;
  purchaseReturns: number;
  totalSettlements: number;
  netProfit: number;
  counts: {
    salesOrders: number;
    purchaseOrders: number;
  };
}

const COMPANY_ICONS: Record<string, string> = {
  "شركة جملة آلات": "🖨️",
  "شركة جملة قطع غيار": "🔧",
  "شركة القطاعي": "⚡",
};

const emptyForm = {
  name: "",
  nameAr: "",
  taxNumber: "",
  tradeRegister: "",
  address: "",
  phone: "",
  email: "",
};

export default function CompaniesPage() {
  const { t, dir } = useI18n();
  const router = useRouter();

  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resettingId, setResettingId] = useState<string | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();
  const confirmAction = useConfirm();

  const fetchCompanies = () => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((data) => {
        setCompanies(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchCompanies();
  }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchCompanies, ["companies", "expenses"]);

  const autoAddOpen = useAutoAddForm();
  useEffect(() => {
    if (autoAddOpen) setShowForm(true);
  }, [autoAddOpen]);

  const totalSales = companies.reduce((s, c) => s + c.totalSales, 0);
  const totalPurchases = companies.reduce((s, c) => s + c.totalPurchases, 0);
  const totalExpenses = companies.reduce((s, c) => s + (c.totalExpenses || 0), 0);
  const totalNetProfit = companies.reduce((s, c) => s + c.netProfit, 0);

  const filtered = companies.filter((c) =>
    matchesQuery(c.name, search) ||
    (Boolean(c.nameAr) && matchesQuery(c.nameAr || "", search))
  );

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setShowForm(!showForm);
  };

  const openEdit = (company: CompanyData) => {
    setForm({
      name: company.name,
      nameAr: company.nameAr || "",
      taxNumber: company.taxNumber || "",
      tradeRegister: company.tradeRegister || "",
      address: company.address || "",
      phone: company.phone || "",
      email: company.email || "",
    });
    setEditingId(company.id);
    setError("");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(editingId ? `/api/companies/${editingId}` : "/api/companies", {
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
      notifyDataChanged(["companies"]);
      toastSuccess(t("common.savedSuccessfully"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("companies.deleteConfirm") }))) return;
    const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toastError(apiErrorMessage(data, t));
      return;
    }
    refresh();
    notifyDataChanged(["companies"]);
    toastSuccess(t("common.deletedSuccessfully"));
  };

  const handleReset = async (company: CompanyData) => {
    if (resettingId) return;
    if (
      !(await confirmAction({
        title: t("companies.resetData.confirmTitle"),
        message: `${company.name}\n${t("companies.resetData.confirmMessage")}`,
      }))
    )
      return;
    setResettingId(company.id);
    try {
      const res = await fetch(`/api/companies/${company.id}/reset-transactions`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toastError(apiErrorMessage(data, t, "companies.resetData.failed"));
        return;
      }
      refresh();
      notifyDataChanged(["companies"]);
      toastSuccess(t("companies.resetData.success"));
    } catch {
      toastError(t("companies.resetData.failed"));
    } finally {
      setResettingId(null);
    }
  };

  if (loading) {
    return (
      <div dir={dir} className="flex min-h-[50vh] items-center justify-center px-4">
        <PrinterLoader size="md" label={t("common.loading")} />
      </div>
    );
  }

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">{t("companies.title")}</h1>
          <p className="text-gray-500 mt-1">{t("companies.overview")}</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
        >
          <Plus size={16} />{t("companies.addCompany")}
        </button>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("companies.statsCount"), value: filtered.length.toLocaleString("ar-EG"), icon: <Building2 size={18} />, tone: "sky" },
          { label: t("companies.revenue"), value: `${totalSales.toLocaleString("ar-EG")} ج.م`, icon: <TrendingUp size={18} />, tone: "green" },
          { label: t("companies.expenses"), value: `${totalExpenses.toLocaleString("ar-EG")} ج.م`, icon: <TrendingDown size={18} />, tone: "red" },
          { label: t("companies.netProfit"), value: `${totalNetProfit.toLocaleString("ar-EG")} ج.م`, icon: <Wallet size={18} />, tone: totalNetProfit >= 0 ? "emerald" : "rose" },
        ]}
      />

      {(error) && (
        <div
          className={`mb-4 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-800"
          }`}
          role="status"
        >
          <span>{error}</span>
          <button onClick={() => { setError(""); }} aria-label={t("common.close")} className="text-inherit">✕</button>
        </div>
      )}

      <FormModal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? t("companies.editCompany") : t("companies.addCompany")} wide>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(
            [
              ["name", t("companies.legalName")],
              ["nameAr", t("companies.tradeName")],
              ["taxNumber", t("companies.taxNumber")],
              ["tradeRegister", t("companies.tradeRegister")],
              ["phone", t("common.phone")],
              ["email", t("customers.email")],
            ] as const
          ).map(([field, label]) => (
            <div key={field} className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{label}</label>
              <input
                type={field === "email" ? "email" : "text"}
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required={field === "name"}
              />
            </div>
          ))}
          <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
            <label className="block text-sm font-medium text-slate-700">{t("customers.address")}</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3 flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">{t("companies.allCompanies")}</p>
          <p className="text-3xl font-bold mt-1">{companies.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">{t("companies.totalRevenue")}</p>
          <p className="text-3xl font-bold mt-1 text-green-600">
            {totalSales.toLocaleString("ar-EG")} <span className="text-base font-medium text-gray-400">ج.م</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">{t("companies.totalExpenses")}</p>
          <p className="text-3xl font-bold mt-1 text-red-600">
            {(totalPurchases + totalExpenses).toLocaleString("ar-EG")} <span className="text-base font-medium text-gray-400">ج.م</span>
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-600 bg-emerald-50/60 p-5 shadow-sm">
          <p className="text-sm font-medium text-emerald-700">{t("companies.netProfit")}</p>
          <p className={`text-3xl font-bold mt-1 ${totalNetProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
            {totalNetProfit.toLocaleString("ar-EG")} <span className="text-base font-medium text-gray-400">ج.م</span>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-md">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={`${t("common.search")} ${t("common.company")}...`}
          />
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton onRefresh={refresh} refreshing={refreshing} />
          <p className="text-sm text-gray-500">
            {t("pagination.showing")} {filtered.length} {t("pagination.of")} {companies.length}
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <p className="text-sm text-gray-400">{t("common.noData")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((company) => {
            const totalCost = company.totalPurchases + (company.totalExpenses || 0);
            const returnsNet = (company.purchaseReturns || 0) - (company.salesReturns || 0);
            return (
              <div
                key={company.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-lg"
              >
                <div className="border-b border-slate-100 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                        {COMPANY_ICONS[company.name] || "🏢"}
                      </span>
                      <div>
                        <h2 className="font-bold text-lg leading-tight text-slate-900">{company.name}</h2>
                        {company.nameAr && <p className="text-sm text-gray-400">{company.nameAr}</p>}
                      </div>
                    </div>
                    <div className="flex flex-none items-center gap-1">
                      <button
                        onClick={() => openEdit(company)}
                        title={t("common.edit")}
                        aria-label={t("common.edit")}
                        className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(company.id)}
                        title={t("common.delete")}
                        aria-label={t("common.delete")}
                        className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <p className="mb-3 text-xs font-semibold tracking-wide text-gray-400 uppercase">
                    {t("companies.netProfit")}
                  </p>
                  <div className="space-y-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">{t("companies.totalRevenue")}</span>
                      <span className="font-bold text-green-600">+{company.totalSales.toLocaleString("ar-EG")}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">{t("companies.totalExpenses")}</span>
                      <span className="font-bold text-red-600">−{totalCost.toLocaleString("ar-EG")}</span>
                    </div>
                    {returnsNet !== 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">{t("companies.netReturns")}</span>
                        <span className={`font-bold ${returnsNet >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {returnsNet > 0 ? "+" : "−"}{Math.abs(returnsNet).toLocaleString("ar-EG")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">
                      {t("companies.totalRevenue")} − {t("companies.totalExpenses")}
                    </span>
                    <span className={`text-xl font-bold ${company.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {company.netProfit.toLocaleString("ar-EG")} ج.م
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="font-bold text-base text-slate-800">{company.counts.salesOrders}</p>
                      <p className="text-gray-500">{t("navigation.sales")}</p>
                    </div>
                    <div>
                      <p className="font-bold text-base text-slate-800">{company.counts.purchaseOrders}</p>
                      <p className="text-gray-500">{t("navigation.purchases")}</p>
                    </div>
                    <div>
                      <p className="font-bold text-base text-slate-800">{company.totalSettlements}</p>
                      <p className="text-gray-500">{t("companies.settlements")}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 p-3 space-y-2">
                  <button
                    onClick={() => router.push(`/companies/${company.id}/report`)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
                  >
                    <FileText size={16} />
                    {t("reports.financialReport")}
                  </button>
                  <button
                    onClick={() => handleReset(company)}
                    disabled={resettingId === company.id}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 ${
                      resettingId === company.id ? "cursor-wait opacity-60" : ""
                    }`}
                  >
                    {resettingId === company.id ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                    ) : (
                      <Eraser size={16} className="shrink-0" />
                    )}
                    {t("companies.resetData.action")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
