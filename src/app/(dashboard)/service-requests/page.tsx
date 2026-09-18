"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AddFormBoundary, useAutoAddForm } from "@/hooks/useAutoAddForm";
import { useSession } from "next-auth/react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import { CheckCircle2, ClipboardList, Save, Trash2, TriangleAlert, X } from "lucide-react";
import DateRangeFilter, { inDateRange } from "@/components/DateRangeFilter";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import { DateTimeCell } from "@/components/DateTimeCell";
import { useUrlParams, useSearchWithDefault } from "@/hooks/useUrlParams";
import FormModal from "@/components/FormModal";
import StatsCards from "@/components/StatsCards";
import SelectWithAdd from "@/components/SelectWithAdd";
import SearchableSelect from "@/components/SearchableSelect";
import { useConfirm, useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import SubmitButton from "@/components/SubmitButton";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

const PRIORITY_LABELS: Record<string, string> = {
  NORMAL: "عادي",
  IMPORTANT: "مهم",
  URGENT: "عاجل",
  EMERGENCY: "طارئ",
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "جديد",
  ASSIGNED: "تم التعيين",
  VISITED: "تمت الزيارة",
  RESOLVED: "تم الحل",
  NOT_RESOLVED: "لم يتم الحل",
  REASSIGNED: "إعادة التعيين",
  CLOSED: "مغلق",
};

interface Customer { id: string; name: string; locations?: Location[]; }
interface Engineer { id: string; name: string; user?: { id?: string | null } | null; userId?: string | null; }
interface Machine { id: string; serialNumber: string; model?: string | null; currentOwnerId?: string | null; customerLocationId?: string | null; }
interface Location { id: string; name: string; }
interface ProblemDetail { id: string; description: string; }

interface ServiceRequest {
  id: string;
  requestNumber: string;
  customerId: string;
  locationId: string | null;
  machineId: string | null;
  description: string;
  priority: string;
  status: string;
  engineerId: string | null;
  customerRating: number | null;
  ratingNotes: string | null;
  createdAt: string;
  customer: Customer;
  location: Location | null;
  machine: Machine | null;
  engineer: Engineer | null;
  problems: ProblemDetail[];
}

const priorityColors: Record<string, string> = {
  NORMAL: "bg-gray-100 text-gray-800",
  IMPORTANT: "bg-yellow-100 text-yellow-800",
  URGENT: "bg-orange-100 text-orange-800",
  EMERGENCY: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  ASSIGNED: "bg-purple-100 text-purple-800",
  VISITED: "bg-yellow-100 text-yellow-800",
  RESOLVED: "bg-green-100 text-green-800",
  NOT_RESOLVED: "bg-red-100 text-red-800",
  REASSIGNED: "bg-indigo-100 text-indigo-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

export default function ServiceRequestsPage() {
  const { t, dir } = useI18n();
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const isEngineer = userRole === "ENGINEER";
  const canManageRequests = ["GENERAL_MANAGER", "COMPANY_MANAGER", "MAINTENANCE_MANAGER", "WORKSHOP_MANAGER"].includes(userRole ?? "");
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const myEngineerId = engineers.find((engineer) => engineer.user?.id === session?.user?.id || engineer.userId === session?.user?.id)?.id ?? null;
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignEngineerId, setAssignEngineerId] = useState("");
  const urlParams = useUrlParams(["focus"]);
  const focusedRequest = urlParams.focus ? requests.find((r) => r.id === urlParams.focus) : undefined;
  const [search, setSearchInput] = useSearchWithDefault(focusedRequest?.requestNumber ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [engineerFilter, setEngineerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [form, setForm] = useState({
    customerId: "",
    locationId: "",
    machineId: "",
    description: "",
    priority: "NORMAL",
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const fetchData = async () => {
    try {
      const [reqRes, custRes, engRes, machineRes] = await Promise.all([
        fetch("/api/service-requests"),
        fetch("/api/customers"),
        fetch("/api/engineers"),
        fetch("/api/machines"),
      ]);
      setRequests(await reqRes.json());
      setCustomers(await custRes.json());
      setEngineers(await engRes.json());
      setMachines(await machineRes.json());
    } finally {
      setLoading(false);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchData, ["service-requests", "engineers", "machines", "customers", "notifications"]);

  useEffect(() => { fetchData(); }, []);

  const autoAddOpen = useAutoAddForm();
  useEffect(() => {
    if (autoAddOpen) setShowForm(true);
  }, [autoAddOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/service-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        locationId: form.locationId || undefined,
        machineId: form.machineId || undefined,
      }),
    });
    setSaving(false);
    setForm({ customerId: "", locationId: "", machineId: "", description: "", priority: "NORMAL" });
    setShowForm(false);
    refresh();
    notifyDataChanged(["service-requests", "machines", "customers", "notifications"]);
  };

  const handleAssign = async (id: string) => {
    await fetch(`/api/service-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engineerId: assignEngineerId, status: "ASSIGNED" }),
    });
    setAssigningId(null);
    setAssignEngineerId("");
    refresh();
    notifyDataChanged(["service-requests", "engineers", "notifications"]);
  };

  const handleStatus = async (id: string, status: string) => {
    await fetch(`/api/service-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    refresh();
    notifyDataChanged(["service-requests", "machines", "notifications"]);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("common.deleteConfirm") }))) return;
    const res = await fetch(`/api/service-requests/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) { toastError(apiErrorMessage(data, t)); return; }
    refresh();
    notifyDataChanged(["service-requests", "notifications"]);
    toastSuccess(t("common.deletedSuccessfully"));
  };

  const renderStars = (rating: number | null) => {
    if (rating === null) return null;
    return (
      <span className="text-yellow-500">
        {"★".repeat(rating)}{"☆".repeat(5 - rating)}
      </span>
    );
  };

  const filtered = requests.filter((request) => {
    if (isEngineer && myEngineerId && request.engineerId !== myEngineerId) {
      return false;
    }
    if (isEngineer && !myEngineerId) {
      return false;
    }

    return (
      (!statusFilter || request.status === statusFilter) &&
      (!priorityFilter || request.priority === priorityFilter) &&
      (!engineerFilter || request.engineerId === engineerFilter) &&
      inDateRange(request.createdAt, dateFrom, dateTo) &&
      (matchesQuery(request.requestNumber, search) ||
        matchesQuery(request.description, search) ||
        matchesQuery(request.customer?.name, search) ||
        matchesQuery(request.machine?.serialNumber, search) ||
        matchesQuery(request.engineer?.name, search))
    );
  });
  const hasActiveFilters = statusFilter !== "" || priorityFilter !== "" || (!isEngineer && engineerFilter !== "") || dateFrom !== "" || dateTo !== "" || search !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    const openStatuses = ["NEW", "ASSIGNED", "VISITED", "REASSIGNED", "NOT_RESOLVED"];
    const urgentPriorities = ["URGENT", "EMERGENCY"];
    return {
      total: requests.length,
      open: requests.filter((r) => openStatuses.includes(r.status)).length,
      urgent: requests.filter((r) => urgentPriorities.includes(r.priority) && openStatuses.includes(r.status)).length,
      resolved: requests.filter((r) => r.status === "RESOLVED").length,
    };
  }, [requests]);

  const exportRequests = () => ({
    headers: [
      t("serviceRequests.requestNumber"),
      t("serviceRequests.customer"),
      t("serviceRequests.machine"),
      t("serviceRequests.priority"),
      t("serviceRequests.status"),
      t("serviceRequests.engineer"),
      t("common.date"),
      t("serviceRequests.problems"),
      t("serviceRequests.rating"),
    ],
    rows: filtered.map((req) => [
      req.requestNumber,
      req.customer.name,
      req.machine?.serialNumber || "",
      PRIORITY_LABELS[req.priority] || req.priority,
      STATUS_LABELS[req.status] || req.status,
      req.engineer?.name || "",
      new Date(req.createdAt).toISOString().slice(0, 10),
      String(req.problems.length),
      req.customerRating != null ? String(req.customerRating) : "",
    ]),
  });

  const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">{t("serviceRequests.title")}</h1>
        </div>
        {canManageRequests && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700">
            <span className="text-lg leading-none">+</span>{t("serviceRequests.newRequest")}
          </button>
        )}
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("serviceRequests.stats.total"), value: stats.total.toLocaleString("ar-EG"), icon: <ClipboardList size={18} />, tone: "sky" },
          { label: t("serviceRequests.stats.open"), value: stats.open.toLocaleString("ar-EG"), icon: <ClipboardList size={18} />, tone: "blue" },
          { label: t("serviceRequests.stats.urgent"), value: stats.urgent.toLocaleString("ar-EG"), icon: <TriangleAlert size={18} />, tone: "red" },
          { label: t("serviceRequests.stats.resolved"), value: stats.resolved.toLocaleString("ar-EG"), icon: <CheckCircle2 size={18} />, tone: "green" },
        ]}
      />

      <FormModal open={showForm} onClose={() => setShowForm(false)} title={t("serviceRequests.newRequest")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <SelectWithAdd
            label={t("serviceRequests.selectCustomer")}
            value={form.customerId}
            onChange={(v) => setForm({ ...form, customerId: v, locationId: "", machineId: "" })}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            placeholder={t("serviceRequests.selectCustomer")}
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
              setForm((f) => ({ ...f, customerId: item.id, locationId: "", machineId: "" }));
            }}
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("machineDetails.location")}</label>
            <SearchableSelect value={form.locationId} onChange={(v) => setForm({ ...form, locationId: v, machineId: "" })} options={(customers.find(customer => customer.id === form.customerId)?.locations || []).map(location => ({ value: location.id, label: location.name }))} placeholder={t("common.selectOption")} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("serviceRequests.machine")}</label>
            <SearchableSelect value={form.machineId} onChange={(v) => setForm({ ...form, machineId: v })} options={machines.filter(machine => machine.currentOwnerId === form.customerId && (!form.locationId || machine.customerLocationId === form.locationId)).map(machine => ({ value: machine.id, label: `${machine.serialNumber}${machine.model ? ` · ${machine.model}` : ""}` }))} placeholder={t("common.selectOption")} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("serviceRequests.priority")}</label>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputClass}>
              <option value="NORMAL">{PRIORITY_LABELS.NORMAL}</option>
              <option value="IMPORTANT">{PRIORITY_LABELS.IMPORTANT}</option>
              <option value="URGENT">{PRIORITY_LABELS.URGENT}</option>
              <option value="EMERGENCY">{PRIORITY_LABELS.EMERGENCY}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("common.description")}</label>
            <textarea placeholder={t("common.description")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} rows={3} required />
          </div>
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"><X size={16} className="ms-1 inline-block" />{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none"><SearchInput value={search} onChange={setSearchInput} placeholder={t("serviceRequests.searchPlaceholder")} /></div>
          <FilterSelect value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} allLabel={`${t("serviceRequests.status")} — ${t("common.all")}`} className="md:w-40" />
          <FilterSelect value={priorityFilter} onChange={(v) => { setPriorityFilter(v); setPage(1); }} options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))} allLabel={`${t("serviceRequests.priorityFilter")} — ${t("common.all")}`} className="md:w-36" />
          {!isEngineer && (
            <FilterSelect value={engineerFilter} onChange={(v) => { setEngineerFilter(v); setPage(1); }} options={engineers.map((e) => ({ value: e.id, label: e.name }))} allLabel={`${t("serviceRequests.engineerFilter")} — ${t("common.all")}`} className="md:w-44" />
          )}
          <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={(v) => { setDateFrom(v); setPage(1); }} onToChange={(v) => { setDateTo(v); setPage(1); }} />
          {hasActiveFilters && (
            <button onClick={() => { setSearchInput(null); setStatusFilter(""); setPriorityFilter(""); setEngineerFilter(""); setDateFrom(""); setDateTo(""); }} className="text-sm text-gray-500 hover:text-gray-700 underline">
              {t("common.resetFilters")}
            </button>
          )}
          <div className="md:ms-auto mt-2 md:mt-0 flex gap-2">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton filename="service-requests" getExport={exportRequests} disabled={filtered.length === 0} />
          </div>
        </div>
        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("serviceRequests.requestNumber")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("serviceRequests.customer")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("serviceRequests.machine")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("serviceRequests.priority")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("serviceRequests.status")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("serviceRequests.engineer")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.date")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("serviceRequests.problems")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("serviceRequests.rating")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paged.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{req.requestNumber}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/customers?q=${encodeURIComponent(req.customer.name)}`} className="text-blue-600 hover:underline">
                        {req.customer.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {req.machine ? (
                        <Link href={`/machines?serial=${encodeURIComponent(req.machine.serialNumber)}`} className="font-mono text-blue-600 hover:underline">
                          {req.machine.serialNumber}
                        </Link>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColors[req.priority] || ""}`}>
                        {PRIORITY_LABELS[req.priority] || req.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[req.status] || ""}`}>
                        {STATUS_LABELS[req.status] || req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{req.engineer?.name || "-"}</td>
                    <td className="px-4 py-3 text-sm"><DateTimeCell value={req.createdAt} /></td>
                    <td className="px-4 py-3 text-sm text-center">{req.problems.length}</td>
                    <td className="px-4 py-3 text-sm">{renderStars(req.customerRating)}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-1 flex-wrap">
                        {canManageRequests && req.status !== "CLOSED" && req.status !== "RESOLVED" && req.status !== "NOT_RESOLVED" && (
                          <>
                            <button onClick={() => setAssigningId(assigningId === req.id ? null : req.id)} className="text-purple-600 hover:underline text-xs">
                              {t("serviceRequests.assign")}
                            </button>
                            <button onClick={() => handleStatus(req.id, "RESOLVED")} className="text-green-600 hover:underline text-xs">
                              {t("common.resolve")}
                            </button>
                            <button onClick={() => handleStatus(req.id, "NOT_RESOLVED")} className="text-red-600 hover:underline text-xs">
                              {t("common.notResolve")}
                            </button>
                          </>
                        )}

                        {isEngineer && req.engineerId === myEngineerId && req.status !== "CLOSED" && req.status !== "RESOLVED" && req.status !== "NOT_RESOLVED" && (
                          <>
                            <button onClick={() => handleStatus(req.id, "VISITED")} className="text-amber-600 hover:underline text-xs">
                              {t("serviceRequests.visited")}
                            </button>
                            <button onClick={() => handleStatus(req.id, "RESOLVED")} className="text-green-600 hover:underline text-xs">
                              {t("common.resolve")}
                            </button>
                            <button onClick={() => handleStatus(req.id, "NOT_RESOLVED")} className="text-red-600 hover:underline text-xs">
                              {t("common.notResolve")}
                            </button>
                          </>
                        )}

                        {(canManageRequests || (isEngineer && req.engineerId === myEngineerId)) && req.status === "RESOLVED" && (
                          <button onClick={() => handleStatus(req.id, "CLOSED")} className="text-gray-600 hover:underline text-xs">{t("serviceRequests.closed")}</button>
                        )}
                        {canManageRequests && (
                          <button onClick={() => handleDelete(req.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100" title={t("common.delete")}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      {assigningId === req.id && canManageRequests && (
                        <div className="mt-2 flex gap-1">
                          <SearchableSelect value={assignEngineerId} onChange={setAssignEngineerId} options={engineers.map((eng) => ({ value: eng.id, label: eng.name }))} placeholder={t("serviceRequests.selectEngineer")} className="min-w-44 flex-1" />
                          <button onClick={() => handleAssign(req.id)} className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700">{t("serviceRequests.ok")}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
          </>
        )}
      </div>
    </div>
  );
}
