"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import { DateTimeCell } from "@/components/DateTimeCell";
import { Save, Hammer, SearchCheck, Wrench, CircleCheckBig } from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import StatsCards from "@/components/StatsCards";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Machine {
  id: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  status: string;
  purchaseDate?: string;
  notes?: string;
}

interface ScrapForm {
  reason: string;
  approvedBy: string;
  scrapValue: number;
}

const statusColors: Record<string, string> = {
  UNDER_INSPECTION: "bg-yellow-100 text-yellow-800",
  UNDER_MAINTENANCE: "bg-orange-100 text-orange-800",
};

const STATUS_LABELS: Record<string, string> = {
  UNDER_INSPECTION: "تحت الفحص",
  UNDER_MAINTENANCE: "تحت الصيانة",
  SOLD: "مباع",
  RENTED: "مؤجر",
  IN_WAREHOUSE: "في المستودع",
  SCRAPPED: "مهمل",
};

export default function WorkshopPage() {
  const { t, dir } = useI18n();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scrapTarget, setScrapTarget] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [scrapForm, setScrapForm] = useState<ScrapForm>({
    reason: "",
    approvedBy: "",
    scrapValue: 0,
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filtered = machines.filter(
    (machine) =>
      (!statusFilter || machine.status === statusFilter) &&
      (matchesQuery(machine.serialNumber, search) ||
        matchesQuery(machine.manufacturer, search) ||
        matchesQuery(machine.model, search) ||
        matchesQuery(machine.notes, search))
  );
  const hasActiveFilters = statusFilter !== "" || search !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    const maintaining = machines.filter((m) => m.status === "UNDER_MAINTENANCE").length;
    const inspecting = machines.filter((m) => m.status === "UNDER_INSPECTION").length;
    return {
      total: machines.length,
      inspecting,
      maintaining,
      ready: machines.length - inspecting - maintaining,
    };
  }, [machines]);

  const exportWorkshop = () => ({
    headers: [
      t("machines.serialNumber"),
      t("machines.manufacturer"),
      t("machines.model"),
      t("machines.status"),
      t("workshop.purchaseDate"),
      t("common.notes"),
    ],
    rows: filtered.map((m) => [
      m.serialNumber,
      m.manufacturer || "",
      m.model || "",
      STATUS_LABELS[m.status] || m.status,
      m.purchaseDate ? new Date(m.purchaseDate).toISOString().slice(0, 10) : "",
      m.notes || "",
    ]),
  });

  const fetchMachines = () => {
    fetch("/api/workshop")
      .then((r) => r.json())
      .then((data) => {
        setMachines(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchMachines();
  }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchMachines, ["workshop", "machines"]);

  const handleScrap = async (e: React.FormEvent, machineId: string) => {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/workshop/${machineId}/scrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scrapForm),
    });
    setSaving(false);
    setScrapForm({ reason: "", approvedBy: "", scrapValue: 0 });
    setScrapTarget(null);
    refresh();
    notifyDataChanged(["workshop", "machines"]);
  };

  return (
    <div dir={dir} className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">{t("workshop.title")}</h1>
        </div>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("workshop.stats.total"), value: stats.total.toLocaleString("ar-EG"), icon: <Hammer size={18} />, tone: "sky" },
          { label: t("workshop.stats.inspecting"), value: stats.inspecting.toLocaleString("ar-EG"), icon: <SearchCheck size={18} />, tone: "amber" },
          { label: t("workshop.stats.maintaining"), value: stats.maintaining.toLocaleString("ar-EG"), icon: <Wrench size={18} />, tone: "orange" },
          { label: t("workshop.stats.ready"), value: stats.ready.toLocaleString("ar-EG"), icon: <CircleCheckBig size={18} />, tone: "green" },
        ]}
      />

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none"><SearchInput value={search} onChange={setSearch} placeholder={`${t("common.search")} ${t("machines.serialNumber")} / ${t("machines.model")}...`} /></div>
          <FilterSelect value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} allLabel={`${t("machines.status")} — ${t("common.all")}`} className="md:w-44" />
          {hasActiveFilters && (
            <button onClick={() => { setSearch(""); setStatusFilter(""); }} className="text-sm text-gray-500 hover:text-gray-700 underline">
              {t("common.resetFilters")}
            </button>
          )}
          <div className="flex flex-wrap gap-2 md:ms-auto mt-2 md:mt-0">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton filename="workshop-machines" getExport={exportWorkshop} disabled={filtered.length === 0} />
          </div>
        </div>
        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : machines.length === 0 ? (
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
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-start px-4 py-3 text-sm font-medium text-gray-500">{t("machines.serialNumber")}</th>
                  <th className="text-start px-4 py-3 text-sm font-medium text-gray-500">{t("machines.manufacturer")}</th>
                  <th className="text-start px-4 py-3 text-sm font-medium text-gray-500">{t("machines.model")}</th>
                  <th className="text-start px-4 py-3 text-sm font-medium text-gray-500">{t("machines.status")}</th>
                  <th className="text-start px-4 py-3 text-sm font-medium text-gray-500">{t("workshop.purchaseDate")}</th>
                  <th className="text-start px-4 py-3 text-sm font-medium text-gray-500">{t("common.notes")}</th>
                  <th className="text-start px-4 py-3 text-sm font-medium text-gray-500">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paged.map((machine) => (
                  <tr key={machine.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{machine.serialNumber}</td>
                    <td className="px-4 py-3 text-sm">{machine.manufacturer}</td>
                    <td className="px-4 py-3 text-sm">{machine.model}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[machine.status] || "bg-gray-100 text-gray-800"}`}>
                        {STATUS_LABELS[machine.status] || machine.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm"><DateTimeCell value={machine.purchaseDate} /></td>
                    <td className="px-4 py-3 text-sm max-w-xs truncate">{machine.notes || "-"}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => setScrapTarget(scrapTarget === machine.id ? null : machine.id)}
                        className="bg-red-500 text-white px-3 py-1 rounded-lg text-xs hover:bg-red-600 transition"
                      >
                        {t("workshop.createScrapOrder")}
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

      <FormModal open={!!scrapTarget} onClose={() => setScrapTarget(null)} title={`${t("workshop.scrapOrder")} - ${machines.find((m) => m.id === scrapTarget)?.serialNumber || ""}`}>
        <form onSubmit={(e) => handleScrap(e, scrapTarget!)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("workshop.reason")}</label>
            <textarea
              value={scrapForm.reason}
              onChange={(e) => setScrapForm({ ...scrapForm, reason: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("workshop.approvedBy")}</label>
            <input
              type="text"
              value={scrapForm.approvedBy}
              onChange={(e) => setScrapForm({ ...scrapForm, approvedBy: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("workshop.scrapValue")}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={scrapForm.scrapValue}
              onChange={(e) => setScrapForm({ ...scrapForm, scrapValue: Number(e.target.value) })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="md:col-span-2 flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setScrapTarget(null)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-red-600 hover:bg-red-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>
    </div>
  );
}
