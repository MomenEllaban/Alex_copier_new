"use client";

import { useEffect, useState } from "react";
import { AddFormBoundary, useAutoAddForm } from "@/hooks/useAutoAddForm";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import { Eye, Pencil, Plus, Save, Trash2 } from "lucide-react";
import PrinterLoader from "@/components/PrinterLoader";
import { useUrlParams, useSearchWithDefault } from "@/hooks/useUrlParams";
import FormModal from "@/components/FormModal";
import SelectWithAdd from "@/components/SelectWithAdd";
import PrintMenu from "@/components/PrintMenu";
import { DateTimeCell } from "@/components/DateTimeCell";
import { useConfirm, useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import SubmitButton from "@/components/SubmitButton";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

const TYPE_LABELS: Record<string, string> = {
  MAINTENANCE_ONLY: "صيانة فقط",
  MAINTENANCE_AND_PARTS: "صيانة وقطع غيار",
  MAINTENANCE_AND_PRINTING: "صيانة وطباعة",
  RENTAL: "إيجار",
  VISIT: "زيارة",
  ARCHIVE: "ارشيف",
  WARRANTY: "ضمان",
  PENDING: "مطلوب عقد",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "نشط",
  EXPIRED: "منتهي",
  TERMINATED: "ملغي",
  SUSPENDED: "موقوف",
};

const BILLING_LABELS: Record<string, string> = {
  MONTHLY: "شهري",
  HALF_YEARLY: "نصف سنوي",
  QUARTERLY: "ربع سنوي",
  YEARLY: "سنوي",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "كاش",
  CREDIT: "أجل",
  INSTALLMENT: "أجل",
  MIXED: "أجل",
};

const PAYMENT_METHOD_OPTIONS = ["CASH", "CREDIT"] as const;

const contractTypeColors: Record<string, string> = {
  MAINTENANCE_ONLY: "bg-blue-100 text-blue-800",
  MAINTENANCE_AND_PARTS: "bg-green-100 text-green-800",
  MAINTENANCE_AND_PRINTING: "bg-purple-100 text-purple-800",
  RENTAL: "bg-orange-100 text-orange-800",
  VISIT: "bg-teal-100 text-teal-800",
  ARCHIVE: "bg-gray-100 text-gray-800",
  WARRANTY: "bg-yellow-100 text-yellow-800",
  PENDING: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  EXPIRED: "bg-gray-100 text-gray-800",
  TERMINATED: "bg-red-100 text-red-800",
  SUSPENDED: "bg-yellow-100 text-yellow-800",
};

interface Customer { id: string; name: string; }
interface Machine { id: string; serialNumber: string; model: string | null; currentOwnerId: string | null; }
interface ContractMachine { id: string; machineId: string; machine: { id: string; serialNumber: string; model: string | null }; }
interface Contract {
  id: string; contractNumber: string; customerId: string; contractType: string; status: string;
  startDate: string; endDate: string; value: number; amountPaid: number; paymentMethod: string; billingCycle: string;
  notes: string | null; createdAt: string; customer: Customer; machines: ContractMachine[];
  _count: { visits: number };
}

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const toInputDate = (date: Date) => date.toISOString().slice(0, 10);

export default function ContractsPage() {
  const { t, dir } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingContract, setViewingContract] = useState<Contract | null>(null);
  const urlParams = useUrlParams(["focus"]);
  const focusedContract = urlParams.focus ? contracts.find((c) => c.id === urlParams.focus) : undefined;
  const [search, setSearchInput] = useSearchWithDefault(focusedContract?.contractNumber ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [form, setForm] = useState({
    customerId: "", contractType: "MAINTENANCE_ONLY", startDate: "", endDate: "",
    value: "", amountPaid: "", paymentMethod: "CASH", billingCycle: "MONTHLY", notes: "", machineIds: [] as string[],
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const remainingAmount = Number(form.value || 0) - Number(form.amountPaid || 0);
  const billingCycleMonths: Record<string, number> = {
    MONTHLY: 1,
    HALF_YEARLY: 6,
    QUARTERLY: 3,
    YEARLY: 12,
  };

  const updateEndDateFromCycle = (nextStartDate: string, nextCycle: string) => {
    if (!nextStartDate || !billingCycleMonths[nextCycle]) return;
    const nextDate = addMonths(new Date(nextStartDate), billingCycleMonths[nextCycle]);
    setForm((prev) => ({ ...prev, endDate: toInputDate(nextDate) }));
  };

  const fetchData = async () => {
    try {
      const [cRes, custRes, machineRes] = await Promise.all([fetch("/api/contracts"), fetch("/api/customers"), fetch("/api/machines")]);
      setContracts(await cRes.json());
      setCustomers(await custRes.json());
      setMachines(await machineRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchData, ["contracts", "machines", "customers", "service-requests"]);

  const autoAddOpen = useAutoAddForm();
  useEffect(() => {
    if (autoAddOpen) setShowForm(true);
  }, [autoAddOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        value: parseFloat(form.value) || 0,
        amountPaid: parseFloat(form.amountPaid) || 0,
      }),
    });
    setSaving(false);
    setForm({ customerId: "", contractType: "MAINTENANCE_ONLY", startDate: "", endDate: "", value: "", amountPaid: "", paymentMethod: "CASH", billingCycle: "MONTHLY", notes: "", machineIds: [] });
    setShowForm(false);
    refresh();
    notifyDataChanged(["contracts", "machines", "customers"]);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) { setSaving(false); return; }
    setSaving(true);
    await fetch(`/api/contracts/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        value: parseFloat(form.value) || 0,
        amountPaid: parseFloat(form.amountPaid) || 0,
      }),
    });
    setSaving(false);
    setEditingId(null);
    setForm({ customerId: "", contractType: "MAINTENANCE_ONLY", startDate: "", endDate: "", value: "", amountPaid: "", paymentMethod: "CASH", billingCycle: "MONTHLY", notes: "", machineIds: [] });
    setShowForm(false);
    refresh();
    notifyDataChanged(["contracts", "machines", "customers"]);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("common.deleteConfirm") }))) return;
    const res = await fetch(`/api/contracts/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) { toastError(apiErrorMessage(data, t)); return; }
    setViewingContract(null);
    refresh();
    notifyDataChanged(["contracts", "machines", "customers"]);
    toastSuccess(t("common.deletedSuccessfully"));
  };

  const openEdit = (c: Contract) => {
    setEditingId(c.id);
    setForm({
      customerId: c.customerId,
      contractType: c.contractType,
      startDate: c.startDate.slice(0, 10),
      endDate: c.endDate.slice(0, 10),
      value: String(c.value),
      amountPaid: String(c.amountPaid),
      paymentMethod: c.paymentMethod,
      billingCycle: c.billingCycle,
      notes: c.notes || "",
      machineIds: c.machines.map((m) => m.machineId),
    });
    setShowForm(true);
  };

  const openView = (c: Contract) => setViewingContract(c);

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "ACTIVE" ? "TERMINATED" : "ACTIVE";
    await fetch(`/api/contracts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
    refresh();
    notifyDataChanged(["contracts", "machines", "customers"]);
  };

  const filtered = contracts.filter(contract =>
    (!statusFilter || contract.status === statusFilter) &&
    (!typeFilter || contract.contractType === typeFilter) &&
    (matchesQuery(contract.contractNumber, search) ||
      matchesQuery(contract.customer?.name, search) ||
      matchesQuery(TYPE_LABELS[contract.contractType], search))
  );
  const hasActiveFilters = statusFilter !== "" || typeFilter !== "" || search !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportContracts = () => ({
    headers: [
      t("contracts.contractNumber"),
      t("serviceRequests.customer"),
      t("contracts.type"),
      t("common.status"),
      t("contracts.value"),
      t("contracts.startDate"),
      t("contracts.endDate"),
      t("contracts.machines"),
    ],
    rows: filtered.map((c) => [
      c.contractNumber,
      c.customer.name,
      TYPE_LABELS[c.contractType] || c.contractType,
      STATUS_LABELS[c.status] || c.status,
      String(c.value),
      new Date(c.startDate).toISOString().slice(0, 10),
      new Date(c.endDate).toISOString().slice(0, 10),
      String(c.machines.length),
    ]),
  });

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">{t("contracts.title")}</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700">
          <Plus size={16} />{t("contracts.addContract")}
        </button>
      </div>

      <FormModal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); setForm({ customerId: "", contractType: "MAINTENANCE_ONLY", startDate: "", endDate: "", value: "", amountPaid: "", paymentMethod: "CASH", billingCycle: "MONTHLY", notes: "", machineIds: [] }); }} title={editingId ? t("common.edit") : t("contracts.addContract")} wide>
        <form onSubmit={editingId ? handleUpdate : handleCreate} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <SelectWithAdd
                label={t("contracts.selectCustomer")}
                value={form.customerId}
                onChange={(v) => setForm({ ...form, customerId: v })}
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                placeholder={t("contracts.selectCustomer")}
                required
              quickAddTitle="إضافة عميل جديد"
              quickAddFields={[
                { key: "name", label: "اسم العميل", required: true },
                { key: "phone", label: "الهاتف", placeholder: "01xxxxxxxxx" },
                { key: "email", label: "البريد الإلكتروني", type: "email" },
                { key: "address", label: "العنوان" },
                { key: "city", label: "المدينة" },
                { key: "customerType", label: "نوع العميل", type: "select", options: [{ value: "INDIVIDUAL", label: "فرد" }, { value: "COMPANY", label: "شركة" }] },
              ]}
                quickAddEndpoint="/api/customers"
                onQuickAddSuccess={(item) => {
                  setCustomers((prev) => [...prev, item]);
                  setForm((f) => ({ ...f, customerId: item.id }));
                }}
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("contracts.type")}</label>
                <select value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="MAINTENANCE_ONLY">{TYPE_LABELS.MAINTENANCE_ONLY}</option>
                  <option value="MAINTENANCE_AND_PARTS">{TYPE_LABELS.MAINTENANCE_AND_PARTS}</option>
                  <option value="MAINTENANCE_AND_PRINTING">{TYPE_LABELS.MAINTENANCE_AND_PRINTING}</option>
                  <option value="RENTAL">{TYPE_LABELS.RENTAL}</option>
                  <option value="VISIT">{TYPE_LABELS.VISIT}</option>
                  <option value="ARCHIVE">{TYPE_LABELS.ARCHIVE}</option>
                  <option value="WARRANTY">{TYPE_LABELS.WARRANTY}</option>
                  <option value="PENDING">{TYPE_LABELS.PENDING}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">الفترة</label>
                <select value={form.billingCycle} onChange={(e) => {
                  const nextCycle = e.target.value;
                  const nextStart = form.startDate || toInputDate(new Date());
                  updateEndDateFromCycle(nextStart, nextCycle);
                  setForm((prev) => ({ ...prev, billingCycle: nextCycle, startDate: prev.startDate || nextStart }));
                }} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="MONTHLY">{BILLING_LABELS.MONTHLY}</option>
                  <option value="HALF_YEARLY">{BILLING_LABELS.HALF_YEARLY}</option>
                  <option value="QUARTERLY">{BILLING_LABELS.QUARTERLY}</option>
                  <option value="YEARLY">{BILLING_LABELS.YEARLY}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("contracts.startDate")}</label>
                <input type="date" value={form.startDate} onChange={(e) => {
                  const nextStart = e.target.value;
                  setForm((prev) => ({ ...prev, startDate: nextStart }));
                  if (nextStart) updateEndDateFromCycle(nextStart, form.billingCycle);
                }} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("contracts.endDate")}</label>
                <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("contracts.value")}</label>
                <input type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">تم دفع</label>
                <input type="number" min="0" step="0.01" value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">نوع الدفع</label>
                <select value={form.paymentMethod === "CASH" ? "CASH" : "CREDIT"} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {PAYMENT_METHOD_OPTIONS.map((key) => (<option key={key} value={key}>{PAYMENT_METHOD_LABELS[key]}</option>))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">الإجمالي</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{Number(form.value || 0).toLocaleString()} </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">تم الدفع</div>
                <div className="mt-1 text-lg font-bold text-emerald-600">{Number(form.amountPaid || 0).toLocaleString()} </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">المتبقي</div>
                <div className={`mt-1 text-lg font-bold ${remainingAmount < 0 ? "text-red-600" : "text-sky-700"}`}>{remainingAmount.toLocaleString()} </div>
              </div>
            </div>

            {form.customerId && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-700">{t("contracts.coveredMachines")}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {machines.filter(machine => machine.currentOwnerId === form.customerId).map(machine => <label key={machine.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={form.machineIds.includes(machine.id)} onChange={(e) => setForm({ ...form, machineIds: e.target.checked ? [...form.machineIds, machine.id] : form.machineIds.filter(id => id !== machine.id) })} /><span>{machine.serialNumber}{machine.model ? ` · ${machine.model}` : ""}</span></label>)}
                {machines.filter(machine => machine.currentOwnerId === form.customerId).length === 0 && <p className="text-sm text-slate-500">{t("common.noData")}</p>}
              </div>
            </div>}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("common.notes")}</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" rows={3} />
            </div>

            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm({ customerId: "", contractType: "MAINTENANCE_ONLY", startDate: "", endDate: "", value: "", amountPaid: "", paymentMethod: "CASH", billingCycle: "MONTHLY", notes: "", machineIds: [] }); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
              <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
            </div>
          </form>
      </FormModal>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none"><SearchInput value={search} onChange={setSearchInput} placeholder={t("contracts.searchPlaceholder")} /></div>
          <FilterSelect value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} allLabel={`${t("common.status")} — ${t("common.all")}`} className="md:w-40" />
          <FilterSelect value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))} allLabel={`${t("contracts.typeFilter")} — ${t("common.all")}`} className="md:w-44" />
          {hasActiveFilters && (
            <button onClick={() => { setSearchInput(null); setStatusFilter(""); setTypeFilter(""); }} className="text-sm text-gray-500 hover:text-gray-700 underline">
              {t("common.resetFilters")}
            </button>
          )}
          <div className="flex flex-wrap gap-2 md:ms-auto mt-2 md:mt-0">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton filename="contracts" getExport={exportContracts} disabled={filtered.length === 0} />
          </div>
        </div>
        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : contracts.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("contracts.contractNumber")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("serviceRequests.customer")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("contracts.type")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.status")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("contracts.value")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("contracts.startDate")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("contracts.endDate")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("contracts.machines")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paged.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{c.contractNumber}</td>
                    <td className="px-4 py-3 text-sm">{c.customer.name}</td>
                    <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${contractTypeColors[c.contractType] || ""}`}>{TYPE_LABELS[c.contractType] || c.contractType}</span></td>
                    <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[c.status] || ""}`}>{STATUS_LABELS[c.status] || c.status}</span></td>
                    <td className="px-4 py-3 text-sm">{c.value.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm"><DateTimeCell value={c.startDate} /></td>
                    <td className="px-4 py-3 text-sm"><DateTimeCell value={c.endDate} /></td>
                    <td className="px-4 py-3 text-sm text-center">{c.machines.length}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openView(c)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-100" title={t("common.view")}>
                          <Eye size={14} />{t("common.view")}
                        </button>
                        <button onClick={() => openEdit(c)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-100" title={t("common.edit")}>
                          <Pencil size={14} />{t("common.edit")}
                        </button>
                        <PrintMenu type="contract" id={c.id} />
                        <button onClick={() => handleStatusToggle(c.id, c.status)} className={`text-xs hover:underline ${c.status === "ACTIVE" ? "text-red-600" : "text-green-600"}`}>
                          {c.status === "ACTIVE" ? t("contracts.terminate") : t("contracts.activate")}
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100" title={t("common.delete")}>
                          <Trash2 size={14} />
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

      <FormModal open={!!viewingContract} onClose={() => setViewingContract(null)} title={t("common.view")} wide>
        {viewingContract && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-500">{t("contracts.contractNumber")}</label>
                <p className="text-sm text-slate-900">{viewingContract.contractNumber}</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-500">{t("serviceRequests.customer")}</label>
                <p className="text-sm text-slate-900">{viewingContract.customer.name}</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-500">{t("contracts.type")}</label>
                <p className="text-sm text-slate-900">{TYPE_LABELS[viewingContract.contractType]}</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-500">{t("common.status")}</label>
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[viewingContract.status]}`}>{STATUS_LABELS[viewingContract.status]}</span>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-500">{t("contracts.startDate")}</label>
                <p className="text-sm text-slate-900"><DateTimeCell value={viewingContract.startDate} /></p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-500">{t("contracts.endDate")}</label>
                <p className="text-sm text-slate-900"><DateTimeCell value={viewingContract.endDate} /></p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-500">{t("contracts.value")}</label>
                <p className="text-sm text-slate-900">{viewingContract.value.toLocaleString()}</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-500">تم الدفع</label>
                <p className="text-sm text-slate-900">{viewingContract.amountPaid.toLocaleString()}</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-500">نوع الدفع</label>
                <p className="text-sm text-slate-900">{PAYMENT_METHOD_LABELS[viewingContract.paymentMethod]}</p>
              </div>
            </div>
            {viewingContract.notes && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-500">{t("common.notes")}</label>
                <p className="text-sm text-slate-900">{viewingContract.notes}</p>
              </div>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={() => setViewingContract(null)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            </div>
          </div>
        )}
      </FormModal>
    </div>
  );
}
