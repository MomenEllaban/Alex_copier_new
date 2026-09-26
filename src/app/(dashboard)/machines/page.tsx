"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AddFormBoundary, useAutoAddForm } from "@/hooks/useAutoAddForm";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import { Plus, Trash2, Upload, Save, Printer, Boxes, Hammer, BadgeCheck } from "lucide-react";
import ExportButton from "@/components/ExportButton";
import FormModal from "@/components/FormModal";
import StatsCards from "@/components/StatsCards";
import SearchableSelect from "@/components/SearchableSelect";
import ImportDialog from "@/components/ImportDialog";
import PrinterLoader from "@/components/PrinterLoader";
import { DateTimeCell } from "@/components/DateTimeCell";
import { useConfirm, useToast } from "@/components/UIProvider";
import { useUrlParams, useSearchWithDefault } from "@/hooks/useUrlParams";
import SubmitButton from "@/components/SubmitButton";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Machine {
  id: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  isColor: boolean;
  paperSize: string;
  currentStatus: string;
  purchaseDate: string;
  purchasePrice: number;
  notes: string;
  currentOwnerId: string;
  currentOwner: { name: string } | null;
  deliveryBlack?: number | null;
  deliveryColor?: number | null;
  isPrinter?: boolean;
  createdAt: string;
}

interface MachineDetails extends Machine {
  currentOwner: { id: string; name: string; phone?: string | null } | null;
  customerLocation: { name: string; address?: string | null; customer: { id: string; name: string } } | null;
  warranty: { startDate: string; endDate: string; isExpired: boolean } | null;
  meterReadings: { id: string; reading: number; readingDate: string; source: string; notes?: string | null }[];
  history: { id: string; transactionType: string; date: string; financialValue?: number | null; notes?: string | null; customer?: { name: string } | null }[];
  contracts: { id: string; contract: { id: string; contractNumber: string; status: string; endDate: string; contractType: string } }[];
  serviceRequests: { id: string; requestNumber: string; status: string; priority: string; createdAt: string; engineer?: { name: string } | null; visits: { id: string; visitedAt: string; resolved: boolean; engineer: { name: string } }[] }[];
}

const STATUS_COLORS: Record<string, string> = {
  SOLD: "bg-green-100 text-green-800",
  RENTED: "bg-blue-100 text-blue-800",
  IN_WAREHOUSE: "bg-gray-100 text-gray-800",
  UNDER_MAINTENANCE: "bg-yellow-100 text-yellow-800",
  UNDER_INSPECTION: "bg-orange-100 text-orange-800",
  SCRAPPED: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  SOLD: "مباع",
  RENTED: "مؤجر",
  IN_WAREHOUSE: "في المستودع",
  UNDER_MAINTENANCE: "تحت الصيانة",
  UNDER_INSPECTION: "تحت الفحص",
  SCRAPPED: "مهمل",
};

const emptyForm = {
  serialNumber: "",
  manufacturer: "",
  model: "",
  isColor: false,
  isPrinter: false,
  deliveryBlack: "",
  deliveryColor: "",
  paperSize: "A4",
  purchaseDate: "",
  purchasePrice: "",
  notes: "",
  currentOwnerId: "",
};

export default function MachinesPage() {
  const { t, dir, locale } = useI18n();
  const confirmAction = useConfirm();
const { success: toastSuccess } = useToast();
  
  const [machines, setMachines] = useState<Machine[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const urlParams = useUrlParams(["serial"]);
  const [search, setSearchInput] = useSearchWithDefault(urlParams.serial ?? "");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<MachineDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [showImport, setShowImport] = useState(false);
  const PAGE_SIZE = 10;

  const fetchMachines = async () => {
    try {
      const [mRes, cRes] = await Promise.all([fetch("/api/machines"), fetch("/api/customers")]);
      // Guard the shape: a failed request resolves to an error object, and
      // storing that would make the `.filter()` below throw and blank the page.
      const [machinesData, customersData] = await Promise.all([mRes.json(), cRes.json()]);
      setMachines(Array.isArray(machinesData) ? machinesData : []);
      setCustomers(Array.isArray(customersData) ? customersData : []);
    } catch {
      setMachines([]);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMachines();
  }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchMachines, ["machines", "sales", "contracts", "workshop", "customers"]);

  const autoAddOpen = useAutoAddForm();
  useEffect(() => {
    if (autoAddOpen) setShowForm(true);
  }, [autoAddOpen]);

  const filtered = machines.filter(
    (m) =>
      (matchesQuery(m.serialNumber, search) ||
        matchesQuery(m.model, search) ||
        matchesQuery(m.manufacturer, search) ||
        matchesQuery(m.currentOwner?.name, search)) &&
      (!statusFilter || m.currentStatus === statusFilter)
  );

  const hasActiveFilters = statusFilter !== "" || search !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(
    () => ({
      total: machines.length,
      sold: machines.filter((m) => m.currentStatus === "SOLD").length,
      inWarehouse: machines.filter((m) => m.currentStatus === "IN_WAREHOUSE").length,
      underMaintenance: machines.filter((m) => m.currentStatus === "UNDER_MAINTENANCE").length,
    }),
    [machines]
  );

  const exportMachines = () => ({
    headers: [
      t("machines.serialNumber"),
      t("machines.manufacturer"),
      t("machines.model"),
      t("machines.deliveryCounters"),
      t("machines.printer"),
      t("machines.isColor"),
      t("machines.status"),
      t("machines.purchasePrice"),
      t("machines.purchaseDate"),
      t("machines.currentOwner"),
    ],
    rows: filtered.map((m) => [
      m.serialNumber,
      m.manufacturer || "",
      m.model || "",
      m.deliveryBlack ?? m.deliveryColor ?? null ? `${m.deliveryBlack ?? ""}/${m.deliveryColor ?? ""}` : "",
      m.isPrinter ? t("machines.printer") : "",
      m.isColor ? t("common.yes") : t("common.no"),
      STATUS_LABELS[m.currentStatus] || m.currentStatus,
      m.purchasePrice != null ? String(m.purchasePrice) : "",
      m.purchaseDate ? new Date(m.purchaseDate).toISOString().slice(0, 10) : "",
      m.currentOwner?.name || "",
    ]),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/machines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        purchasePrice: form.purchasePrice ? parseFloat(form.purchasePrice) : null,
        purchaseDate: form.purchaseDate || null,
        deliveryBlack: form.deliveryBlack !== "" ? parseInt(String(form.deliveryBlack), 10) : null,
        deliveryColor: form.deliveryColor !== "" ? parseInt(String(form.deliveryColor), 10) : null,
        currentOwnerId: form.currentOwnerId || null,
      }),
    });
    setSaving(false);
    setForm(emptyForm);
    setShowForm(false);
    refresh();
    notifyDataChanged(["machines", "sales", "workshop", "contracts", "customers"]);
  };

  const handleDelete = async (id: string) => {
      if (!(await confirmAction({ message: t("common.deleteConfirm") }))) return;
      await fetch(`/api/machines/${id}`, { method: "DELETE" });
      refresh();
      notifyDataChanged(["machines", "sales", "workshop", "contracts", "customers"]);
      toastSuccess(t("common.deletedSuccessfully"));
    };

  const setField = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openDetails = async (id: string) => {
    setDetailsLoading(true);
    const res = await fetch(`/api/machines/${id}`);
    if (res.ok) setSelected(await res.json());
    setDetailsLoading(false);
  };

  const date = (value: string) => value ? `${new Date(value).toLocaleDateString("en-GB")} ${new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "—";
  const isOpen = (status: string) => !["RESOLVED", "CLOSED"].includes(status);

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">{t("machines.title")}</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700">
          <Plus size={16} />{t("machines.addMachine")}
        </button>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("machines.stats.total"), value: stats.total.toLocaleString("ar-EG"), icon: <Printer size={18} />, tone: "sky" },
          { label: t("machines.stats.sold"), value: stats.sold.toLocaleString("ar-EG"), icon: <BadgeCheck size={18} />, tone: "green" },
          { label: t("machines.stats.inWarehouse"), value: stats.inWarehouse.toLocaleString("ar-EG"), icon: <Boxes size={18} />, tone: "slate" },
          { label: t("machines.stats.underMaintenance"), value: stats.underMaintenance.toLocaleString("ar-EG"), icon: <Hammer size={18} />, tone: "amber" },
        ]}
      />

      <FormModal open={showForm} onClose={() => setShowForm(false)} title={t("machines.addMachine")} wide>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("machines.serialNumber")}</label>
            <input type="text" value={form.serialNumber} onChange={(e) => setField("serialNumber", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("machines.manufacturer")}</label>
            <input type="text" value={form.manufacturer} onChange={(e) => setField("manufacturer", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("machines.model")}</label>
            <input type="text" value={form.model} onChange={(e) => setField("model", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">ملون</label>
            <label className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5">
              <input type="checkbox" checked={form.isColor} onChange={(e) => setField("isColor", e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm">نعم</span>
            </label>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">حجم الورق</label>
            <select value={form.paperSize} onChange={(e) => setField("paperSize", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="A3_A4">A3/A4</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">تاريخ الشراء</label>
            <input type="date" value={form.purchaseDate} onChange={(e) => setField("purchaseDate", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">سعر الشراء</label>
            <input type="number" value={form.purchasePrice} onChange={(e) => setField("purchasePrice", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">المالك الحالي</label>
            <SearchableSelect value={form.currentOwnerId} onChange={(v) => setField("currentOwnerId", v)} options={customers.map((c) => ({ value: c.id, label: c.name }))} placeholder="بدون مالك" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("machines.deliveryCounters")}</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="0" step="1" value={form.deliveryBlack} onChange={(e) => setField("deliveryBlack", e.target.value)} placeholder={t("copierTests.blackCounter")} dir="ltr" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="number" min="0" step="1" value={form.deliveryColor} onChange={(e) => setField("deliveryColor", e.target.value)} placeholder={t("copierTests.colorCounter")} dir="ltr" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("machines.printer")}</label>
            <label className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5">
              <input type="checkbox" checked={form.isPrinter} onChange={(e) => setField("isPrinter", e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm">{t("common.yes")}</span>
            </label>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("common.notes")}</label>
            <input type="text" value={form.notes} onChange={(e) => setField("notes", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end md:col-span-2 lg:col-span-3">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none">
            <SearchInput
              value={search}
              onChange={setSearchInput}
              placeholder={t("machines.searchPlaceholder")}
            />
          </div>
          <FilterSelect
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            allLabel={`${t("machines.status")} — ${t("common.all")}`}
            className="md:w-44"
          />
          {hasActiveFilters && (
            <button
              onClick={() => { setSearchInput(null); setStatusFilter(""); }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              {t("common.resetFilters")}
            </button>
          )}
          <div className="flex gap-2 md:ms-auto mt-2 md:mt-0">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton filename="machines" getExport={exportMachines} disabled={filtered.length === 0} />
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
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("machines.serialNumber")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("machines.manufacturer")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("machines.model")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("machines.deliveryCounters")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("machines.status")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">حجم الورق</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">المالك الحالي</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.date")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paged.map((machine) => (
                  <tr key={machine.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{machine.serialNumber}{machine.isPrinter ? (<span className="ms-2 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">{t("machines.printer")}</span>) : null}</td>
                    <td className="px-4 py-3 text-sm">{machine.manufacturer}</td>
                    <td className="px-4 py-3 text-sm">{machine.model}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap"><span dir="ltr">{machine.deliveryBlack != null || machine.deliveryColor != null ? `${machine.deliveryBlack ?? "—"} / ${machine.deliveryColor ?? "—"}` : "—"}</span></td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[machine.currentStatus] || "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {STATUS_LABELS[machine.currentStatus] || machine.currentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{machine.paperSize}</td>
                    <td className="px-4 py-3 text-sm">{machine.currentOwner?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      <DateTimeCell value={machine.createdAt} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openDetails(machine.id)}
                        className="text-blue-600 hover:text-blue-800 text-sm me-3"
                      >
                        {t("machineDetails.view")}
                      </button>
                      <button
                        onClick={() => handleDelete(machine.id)}
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

      {(selected || detailsLoading) && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" role="dialog" aria-modal="true">
          <div className="my-auto w-full max-w-5xl rounded-2xl bg-slate-50 shadow-2xl" dir={dir}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4 sm:px-7">
              <div>
                <p className="text-sm text-slate-500">{t("machines.title")}</p>
                <h2 className="text-xl font-bold text-slate-900">{selected?.serialNumber || t("common.loading")}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">{t("common.close")}</button>
            </div>
            {detailsLoading || !selected ? (
              <div className="flex items-center justify-center p-12">
                <PrinterLoader size="sm" label={t("common.loading")} />
              </div>
            ) : (
              <div className="space-y-6 p-5 sm:p-7">
                <section className="grid gap-4 md:grid-cols-4">
                  <Info label={t("machines.manufacturer")} value={selected.manufacturer || "—"} />
                  <Info label={t("machines.model")} value={selected.model || "—"} />
                  <Info label={t("machines.deliveryCounters")} value={selected.deliveryBlack != null || selected.deliveryColor != null ? `${selected.deliveryBlack ?? "—"} / ${selected.deliveryColor ?? "—"}` : "—"} />
                  <Info label={t("machines.printer")} value={selected.isPrinter ? t("common.yes") : t("common.no")} />
                  <Info label={t("machines.status")} value={STATUS_LABELS[selected.currentStatus] || selected.currentStatus} />
                  <Info label={t("machineDetails.currentMeter")} value={selected.meterReadings[0]?.reading?.toLocaleString() || "—"} />
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <Panel title={t("machineDetails.customer")}>
                    {(selected.currentOwner || selected.customerLocation?.customer) ? (
                      <>
                        <Link href={`/customers?q=${encodeURIComponent(selected.currentOwner?.name || selected.customerLocation?.customer.name || "")}`} className="font-semibold text-blue-600 hover:underline">
                          {selected.currentOwner?.name || selected.customerLocation?.customer.name}
                        </Link>
                        {selected.currentOwner?.phone && <span className="ms-2 text-sm text-slate-600" dir="ltr">{selected.currentOwner.phone}</span>}
                      </>
                    ) : (
                      <p className="font-semibold">—</p>
                    )}
                    <p className="mt-1 text-sm text-slate-600">{t("machineDetails.location")}: {selected.customerLocation?.name || "—"}</p>
                    {selected.customerLocation?.address && <p className="text-sm text-slate-500">{selected.customerLocation.address}</p>}
                  </Panel>
                  <Panel title={t("machineDetails.warranty")}>
                    {selected.warranty ? <>
                      <p className={selected.warranty.isExpired || new Date(selected.warranty.endDate) < new Date() ? "font-medium text-red-700" : "font-medium text-emerald-700"}>{selected.warranty.isExpired || new Date(selected.warranty.endDate) < new Date() ? t("machineDetails.notCovered") : t("machineDetails.covered")}</p>
                      <p className="mt-1 text-sm text-slate-600">{t("machineDetails.expires")}: {date(selected.warranty.endDate)}</p>
                    </> : <Empty text={t("machineDetails.noWarranty")} />}
                  </Panel>
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <Panel title={t("machineDetails.contracts")}>
                    {selected.contracts.length ? <div className="space-y-2">{selected.contracts.map(({ id, contract }) => <Link key={id} href={`/contracts?focus=${contract.id}`} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100"><span className="font-medium text-blue-600">{contract.contractNumber}</span><span>{contract.status} · {date(contract.endDate)}</span></Link>)}</div> : <Empty text={t("machineDetails.noContracts")} />}
                  </Panel>
                  <Panel title={t("machineDetails.meter")}>
                    {selected.meterReadings.length ? <div className="space-y-2">{selected.meterReadings.slice(0, 5).map(reading => <div key={reading.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium">{reading.reading.toLocaleString()}</span><span>{date(reading.readingDate)} · {reading.source}</span></div>)}</div> : <Empty text={t("machineDetails.noMeters")} />}
                  </Panel>
                </section>

                <Panel title={`${t("machineDetails.service")} · ${selected.serviceRequests.filter(r => isOpen(r.status)).length} ${t("machineDetails.openRequests")}`}>
                  {selected.serviceRequests.length ? <div className="space-y-3">{selected.serviceRequests.map(request => <Link key={request.id} href={`/service-requests?focus=${request.id}`} className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-blue-600">{request.requestNumber}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{request.status}</span></div><p className="mt-1 text-sm text-slate-600">{t("machineDetails.assignedTo")}: {request.engineer?.name || "—"} · {date(request.createdAt)}</p>{request.visits.length > 0 && <p className="mt-1 text-sm text-slate-500">{t("machineDetails.visits")}: {request.visits.length}</p>}</Link>)}</div> : <Empty text={t("machineDetails.noService")} />}
                </Panel>

                <Panel title={t("machineDetails.timeline")}>
                  <div className="space-y-3 border-s border-slate-200 ps-4">{[
                    { id: "created", at: selected.createdAt, title: t("machineDetails.created"), detail: selected.serialNumber },
                    ...selected.history.map(event => ({ id: event.id, at: event.date, title: event.transactionType, detail: event.customer?.name || event.notes || "" })),
                    ...selected.serviceRequests.map(request => ({ id: request.id, at: request.createdAt, title: `${t("machineDetails.request")} ${request.requestNumber}`, detail: request.status })),
                    ...selected.serviceRequests.flatMap(request => request.visits.map(visit => ({ id: visit.id, at: visit.visitedAt, title: `${t("machineDetails.visits")} · ${visit.engineer.name}`, detail: visit.resolved ? t("common.resolve") : "" }))),
                  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).map(event => <div key={event.id} className="relative"><span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-blue-500"/><p className="font-medium text-sm">{event.title}</p><p className="text-xs text-slate-500">{date(event.at)} {event.detail && `· ${event.detail}`}</p></div>)}</div>
                </Panel>
              </div>
            )}
          </div>
        </div>
      )}

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        entity="machines"
        title={`${t("common.import")} — ${t("machines.title")}`}
        onImported={refresh}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="mb-3 font-semibold text-slate-900">{title}</h3>{children}</section>;
}

function Empty({ text }: { text: string }) {
  return <p className="py-2 text-sm text-slate-500">{text}</p>;
}
