"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import { Plus, Save, Trash2, X, Users, UserCheck, Percent } from "lucide-react";
import { AddFormBoundary, useAutoAddForm } from "@/hooks/useAutoAddForm";
import { useConfirm, useToast } from "@/components/UIProvider";
import RefreshButton from "@/components/RefreshButton";
import StatsCards from "@/components/StatsCards";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Investor {
  id: string;
  name: string;
  phone: string;
  email: string;
  ownershipPct: number;
  isActive: boolean;
  createdAt: string;
}

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  ownershipPct: "",
};

export default function InvestorsPage() {
  const { t, dir } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess } = useToast();
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const fetchInvestors = async () => {
    try {
      const res = await fetch("/api/investors");
      const data = await res.json();
      setInvestors(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvestors();
  }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchInvestors, ["investors"]);

  const autoAddOpen = useAutoAddForm();
  useEffect(() => {
    if (autoAddOpen) setShowForm(true);
  }, [autoAddOpen]);

  const filtered = investors.filter(
    (i) =>
      matchesQuery(i.name, search) ||
      (Boolean(i.phone) && i.phone.includes(search)) ||
      matchesQuery(i.email, search)
  );
  const hasActiveFilters = search !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    const ownership = investors.reduce((sum, i) => sum + (i.ownershipPct || 0), 0);
    return { total: investors.length, active: investors.filter((i) => i.isActive).length, ownership };
  }, [investors]);

  const exportInvestors = () => ({
    headers: [
      t("investors.name"),
      t("customers.phone"),
      t("customers.email"),
      `${t("investors.ownershipPct")} %`,
    ],
    rows: filtered.map((i) => [
      i.name,
      i.phone || "",
      i.email || "",
      String(i.ownershipPct),
    ]),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/investors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        ownershipPct: parseFloat(form.ownershipPct),
      }),
    });
    setSaving(false);
    setForm(emptyForm);
    setShowForm(false);
    refresh();
    notifyDataChanged(["investors"]);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("common.deleteConfirm") }))) return;
    await fetch(`/api/investors/${id}`, { method: "DELETE" });
    refresh();
    notifyDataChanged(["investors"]);
    toastSuccess(t("common.deletedSuccessfully"));
  };

  const setField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
            <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">{t("investors.title")}</h1>
          </div>
          <button onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"><Plus size={16} />{t("investors.addInvestor")}</button>
        </div>

        <StatsCards
          columns={3}
          stats={[
            { label: t("investors.stats.total"), value: stats.total.toLocaleString("ar-EG"), icon: <Users size={18} />, tone: "sky" },
            { label: t("investors.stats.active"), value: stats.active.toLocaleString("ar-EG"), icon: <UserCheck size={18} />, tone: "green" },
            { label: t("investors.stats.ownership"), value: `${stats.ownership.toLocaleString("ar-EG")}%`, icon: <Percent size={18} />, tone: "purple" },
          ]}
        />

        <FormModal open={showForm} onClose={() => setShowForm(false)} title={t("investors.addInvestor")}>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("investors.name")}</label><input type="text" placeholder={t("investors.name")} value={form.name} onChange={(e) => setField("name", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></div>
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("customers.phone")}</label><input type="text" placeholder={t("customers.phone")} value={form.phone} onChange={(e) => setField("phone", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("customers.email")}</label><input type="email" placeholder={t("customers.email")} value={form.email} onChange={(e) => setField("email", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("investors.ownershipPct")}</label><input type="number" step="0.01" placeholder={t("investors.ownershipPct") + " %"} value={form.ownershipPct} onChange={(e) => setField("ownershipPct", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></div>
            <div className="flex flex-col-reverse gap-3 pt-1 md:col-span-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"><X size={16} className="ms-1 inline-block" />{t("common.cancel")}</button>
              <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
            </div>
          </form>
        </FormModal>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
            <div className="w-full md:w-80 md:flex-none">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={t("investors.searchPlaceholder")}
              />
            </div>
            {hasActiveFilters && (
              <button onClick={() => setSearch("")} className="text-sm text-gray-500 hover:text-gray-700 underline">
                {t("common.resetFilters")}
              </button>
            )}
            <div className="flex flex-wrap gap-2 md:ms-auto mt-2 md:mt-0">
              <RefreshButton onRefresh={refresh} refreshing={refreshing} />
              <ExportButton filename="investors" getExport={exportInvestors} disabled={filtered.length === 0} />
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
              <PrinterLoader size="md" label={t("common.loading")} />
            </div>
          ) : investors.length === 0 ? (
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
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("investors.name")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.phone")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.email")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("investors.ownershipPct")}</th>
                    <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paged.map((investor) => (
                    <tr key={investor.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{investor.name}</td>
                      <td className="px-4 py-3 text-sm">{investor.phone || "—"}</td>
                      <td className="px-4 py-3 text-sm">{investor.email || "—"}</td>
                      <td className="px-4 py-3 text-sm">{investor.ownershipPct}%</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(investor.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          <Trash2 size={14} className="inline-block me-1" />{t("common.delete")}
                        </button>
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
    </div>
  );
}
