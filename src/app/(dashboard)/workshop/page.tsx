"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import { DateTimeCell } from "@/components/DateTimeCell";
import { Save, Hammer, SearchCheck, Wrench, CircleCheckBig, Plus, Trash2, Package, ClipboardList, CheckCircle2 } from "lucide-react";
import RefreshButton from "@/components/RefreshButton";
import StatsCards from "@/components/StatsCards";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";
import { useConfirm, useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import SearchableSelect from "@/components/SearchableSelect";
import { getEgyptDateTimeLocal, formatEgyptDateTime } from "@/lib/datetime";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Movement {
  id: string;
  date: string;
  engineerId: string | null;
  engineerName: string | null;
  customerId: string | null;
  customerName: string | null;
  description: string;
  requestedBy: string | null;
  movementType: "SALE" | "REPLACEMENT" | "RETURN";
  performedById: string | null;
  performedByName: string | null;
  receivedById: string | null;
  receivedByName: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  engineer?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
  performedBy?: { id: string; name: string } | null;
  receivedBy?: { id: string; name: string } | null;
}

interface Machine {
  id: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  status: string;
  purchaseDate?: string;
  notes?: string;
}

interface MovementForm {
  date: string;
  engineerId: string;
  engineerName: string;
  customerId: string;
  customerName: string;
  description: string;
  requestedBy: string;
  movementType: string;
  performedById: string;
  performedByName: string;
}

function getCurrentDateTimeLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const emptyMovementForm: MovementForm = {
  date: getCurrentDateTimeLocal(),
  engineerId: "",
  engineerName: "",
  customerId: "",
  customerName: "",
  description: "",
  requestedBy: "",
  movementType: "SALE",
  performedById: "",
  performedByName: "",
};

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  SALE: "بيع",
  REPLACEMENT: "استبدال",
  RETURN: "مرتجع",
};

const STATUS_LABELS: Record<string, string> = {
  UNDER_INSPECTION: "تحت الفحص",
  UNDER_MAINTENANCE: "تحت الصيانة",
  SOLD: "مباع",
  RENTED: "مؤجر",
  IN_WAREHOUSE: "في المستودع",
  SCRAPPED: "مهمل",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkshopPage() {
  const { t, dir } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  // Tabs
  const [activeTab, setActiveTab] = useState<"movements" | "machines">("movements");

  // Movements state
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [form, setForm] = useState<MovementForm>(emptyMovementForm);
  const [search, setSearch] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState("");
  const [engineerFilter, setEngineerFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [receiptFilter, setReceiptFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // Machines state (old tab)
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [scrapTarget, setScrapTarget] = useState<string | null>(null);
  const [scrapForm, setScrapForm] = useState({ reason: "", approvedBy: "", scrapValue: 0 });
  const [machineSearch, setMachineSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [machinePage, setMachinePage] = useState(1);
  const MACHINE_PAGE_SIZE = 10;

  // Dropdown options
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  // ─── Fetch movements ──────────────────────────────────────────────────────

  const fetchMovements = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (movementTypeFilter) params.set("movementType", movementTypeFilter);
      if (engineerFilter) params.set("engineerId", engineerFilter);
      if (customerFilter) params.set("customerId", customerFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (receiptFilter) params.set("receiptStatus", receiptFilter);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));

      const res = await fetch(`/api/workshop/movements?${params}`);
      const data = await res.json();
      setMovements(Array.isArray(data.data) ? data.data : []);
    } catch {
      setMovements([]);
    } finally {
      setMovementsLoading(false);
    }
  };

  const fetchMachines = async () => {
    try {
      const res = await fetch("/api/workshop");
      const data = await res.json();
      setMachines(Array.isArray(data) ? data : []);
    } catch {
      setMachines([]);
    } finally {
      setMachinesLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [engRes, custRes, userRes] = await Promise.all([
        fetch("/api/engineers"),
        fetch("/api/customers"),
        fetch("/api/users"),
      ]);
      const [engData, custData, userData] = await Promise.all([
        engRes.json(),
        custRes.json(),
        userRes.json(),
      ]);
      setEngineers(Array.isArray(engData) ? engData : []);
      setCustomers(Array.isArray(custData) ? custData : []);
      setUsers(Array.isArray(userData) ? userData : []);
    } catch {
      // silent
    }
  };

  const didFetch = useRef(false);
  useEffect(() => {
    if (didFetch.current) return;
    didFetch.current = true;
    void fetchMovements();
    void fetchMachines();
    void fetchOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { refresh, refreshing } = useAutoRefresh(fetchMovements, ["workshop"]);

  // ─── Filtering ────────────────────────────────────────────────────────────

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          m.description?.toLowerCase().includes(q) ||
          m.customerName?.toLowerCase().includes(q) ||
          m.engineerName?.toLowerCase().includes(q) ||
          m.requestedBy?.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (movementTypeFilter && m.movementType !== movementTypeFilter) return false;
      if (engineerFilter && m.engineerId !== engineerFilter) return false;
      if (customerFilter && m.customerId !== customerFilter) return false;
      if (receiptFilter === "received" && !m.receivedAt) return false;
      if (receiptFilter === "pending" && m.receivedAt) return false;
      return true;
    });
  }, [movements, search, movementTypeFilter, engineerFilter, customerFilter, receiptFilter]);

  const filteredMachines = useMemo(() => {
    return machines.filter(
      (m) =>
        (!statusFilter || m.status === statusFilter) &&
        (matchesQuery(m.serialNumber, machineSearch) ||
          matchesQuery(m.manufacturer, machineSearch) ||
          matchesQuery(m.model, machineSearch) ||
          matchesQuery(m.notes, machineSearch))
    );
  }, [machines, machineSearch, statusFilter]);

  // ─── Stats ────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = movements.length;
    const sales = movements.filter((m) => m.movementType === "SALE").length;
    const replacements = movements.filter((m) => m.movementType === "REPLACEMENT").length;
    const returns = movements.filter((m) => m.movementType === "RETURN").length;
    const pending = movements.filter((m) => !m.receivedAt).length;
    return { total, sales, replacements, returns, pending };
  }, [movements]);

  const machineStats = useMemo(() => {
    const maintaining = filteredMachines.filter((m) => m.status === "UNDER_MAINTENANCE").length;
    const inspecting = filteredMachines.filter((m) => m.status === "UNDER_INSPECTION").length;
    return {
      total: filteredMachines.length,
      inspecting,
      maintaining,
      ready: filteredMachines.length - inspecting - maintaining,
    };
  }, [filteredMachines]);

  // ─── Pagination ───────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filteredMovements.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedMovements = filteredMovements.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const machineTotalPages = Math.max(1, Math.ceil(filteredMachines.length / MACHINE_PAGE_SIZE));
  const machineSafePage = Math.min(machinePage, machineTotalPages);
  const pagedMachines = filteredMachines.slice((machineSafePage - 1) * MACHINE_PAGE_SIZE, machineSafePage * MACHINE_PAGE_SIZE);

  // ─── Export ───────────────────────────────────────────────────────────────

  const exportMovements = () => ({
    headers: [
      t("workshop.movements.date"),
      t("workshop.movements.engineer"),
      t("workshop.movements.customer"),
      t("workshop.movements.description"),
      t("workshop.movements.requestedBy"),
      t("workshop.movements.sale"),
      t("workshop.movements.replacement"),
      t("workshop.movements.return"),
      t("workshop.movements.performedBy"),
      t("workshop.movements.receivedBy"),
      t("workshop.movements.receivedAt"),
    ],
    rows: filteredMovements.map((m) => [
      m.date ? new Date(m.date).toISOString().slice(0, 10) : "",
      m.engineerName || m.engineer?.name || "",
      m.customerName || m.customer?.name || "",
      m.description || "",
      m.requestedBy || "",
      m.movementType === "SALE" ? "✓" : "",
      m.movementType === "REPLACEMENT" ? "✓" : "",
      m.movementType === "RETURN" ? "✓" : "",
      m.performedByName || m.performedBy?.name || "",
      m.receivedByName || m.receivedBy?.name || "",
      m.receivedAt ? new Date(m.receivedAt).toISOString() : "",
    ]),
  });

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  const openAddForm = () => {
    setEditingMovement(null);
    setForm({ ...emptyMovementForm, date: getEgyptDateTimeLocal() });
    setShowForm(true);
  };

  const openEditForm = (m: Movement) => {
    setEditingMovement(m);
    const dateObj = m.date ? new Date(m.date) : new Date();
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    const hours = String(dateObj.getHours()).padStart(2, "0");
    const minutes = String(dateObj.getMinutes()).padStart(2, "0");
    setForm({
      date: `${year}-${month}-${day}T${hours}:${minutes}`,
      engineerId: m.engineerId || "",
      engineerName: m.engineerName || "",
      customerId: m.customerId || "",
      customerName: m.customerName || "",
      description: m.description || "",
      requestedBy: m.requestedBy || "",
      movementType: m.movementType || "SALE",
      performedById: m.performedById || "",
      performedByName: m.performedByName || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingMovement
        ? `/api/workshop/movements/${editingMovement.id}`
        : "/api/workshop/movements";
      const method = editingMovement ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          engineerId: form.engineerId || null,
          customerId: form.customerId || null,
          performedById: form.performedById || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toastError(apiErrorMessage(data, t));
        return;
      }

      toastSuccess(editingMovement ? t("common.updatedSuccessfully") : t("common.createdSuccessfully"));
      setShowForm(false);
      setForm({ ...emptyMovementForm, date: getEgyptDateTimeLocal() });
      setEditingMovement(null);
      refresh();
      notifyDataChanged(["workshop"]);
    } catch {
      toastError(t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: Movement) => {
    if (!(await confirmAction({ message: t("common.deleteConfirm") }))) return;
    try {
      const res = await fetch(`/api/workshop/movements/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toastError(apiErrorMessage(data, t));
        return;
      }
      toastSuccess(t("common.deletedSuccessfully"));
      refresh();
      notifyDataChanged(["workshop"]);
    } catch {
      toastError(t("common.error"));
    }
  };

  const handleConfirmReceipt = async (m: Movement) => {
    try {
      const res = await fetch(`/api/workshop/movements/${m.id}/confirm-receipt`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toastError(apiErrorMessage(data, t));
        return;
      }
      toastSuccess(t("workshop.movements.receiptConfirmed"));
      refresh();
      notifyDataChanged(["workshop"]);
    } catch {
      toastError(t("common.error"));
    }
  };

  const handleScrap = async (e: React.FormEvent, machineId: string) => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(`/api/workshop/${machineId}/scrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scrapForm),
      });
      setScrapForm({ reason: "", approvedBy: "", scrapValue: 0 });
      setScrapTarget(null);
      refresh();
      notifyDataChanged(["workshop", "machines"]);
    } finally {
      setSaving(false);
    }
  };

  const setField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const hasActiveFilters = search !== "" || movementTypeFilter !== "" || engineerFilter !== "" || customerFilter !== "" || dateFrom !== "" || dateTo !== "" || receiptFilter !== "";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div dir={dir} className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">
            {t("workshop.movements.title")}
          </h1>
        </div>
        {activeTab === "movements" && (
          <button
            onClick={openAddForm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          >
            <Plus size={16} />
            {t("workshop.movements.addMovement")}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => setActiveTab("movements")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
            activeTab === "movements"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <ClipboardList size={16} className="inline-block me-2" />
          {t("workshop.movements.tabMovements")}
        </button>
        <button
          onClick={() => setActiveTab("machines")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
            activeTab === "machines"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Package size={16} className="inline-block me-2" />
          {t("workshop.movements.tabMachines")}
        </button>
      </div>

      {/* ═══ MOVEMENTS TAB ═══ */}
      {activeTab === "movements" && (
        <>
          {/* Stats */}
          <StatsCards
            columns={4}
            stats={[
              { label: t("workshop.movements.stats.total"), value: stats.total.toLocaleString("ar-EG"), icon: <ClipboardList size={18} />, tone: "sky" },
              { label: t("workshop.movements.stats.sales"), value: stats.sales.toLocaleString("ar-EG"), icon: <CircleCheckBig size={18} />, tone: "green" },
              { label: t("workshop.movements.stats.replacements"), value: stats.replacements.toLocaleString("ar-EG"), icon: <Wrench size={18} />, tone: "orange" },
              { label: t("workshop.movements.stats.returns"), value: stats.returns.toLocaleString("ar-EG"), icon: <SearchCheck size={18} />, tone: "amber" },
            ]}
          />

          {/* Filters */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <div className="xl:col-span-2">
                  <SearchInput
                    value={search}
                    onChange={(v) => { setSearch(v); setPage(1); }}
                    placeholder={t("workshop.movements.searchPlaceholder")}
                  />
                </div>
                <FilterSelect
                  value={movementTypeFilter}
                  onChange={(v) => { setMovementTypeFilter(v); setPage(1); }}
                  options={Object.entries(MOVEMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                  allLabel={`${t("workshop.movements.movementType")} — ${t("common.all")}`}
                />
                <FilterSelect
                  value={engineerFilter}
                  onChange={(v) => { setEngineerFilter(v); setPage(1); }}
                  options={engineers.map((e) => ({ value: e.id, label: e.name }))}
                  allLabel={`${t("workshop.movements.engineer")} — ${t("common.all")}`}
                />
                <FilterSelect
                  value={customerFilter}
                  onChange={(v) => { setCustomerFilter(v); setPage(1); }}
                  options={customers.map((c) => ({ value: c.id, label: c.name }))}
                  allLabel={`${t("workshop.movements.customer")} — ${t("common.all")}`}
                />
                <FilterSelect
                  value={receiptFilter}
                  onChange={(v) => { setReceiptFilter(v); setPage(1); }}
                  options={[
                    { value: "received", label: t("workshop.movements.received") },
                    { value: "pending", label: t("workshop.movements.pending") },
                  ]}
                  allLabel={`${t("workshop.movements.receiptStatus")} — ${t("common.all")}`}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-500">{t("workshop.movements.dateFrom")}:</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-500">{t("workshop.movements.dateTo")}:</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={() => { setSearch(""); setMovementTypeFilter(""); setEngineerFilter(""); setCustomerFilter(""); setDateFrom(""); setDateTo(""); setReceiptFilter(""); setPage(1); }}
                    className="text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    {t("common.resetFilters")}
                  </button>
                )}
                <div className="flex flex-wrap gap-2 ms-auto">
                  <RefreshButton onRefresh={refresh} refreshing={refreshing} />
                  <ExportButton filename="workshop-movements" getExport={exportMovements} disabled={filteredMovements.length === 0} />
                </div>
              </div>
            </div>

            {/* Table */}
            {movementsLoading ? (
              <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
                <PrinterLoader size="md" label={t("common.loading")} />
              </div>
            ) : movements.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <p className="text-sm text-gray-400">{t("common.noData")}</p>
              </div>
            ) : filteredMovements.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <p className="text-sm text-gray-400">{t("common.noData")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px]">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-start px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">{t("workshop.movements.date")}</th>
                      <th className="text-start px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">{t("workshop.movements.engineer")}</th>
                      <th className="text-start px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">{t("workshop.movements.customer")}</th>
                      <th className="text-start px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[200px]">{t("workshop.movements.description")}</th>
                      <th className="text-start px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">{t("workshop.movements.requestedBy")}</th>
                      <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 w-12">{t("workshop.movements.sale")}</th>
                      <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 w-12">{t("workshop.movements.replacement")}</th>
                      <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 w-12">{t("workshop.movements.return")}</th>
                      <th className="text-start px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">{t("workshop.movements.performedBy")}</th>
                      <th className="text-start px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[140px]">{t("workshop.movements.receipt")}</th>
                      <th className="text-start px-3 py-2.5 text-xs font-medium text-gray-500 w-20">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {pagedMovements.map((m) => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 text-sm whitespace-nowrap">
                          <DateTimeCell value={m.date} />
                        </td>
                        <td className="px-3 py-2.5 text-sm whitespace-nowrap">{m.engineerName || m.engineer?.name || "—"}</td>
                        <td className="px-3 py-2.5 text-sm whitespace-nowrap">{m.customerName || m.customer?.name || "—"}</td>
                        <td className="px-3 py-2.5 text-sm max-w-[200px] truncate" title={m.description}>{m.description || "—"}</td>
                        <td className="px-3 py-2.5 text-sm whitespace-nowrap">{m.requestedBy || "—"}</td>
                        <td className="px-3 py-2.5 text-center text-sm">{m.movementType === "SALE" ? "✓" : ""}</td>
                        <td className="px-3 py-2.5 text-center text-sm">{m.movementType === "REPLACEMENT" ? "✓" : ""}</td>
                        <td className="px-3 py-2.5 text-center text-sm">{m.movementType === "RETURN" ? "✓" : ""}</td>
                        <td className="px-3 py-2.5 text-sm whitespace-nowrap">{m.performedByName || m.performedBy?.name || "—"}</td>
                        <td className="px-3 py-2.5 text-sm">
                          {m.receivedAt ? (
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-green-600 font-medium text-xs truncate">{m.receivedByName || m.receivedBy?.name || "—"}</span>
                              <span className="text-xs text-gray-400 whitespace-nowrap" dir="ltr">
                                {formatEgyptDateTime(m.receivedAt).dateStr}{" "}
                                {formatEgyptDateTime(m.receivedAt).timeStr}
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleConfirmReceipt(m)}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-xs font-medium text-green-700 transition hover:bg-green-100 whitespace-nowrap"
                            >
                              <CheckCircle2 size={12} />
                              {t("workshop.movements.confirmReceipt")}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-sm">
                          <div className="flex gap-1">
                            <button
                              onClick={() => openEditForm(m)}
                              className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100 whitespace-nowrap"
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              onClick={() => handleDelete(m)}
                              className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filteredMovements.length} pageSize={PAGE_SIZE} />
          </div>

          {/* Add/Edit Form Modal */}
          <FormModal
            open={showForm}
            onClose={() => { setShowForm(false); setEditingMovement(null); }}
            title={editingMovement ? t("workshop.movements.editMovement") : t("workshop.movements.addMovement")}
            wide
          >
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("workshop.movements.date")} *</label>
                <input
                  type="datetime-local"
                  value={form.date}
                  onChange={(e) => setField("date", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("workshop.movements.engineer")}</label>
                <SearchableSelect
                  value={form.engineerId}
                  onChange={(v) => {
                    const eng = engineers.find((e) => e.id === v);
                    setForm((prev) => ({ ...prev, engineerId: v, engineerName: eng?.name || "" }));
                  }}
                  options={engineers.map((e) => ({ value: e.id, label: e.name }))}
                  placeholder={t("workshop.movements.selectEngineer")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("workshop.movements.customer")}</label>
                <SearchableSelect
                  value={form.customerId}
                  onChange={(v) => {
                    const cust = customers.find((c) => c.id === v);
                    setForm((prev) => ({ ...prev, customerId: v, customerName: cust?.name || "" }));
                  }}
                  options={customers.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder={t("workshop.movements.selectCustomer")}
                />
              </div>
              <div className="md:col-span-2 lg:col-span-3 space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("workshop.movements.description")} *</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  required
                  placeholder={t("workshop.movements.descriptionPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("workshop.movements.requestedBy")}</label>
                <input
                  type="text"
                  value={form.requestedBy}
                  onChange={(e) => setField("requestedBy", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("workshop.movements.movementType")} *</label>
                <select
                  value={form.movementType}
                  onChange={(e) => setField("movementType", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="SALE">{t("workshop.movements.sale")}</option>
                  <option value="REPLACEMENT">{t("workshop.movements.replacement")}</option>
                  <option value="RETURN">{t("workshop.movements.return")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">{t("workshop.movements.performedBy")}</label>
                <SearchableSelect
                  value={form.performedById}
                  onChange={(v) => {
                    const usr = users.find((u) => u.id === v);
                    setForm((prev) => ({ ...prev, performedById: v, performedByName: usr?.name || "" }));
                  }}
                  options={users.map((u) => ({ value: u.id, label: u.name }))}
                  placeholder={t("workshop.movements.selectPerformedBy")}
                />
              </div>
              <div className="md:col-span-2 lg:col-span-3 flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingMovement(null); }}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  {t("common.cancel")}
                </button>
                <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Save size={16} />
                </SubmitButton>
              </div>
            </form>
          </FormModal>
        </>
      )}

      {/* ═══ MACHINES TAB (old content) ═══ */}
      {activeTab === "machines" && (
        <>
          <StatsCards
            columns={4}
            stats={[
              { label: t("workshop.stats.total"), value: machineStats.total.toLocaleString("ar-EG"), icon: <Hammer size={18} />, tone: "sky" },
              { label: t("workshop.stats.inspecting"), value: machineStats.inspecting.toLocaleString("ar-EG"), icon: <SearchCheck size={18} />, tone: "amber" },
              { label: t("workshop.stats.maintaining"), value: machineStats.maintaining.toLocaleString("ar-EG"), icon: <Wrench size={18} />, tone: "orange" },
              { label: t("workshop.stats.ready"), value: machineStats.ready.toLocaleString("ar-EG"), icon: <CircleCheckBig size={18} />, tone: "green" },
            ]}
          />

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-full sm:w-auto sm:flex-1 sm:max-w-xs">
                  <SearchInput
                    value={machineSearch}
                    onChange={(v) => { setMachineSearch(v); setMachinePage(1); }}
                    placeholder={`${t("common.search")} ${t("machines.serialNumber")} / ${t("machines.model")}...`}
                  />
                </div>
                <FilterSelect
                  value={statusFilter}
                  onChange={(v) => { setStatusFilter(v); setMachinePage(1); }}
                  options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                  allLabel={`${t("machines.status")} — ${t("common.all")}`}
                />
                {machineSearch !== "" || statusFilter !== "" ? (
                  <button
                    onClick={() => { setMachineSearch(""); setStatusFilter(""); setMachinePage(1); }}
                    className="text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    {t("common.resetFilters")}
                  </button>
                ) : null}
                <div className="ms-auto">
                  <RefreshButton onRefresh={fetchMachines} refreshing={false} />
                </div>
              </div>
            </div>
            {machinesLoading ? (
              <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
                <PrinterLoader size="md" label={t("common.loading")} />
              </div>
            ) : machines.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <p className="text-sm text-gray-400">{t("common.noData")}</p>
              </div>
            ) : filteredMachines.length === 0 ? (
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
                    {pagedMachines.map((machine) => (
                      <tr key={machine.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{machine.serialNumber}</td>
                        <td className="px-4 py-3 text-sm">{machine.manufacturer}</td>
                        <td className="px-4 py-3 text-sm">{machine.model}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {STATUS_LABELS[machine.status] || machine.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <DateTimeCell value={machine.purchaseDate} />
                        </td>
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
            <Pagination currentPage={machineSafePage} totalPages={machineTotalPages} onPageChange={setMachinePage} totalItems={filteredMachines.length} pageSize={MACHINE_PAGE_SIZE} />
          </div>

          {/* Scrap Modal */}
          <FormModal
            open={!!scrapTarget}
            onClose={() => setScrapTarget(null)}
            title={`${t("workshop.scrapOrder")} - ${machines.find((m) => m.id === scrapTarget)?.serialNumber || ""}`}
          >
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
        </>
      )}
    </div>
  );
}
