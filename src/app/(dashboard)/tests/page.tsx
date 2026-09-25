"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Camera,
  Eye,
  ImagePlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "@/i18n/context";
import { hasPageAccess } from "@/lib/permissions";
import { apiErrorMessage } from "@/lib/api-client";
import { notifyDataChanged } from "@/lib/data-events";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useUrlParams } from "@/hooks/useUrlParams";
import SearchInput from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import DateRangeFilter from "@/components/DateRangeFilter";
import SearchableSelect from "@/components/SearchableSelect";
import ExportButton from "@/components/ExportButton";
import RefreshButton from "@/components/RefreshButton";
import Pagination from "@/components/Pagination";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import PrinterLoader from "@/components/PrinterLoader";
import { useConfirm, useToast } from "@/components/UIProvider";

const PAGE_SIZE = 15;

interface TestRow {
  id: string;
  pageCount: number;
  blackCounter?: number | null;
  colorCounter?: number | null;
  repairStatement?: string | null;
  spareParts?: string | null;
  collectedAmount?: number | null;
  collectionNote?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  testDate?: string | null;
  createdAt: string;
  customer?: { id: string; name: string } | null;
  engineer?: { id: string; name: string } | null;
  machine?: { id: string; serialNumber: string; model?: string | null } | null;
}

interface ListResponse {
  rows: TestRow[];
  total: number;
  totalPages: number;
  summary: { total: number; collectedTotal: number; blackTotal: number; colorTotal: number };
}

interface CustomerOption { id: string; name: string; engineerId?: string | null; }
interface EngineerOption { id: string; name: string; isActive?: boolean; }
interface MachineOption { id: string; serialNumber: string; model?: string | null; }

const todayInput = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function CopierTestsPage() {
  const { t, locale, dir } = useI18n();
  const { data: session } = useSession();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const canWrite =
    hasPageAccess(role, "copierTests") ||
    hasPageAccess(role, "customers") ||
    hasPageAccess(role, "serviceRequests");

  const urlParams = useUrlParams(["customer", "add"]);

  // ── list state ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<TestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({ total: 0, collectedTotal: 0, blackTotal: 0, colorTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [engineerFilter, setEngineerFilter] = useState("");
  const [imageFilter, setImageFilter] = useState("");
  const [collectedFilter, setCollectedFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // ── filter option sources ────────────────────────────────────────────────
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (search) sp.set("q", search);
    if (customerFilter) sp.set("customerId", customerFilter);
    if (engineerFilter) sp.set("engineerId", engineerFilter);
    if (imageFilter) sp.set("image", imageFilter);
    if (collectedFilter) sp.set("collected", collectedFilter);
    if (dateFrom) sp.set("from", dateFrom);
    if (dateTo) sp.set("to", dateTo);
    sp.set("page", String(page));
    sp.set("pageSize", String(PAGE_SIZE));
    return sp.toString();
  }, [search, customerFilter, engineerFilter, imageFilter, collectedFilter, dateFrom, dateTo, page]);

  // Promise chain (no synchronous setState) so the effect below stays lint-clean.
  const load = () => {
    fetch(`/api/tests?${query}`)
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (res.ok) {
          const payload = (data ?? {}) as ListResponse;
          setRows(Array.isArray(payload.rows) ? payload.rows : []);
          setTotal(payload.total ?? 0);
          setTotalPages(Math.max(1, payload.totalPages ?? 1));
          if (payload.summary) setSummary(payload.summary);
          setLoadError("");
        } else {
          const message = (data as { error?: string } | null)?.error;
          setLoadError(message || t("copierTests.loadError"));
        }
        setLoading(false);
      })
      .catch(() => {
        setLoadError(t("copierTests.loadError"));
        setLoading(false);
      });
  };

  const { refresh, refreshing } = useAutoRefresh(load, ["customers", "sales", "payments", "settlements"]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch whenever the query string changes
  }, [query]);

  // One-shot lookups for the filters + the form.
  useEffect(() => {
    let alive = true;
    Promise.all([fetch("/api/customers"), fetch("/api/engineers")])
      .then(async ([cRes, eRes]) => {
        const [cData, eData] = await Promise.all([cRes.json().catch(() => null), eRes.json().catch(() => null)]);
        if (!alive) return;
        if (Array.isArray(cData)) {
          setCustomers(
            cData.map((c: { id: string; name?: string; engineerId?: string | null }) => ({
              id: c.id,
              name: c.name ?? "",
              engineerId: c.engineerId ?? null,
            })),
          );
        }
        if (Array.isArray(eData)) {
          setEngineers(eData.filter((e: EngineerOption) => e.isActive !== false));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Debounced search (the list is filtered on the server).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const hasActiveFilters =
    searchInput !== "" ||
    customerFilter !== "" ||
    engineerFilter !== "" ||
    imageFilter !== "" ||
    collectedFilter !== "" ||
    dateFrom !== "" ||
    dateTo !== "";

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setCustomerFilter("");
    setEngineerFilter("");
    setImageFilter("");
    setCollectedFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  // ── add / edit form ──────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TestRow | null>(null);
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formEngineerId, setFormEngineerId] = useState("");
  const [formMachineId, setFormMachineId] = useState("");
  const [blackCounter, setBlackCounter] = useState("");
  const [colorCounter, setColorCounter] = useState("");
  const [repairStatement, setRepairStatement] = useState("");
  const [spareParts, setSpareParts] = useState("");
  const [collectedAmount, setCollectedAmount] = useState("");
  const [collectionNote, setCollectionNote] = useState("");
  const [notes, setNotes] = useState("");
  const [testDate, setTestDate] = useState(todayInput());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [customerMachines, setCustomerMachines] = useState<MachineOption[]>([]);
  const [allMachines, setAllMachines] = useState<MachineOption[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const previewRef = useRef<string | null>(null);

  const [viewing, setViewing] = useState<TestRow | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const clearImage = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setImageFile(null);
    setPreviewUrl(null);
  };

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const handleImageChange = (file: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : null;
    setImageFile(file);
    setPreviewUrl(previewRef.current);
  };

  // Machines of the picked customer (fallback: every machine).
  useEffect(() => {
    if (!formCustomerId) return;
    let alive = true;
    fetch(`/api/customers/${formCustomerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        setCustomerMachines(
          (data?.machines ?? []).map((m: { id: string; serialNumber: string; model?: string | null }) => ({
            id: m.id,
            serialNumber: m.serialNumber,
            model: m.model ?? null,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [formCustomerId]);

  useEffect(() => {
    if (customerMachines.length > 0 || allMachines.length > 0) return;
    let alive = true;
    fetch("/api/machines")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !Array.isArray(data)) return;
        setAllMachines(
          data.map((m: { id: string; serialNumber: string; model?: string | null }) => ({
            id: m.id,
            serialNumber: m.serialNumber,
            model: m.model ?? null,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [customerMachines.length, allMachines.length]);

  const machineOptions = customerMachines.length > 0 ? customerMachines : allMachines;

  const openAddForm = (customerId?: string) => {
    setEditing(null);
    const preset = customerId ?? customerFilter ?? "";
    setFormCustomerId(preset);
    setFormEngineerId("");
    setFormMachineId("");
    setBlackCounter("");
    setColorCounter("");
    setRepairStatement("");
    setSpareParts("");
    setCollectedAmount("");
    setCollectionNote("");
    setNotes("");
    setTestDate(todayInput());
    clearImage();
    setFormError("");
    setShowForm(true);
  };

  const openEditForm = (row: TestRow) => {
    setEditing(row);
    setFormCustomerId(row.customer?.id ?? "");
    setFormEngineerId(row.engineer?.id ?? "");
    setFormMachineId(row.machine?.id ?? "");
    setBlackCounter(row.blackCounter != null ? String(row.blackCounter) : "");
    setColorCounter(row.colorCounter != null ? String(row.colorCounter) : "");
    setRepairStatement(row.repairStatement ?? "");
    setSpareParts(row.spareParts ?? "");
    setCollectedAmount(row.collectedAmount != null ? String(row.collectedAmount) : "");
    setCollectionNote(row.collectionNote ?? "");
    setNotes(row.notes ?? "");
    setTestDate(row.testDate ? toLocalInput(row.testDate) : todayInput());
    clearImage();
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormError("");
  };

  // Apply the deep link (?customer=…&add=1) once the param values are known.
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);
  useEffect(() => {
    if (deepLinkApplied) return;
    let alive = true;
    // Async on purpose: URL params are read after mount (see useUrlParams).
    Promise.resolve().then(() => {
      if (!alive) return;
      if (urlParams.customer) {
        setCustomerFilter(urlParams.customer);
        setPage(1);
      }
      if (urlParams.add && canWrite) openAddForm();
      setDeepLinkApplied(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot deep link (guarded by deepLinkApplied)
  }, [urlParams, deepLinkApplied, canWrite]);

  const parseCounters = () => {
    const black = blackCounter.trim() === "" ? null : Number(blackCounter);
    const color = colorCounter.trim() === "" ? null : Number(colorCounter);
    const invalid =
      (black == null && color == null) ||
      (black != null && (!Number.isInteger(black) || black < 0)) ||
      (color != null && (!Number.isInteger(color) || color < 0)) ||
      (black === 0 && color === 0);
    return { black, color, invalid };
  };

  const validateForm = (): string => {
    if (!formCustomerId) return t("copierTests.customerRequired");
    if (!formEngineerId) return t("copierTests.engineerRequired");
    const { invalid } = parseCounters();
    if (invalid) return t("copierTests.countersRequired");
    if (collectedAmount.trim() !== "") {
      const amount = Number(collectedAmount);
      if (!Number.isFinite(amount) || amount <= 0) return t("copierTests.amountInvalid");
    }
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateForm();
    if (problem) {
      setFormError(problem);
      return;
    }
    const { black, color } = parseCounters();
    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        const res = await fetch(`/api/tests/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            engineerId: formEngineerId,
            blackCounter: black,
            colorCounter: color,
            pageCount: black && black > 0 ? black : (color ?? 0),
            machineId: formMachineId || null,
            repairStatement: repairStatement.trim(),
            spareParts: spareParts.trim(),
            collectedAmount: collectedAmount.trim() === "" ? null : Number(collectedAmount),
            collectionNote: collectionNote.trim(),
            notes: notes.trim(),
            testDate: testDate ? new Date(testDate).toISOString() : undefined,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setFormError(apiErrorMessage(data, t));
          return;
        }
        closeForm();
        refresh();
        toastSuccess(t("copierTests.testUpdated"));
        return;
      }

      const effectiveCount = blackCounter.trim() !== "" && black != null && black > 0 ? black : (color ?? 0);
      const formData = new FormData();
      formData.append("engineerId", formEngineerId);
      formData.append("pageCount", String(effectiveCount));
      formData.append("blackCounter", String(black ?? 0));
      if (color != null) formData.append("colorCounter", String(color));
      if (imageFile) formData.append("image", imageFile);
      if (repairStatement.trim()) formData.append("repairStatement", repairStatement.trim());
      if (spareParts.trim()) formData.append("spareParts", spareParts.trim());
      if (collectedAmount.trim()) formData.append("collectedAmount", String(Number(collectedAmount)));
      if (collectionNote.trim()) formData.append("collectionNote", collectionNote.trim());
      if (notes.trim()) formData.append("notes", notes.trim());
      if (testDate) formData.append("testDate", new Date(testDate).toISOString());
      if (formMachineId) formData.append("machineId", formMachineId);

      const res = await fetch(`/api/customers/${formCustomerId}/tests`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(apiErrorMessage(data, t));
        return;
      }
      closeForm();
      notifyDataChanged(["customers", "sales", "settlements"]);
      refresh();
      toastSuccess(data?.settlementId ? t("copierTests.testSavedWithSettlement") : t("copierTests.testSaved"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: TestRow) => {
    if (!(await confirmAction({ title: t("common.delete"), message: t("copierTests.deleteTestConfirm") }))) return;
    const res = await fetch(`/api/tests/${row.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toastError(apiErrorMessage(data, t));
      return;
    }
    notifyDataChanged(["customers", "sales", "settlements"]);
    refresh();
    toastSuccess(t("copierTests.testDeleted"));
  };

  // ── formatting helpers ───────────────────────────────────────────────────
  const formatDate = (value: string | null | undefined) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const loc = locale === "ar" ? "ar-EG" : "en-GB";
    return `${d.toLocaleDateString(loc)} ${d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}`;
  };

  const formatNum = (value: number | null | undefined) =>
    value == null ? "—" : value.toLocaleString(locale === "ar" ? "ar-EG" : "en-US");

  const fmtMoney = (value: number) => `${value.toLocaleString(locale === "ar" ? "ar-EG" : "en-US")} ج.م`;

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.name })),
    [customers],
  );
  const engineerOptions = useMemo(
    () => engineers.map((e) => ({ value: e.id, label: e.name })),
    [engineers],
  );
  const machineFormOptions = useMemo(
    () => machineOptions.map((m) => ({ value: m.id, label: `${m.serialNumber}${m.model ? ` — ${m.model}` : ""}` })),
    [machineOptions],
  );

  const selectedCustomerName =
    customers.find((c) => c.id === formCustomerId)?.name ??
    (editing?.customer?.name ?? "");

  return (
    <div dir={dir} className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-violet-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">
            {t("copierTests.pageTitle")}
            <span className="ms-2 text-sm font-medium text-gray-400">({formatNum(total)})</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t("copierTests.subtitle")}</p>
        </div>
        {canWrite && (
          <button
            onClick={() => openAddForm()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
          >
            <Plus size={16} />{t("copierTests.recordTest")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
          <p className="text-xs font-medium text-violet-600">{t("copierTests.statsTotal")}</p>
          <p className="mt-1 text-lg font-bold text-violet-700">{formatNum(summary.total)}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-medium text-emerald-600">{t("copierTests.statsCollected")}</p>
          <p className="mt-1 text-lg font-bold text-emerald-700" dir="ltr">{fmtMoney(summary.collectedTotal)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium text-gray-500">{t("copierTests.statsBlack")}</p>
          <p className="mt-1 text-lg font-bold text-slate-800" dir="ltr">{formatNum(summary.blackTotal)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium text-gray-500">{t("copierTests.statsColor")}</p>
          <p className="mt-1 text-lg font-bold text-slate-800" dir="ltr">{formatNum(summary.colorTotal)}</p>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status">
          <span>{loadError}</span>
          <button onClick={() => { setLoadError(""); void load(); }} className="text-inherit" aria-label={t("common.close")}>✕</button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none">
            <SearchInput
              value={searchInput}
              onChange={(v) => setSearchInput(v)}
              placeholder={t("copierTests.searchPlaceholder")}
            />
          </div>
          <FilterSelect
            value={customerFilter}
            onChange={(v) => { setCustomerFilter(v); setPage(1); }}
            options={customerOptions}
            allLabel={`${t("copierTests.filterCustomer")} — ${t("common.all")}`}
            className="md:w-56"
          />
          <FilterSelect
            value={engineerFilter}
            onChange={(v) => { setEngineerFilter(v); setPage(1); }}
            options={engineerOptions}
            allLabel={`${t("copierTests.filterEngineer")} — ${t("common.all")}`}
            className="md:w-44"
          />
          <FilterSelect
            value={imageFilter}
            onChange={(v) => { setImageFilter(v); setPage(1); }}
            options={[
              { value: "with", label: t("copierTests.withImage") },
              { value: "without", label: t("copierTests.withoutImage") },
            ]}
            allLabel={`${t("copierTests.filterImage")} — ${t("common.all")}`}
            className="md:w-40"
          />
          <FilterSelect
            value={collectedFilter}
            onChange={(v) => { setCollectedFilter(v); setPage(1); }}
            options={[
              { value: "with", label: t("copierTests.withCollection") },
              { value: "without", label: t("copierTests.withoutCollection") },
            ]}
            allLabel={`${t("copierTests.filterCollected")} — ${t("common.all")}`}
            className="md:w-44"
          />
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            onFromChange={(v) => { setDateFrom(v); setPage(1); }}
            onToChange={(v) => { setDateTo(v); setPage(1); }}
          />
          {hasActiveFilters && (
            <button onClick={resetFilters} className="text-sm text-gray-500 hover:text-gray-700 underline">
              {t("common.resetFilters")}
            </button>
          )}
          <div className="flex gap-2 md:ms-auto">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton
              filename={t("copierTests.exportFilename")}
              disabled={rows.length === 0}
              getExport={() => ({
                headers: [
                  t("copierTests.date"),
                  t("common.customer"),
                  t("copierTests.engineer"),
                  t("copierTests.machine"),
                  t("copierTests.blackCounter"),
                  t("copierTests.colorCounter"),
                  t("copierTests.repairStatement"),
                  t("copierTests.spareParts"),
                  t("copierTests.collectedAmount"),
                  t("copierTests.collectionNote"),
                  t("copierTests.notes"),
                  t("copierTests.image"),
                ],
                rows: rows.map((r) => [
                  formatDate(r.testDate ?? r.createdAt),
                  r.customer?.name ?? "",
                  r.engineer?.name ?? "",
                  r.machine?.serialNumber ?? "",
                  r.blackCounter != null ? String(r.blackCounter) : "",
                  r.colorCounter != null ? String(r.colorCounter) : "",
                  r.repairStatement ?? "",
                  r.spareParts ?? "",
                  r.collectedAmount != null ? String(r.collectedAmount) : "",
                  r.collectionNote ?? "",
                  r.notes ?? "",
                  r.imageUrl ?? "",
                ]),
              })}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("copierTests.date")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.customer")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("copierTests.engineer")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("copierTests.machine")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("copierTests.blackCounter")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("copierTests.colorCounter")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("copierTests.repairStatement")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("copierTests.collectedAmount")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("copierTests.image")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm whitespace-nowrap text-slate-600">{formatDate(row.testDate ?? row.createdAt)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="font-medium text-slate-800">{row.customer?.name || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap text-slate-600">{row.engineer?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap text-slate-600" dir="ltr">
                      {row.machine?.serialNumber || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold whitespace-nowrap text-slate-900" dir="ltr">
                      {formatNum(row.blackCounter ?? row.pageCount)}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap" dir="ltr">
                      {row.colorCounter != null ? (
                        <span className="font-semibold text-violet-700">{formatNum(row.colorCounter)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-sm text-slate-800" title={row.repairStatement || ""}>
                      {row.repairStatement || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap" dir="ltr">
                      {row.collectedAmount != null && row.collectedAmount > 0 ? (
                        <span className="font-bold text-emerald-700">{fmtMoney(row.collectedAmount)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {row.imageUrl ? (
                        <button
                          onClick={() => setLightboxUrl(row.imageUrl as string)}
                          title={t("copierTests.image")}
                          className="group relative inline-block overflow-hidden rounded-lg border-2 border-slate-200 transition hover:border-violet-500"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={row.imageUrl} alt={t("copierTests.testImage")} className="h-11 w-14 object-cover transition group-hover:scale-105" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">{t("copierTests.noImage")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          onClick={() => setViewing(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                          title={t("common.view")}
                        >
                          <Eye size={14} />{t("common.view")}
                        </button>
                        {canWrite && (
                          <>
                            <button
                              onClick={() => openEditForm(row)}
                              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600"
                              title={t("common.edit")}
                              aria-label={t("common.edit")}
                            >
                              <Pencil size={16} className="shrink-0" />
                            </button>
                            <button
                              onClick={() => handleDelete(row)}
                              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                              title={t("common.delete")}
                              aria-label={t("common.delete")}
                            >
                              <Trash2 size={16} className="shrink-0" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={total}
          pageSize={PAGE_SIZE}
        />
      </div>

      {/* ── add / edit modal ─────────────────────────────────────────────── */}
      <FormModal
        open={showForm}
        onClose={closeForm}
        title={editing ? t("copierTests.editTest") : t("copierTests.recordTest")}
        wide
      >
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {formError && (
            <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("common.customer")} <span className="text-red-500">*</span>
            </label>
            {editing ? (
              <input
                type="text"
                value={selectedCustomerName}
                readOnly
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600"
              />
            ) : (
              <SearchableSelect
                value={formCustomerId}
                onChange={(v) => { setFormCustomerId(v); setFormMachineId(""); setCustomerMachines([]); }}
                options={customerOptions}
                placeholder={t("copierTests.selectCustomer")}
                searchPlaceholder={t("common.search")}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("copierTests.engineer")} <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              value={formEngineerId}
              onChange={setFormEngineerId}
              options={engineerOptions}
              placeholder={t("copierTests.selectEngineer")}
              searchPlaceholder={t("common.search")}
            />
          </div>

          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("copierTests.blackCounter")} <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={blackCounter}
              onChange={(e) => setBlackCounter(e.target.value)}
              placeholder="1000"
              dir="ltr"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("copierTests.colorCounter")}
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={colorCounter}
              onChange={(e) => setColorCounter(e.target.value)}
              placeholder="0"
              dir="ltr"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("copierTests.optionalMachine")}
            </label>
            <SearchableSelect
              value={formMachineId}
              onChange={setFormMachineId}
              options={machineFormOptions}
              placeholder={t("copierTests.chooseMachine")}
              searchPlaceholder={t("common.search")}
            />
            {formCustomerId && customerMachines.length === 0 && allMachines.length > 0 && (
              <p className="text-xs text-gray-500">{t("copierTests.noCustomerMachinesHint")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("copierTests.testDate")}
            </label>
            <input
              type="datetime-local"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("copierTests.repairStatement")}
            </label>
            <textarea
              value={repairStatement}
              onChange={(e) => setRepairStatement(e.target.value)}
              rows={2}
              placeholder={t("copierTests.repairStatementPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("copierTests.spareParts")}
            </label>
            <input
              value={spareParts}
              onChange={(e) => setSpareParts(e.target.value)}
              placeholder={t("copierTests.sparePartsPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("copierTests.collectedAmount")}
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={collectedAmount}
              onChange={(e) => setCollectedAmount(e.target.value)}
              placeholder="0"
              dir="ltr"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("copierTests.collectionNote")}
            </label>
            <input
              value={collectionNote}
              onChange={(e) => setCollectionNote(e.target.value)}
              placeholder={t("copierTests.collectionNotePlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("copierTests.notes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t("copierTests.notesPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("copierTests.testImage")} <span className="text-xs text-gray-400">({t("common.optional")})</span>
            </label>
            {editing ? (
              <div className="flex items-center gap-3">
                {editing.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={editing.imageUrl}
                    alt={t("copierTests.testImage")}
                    className="h-20 w-28 rounded-lg border border-gray-200 object-cover"
                  />
                ) : (
                  <span className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-400">
                    {t("copierTests.noImage")}
                  </span>
                )}
                <p className="text-xs text-gray-500">{t("copierTests.editHintNoImage")}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-700 transition hover:bg-violet-100">
                  <ImagePlus size={16} className="shrink-0" />
                  {imageFile ? t("copierTests.changeImage") : t("copierTests.uploadImage")}
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    className="hidden"
                    onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
                  />
                </label>
                {previewUrl && (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt={t("copierTests.testImage")}
                      className="h-20 w-28 rounded-lg border border-gray-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearImage}
                      aria-label={t("common.delete")}
                      className="absolute -top-2 -end-2 rounded-full bg-red-600 p-1 text-white shadow transition hover:bg-red-700"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 pt-1 md:col-span-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              {t("common.cancel")}
            </button>
            <SubmitButton
              loading={saving}
              label={editing ? t("common.save") : t("copierTests.saveTest")}
              loadingLabel={editing ? t("common.saving") : t("copierTests.savingTest")}
              className="bg-violet-600 text-white hover:bg-violet-700"
            >
              <Camera size={16} />
            </SubmitButton>
          </div>
        </form>
      </FormModal>

      {/* ── details modal ────────────────────────────────────────────────── */}
      <FormModal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `${t("copierTests.viewTest")} — ${viewing.customer?.name ?? ""}` : ""}
        wide
      >
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Detail label={t("copierTests.date")} value={formatDate(viewing.testDate ?? viewing.createdAt)} />
              <Detail label={t("common.customer")} value={viewing.customer?.name || "—"} />
              <Detail label={t("copierTests.engineer")} value={viewing.engineer?.name || "—"} />
              <Detail label={t("copierTests.machine")} value={viewing.machine ? `${viewing.machine.serialNumber}${viewing.machine.model ? ` — ${viewing.machine.model}` : ""}` : "—"} ltr />
              <Detail label={t("copierTests.blackCounter")} value={formatNum(viewing.blackCounter ?? viewing.pageCount)} ltr />
              <Detail label={t("copierTests.colorCounter")} value={formatNum(viewing.colorCounter)} ltr />
              <Detail label={t("copierTests.pageCount")} value={formatNum(viewing.pageCount)} ltr />
              <Detail
                label={t("copierTests.collectedAmount")}
                value={viewing.collectedAmount != null ? fmtMoney(viewing.collectedAmount) : "—"}
                ltr
              />
            </div>

            {viewing.imageUrl && (
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500">{t("copierTests.testImage")}</p>
                <button
                  onClick={() => setLightboxUrl(viewing.imageUrl as string)}
                  className="overflow-hidden rounded-xl border-2 border-slate-200 transition hover:border-violet-500"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={viewing.imageUrl} alt={t("copierTests.testImage")} className="h-48 w-64 object-cover" />
                </button>
              </div>
            )}

            <TextBlock label={t("copierTests.repairStatement")} value={viewing.repairStatement} />
            <TextBlock label={t("copierTests.spareParts")} value={viewing.spareParts} />
            <TextBlock label={t("copierTests.collectionNote")} value={viewing.collectionNote} />
            <TextBlock label={t("copierTests.notes")} value={viewing.notes} />

            <div className="flex justify-end">
              <button
                onClick={() => setViewing(null)}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        )}
      </FormModal>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-h-[90vh] max-w-4xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt={t("copierTests.testImage")}
              className="max-h-[90vh] w-auto rounded-xl object-contain shadow-2xl"
            />
            <button
              onClick={() => setLightboxUrl(null)}
              aria-label={t("common.close")}
              className="absolute top-2 end-2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <span className="block text-xs text-gray-500">{label}</span>
      <span className={`mt-1 block font-medium text-slate-800 ${ltr ? "text-start" : ""}`} dir={ltr ? "ltr" : undefined}>
        {value}
      </span>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
      <p className="rounded-lg border border-gray-200 bg-white p-3 text-sm whitespace-pre-line text-slate-800">{value}</p>
    </div>
  );
}

/** ISO → value for <input type="datetime-local"> in the browser timezone. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayInput();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
