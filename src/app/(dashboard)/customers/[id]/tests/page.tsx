"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Camera, Plus, Trash2, X } from "lucide-react";

import { useI18n } from "@/i18n/context";
import { useToast, useConfirm } from "@/components/UIProvider";
import { usePermissions } from "@/components/PermissionsProvider";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";
import { apiErrorMessage } from "@/lib/api-client";

import SearchInput from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import DateRangeFilter from "@/components/DateRangeFilter";
import Pagination from "@/components/Pagination";
import SubmitButton from "@/components/SubmitButton";
import ExportButton from "@/components/ExportButton";
import RefreshButton from "@/components/RefreshButton";
import PrinterLoader from "@/components/PrinterLoader";

const PAGE_SIZE = 15;

/** Sentinel for "recorded without a machine" — see the machineId handling. */
const NO_MACHINE = "__none__";

interface TestRow {
  id: string;
  testDate: string | null;
  createdAt: string;
  engineer?: { id: string; name: string } | null;
  machine?: { id: string; serialNumber: string; model?: string | null } | null;
  pageCount: number;
  blackCounter: number | null;
  colorCounter: number | null;
  repairStatement?: string | null;
  spareParts?: string | null;
  collectedAmount: number | null;
  collectionNote?: string | null;
  notes?: string | null;
  imageUrl?: string | null;
}

interface ListResponse {
  rows: TestRow[];
  total: number;
  totalPages: number;
  summary?: { collectedTotal: number; blackTotal: number; colorTotal: number };
}

interface MachineOption {
  id: string;
  serialNumber: string;
  model?: string | null;
}
interface EngineerOption {
  id: string;
  name: string;
}

const todayInput = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default function CustomerTestsPage() {
  const { t, locale, dir } = useI18n();
  const params = useParams<{ id: string }>();
  const customerId = params?.id ?? "";
  const router = useRouter();
  const toast = useToast();
  const confirmAction = useConfirm();
  const { canAct } = usePermissions();

  // The same rule the API applies: a test is recorded from the tests page, from
  // the customer, or from the service request.
  const canWrite =
    canAct("copierTests", "add") || canAct("customers", "add") || canAct("serviceRequests", "add");

  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [rows, setRows] = useState<TestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({ collectedTotal: 0, blackTotal: 0, colorTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // filters
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [machineFilter, setMachineFilter] = useState("");
  const [engineerFilter, setEngineerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [imageFilter, setImageFilter] = useState("");
  const [collectedFilter, setCollectedFilter] = useState("");
  const [page, setPage] = useState(1);

  // add panel
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [engineerId, setEngineerId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [pageCount, setPageCount] = useState("");
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
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (customerId) sp.set("customerId", customerId);
    if (search) sp.set("q", search);
    if (machineFilter) sp.set("machineId", machineFilter);
    if (engineerFilter) sp.set("engineerId", engineerFilter);
    if (imageFilter) sp.set("image", imageFilter);
    if (collectedFilter) sp.set("collected", collectedFilter);
    if (dateFrom) sp.set("from", dateFrom);
    if (dateTo) sp.set("to", dateTo);
    sp.set("page", String(page));
    sp.set("pageSize", String(PAGE_SIZE));
    return sp.toString();
  }, [customerId, search, machineFilter, engineerFilter, imageFilter, collectedFilter, dateFrom, dateTo, page]);

  // Promise chain (no synchronous setState) so the effects below stay lint-clean.
  const load = useCallback(() => {
    if (!customerId) return;
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
          setLoadError((data as { error?: string } | null)?.error || t("copierTests.loadError"));
        }
        setLoading(false);
      })
      .catch(() => {
        setLoadError(t("copierTests.loadError"));
        setLoading(false);
      });
  }, [customerId, query, t]);

  const { refresh } = useAutoRefresh(load, ["customers", "sales", "settlements"]);

  useEffect(() => {
    load();
  }, [load]);

  // Customer + its machines, plus the engineer list for the form.
  useEffect(() => {
    if (!customerId) return;
    let alive = true;

    fetch(`/api/customers/${customerId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setCustomer({ id: data.id, name: data.name ?? "" });
        setMachines(
          (Array.isArray(data.machines) ? data.machines : []).map(
            (m: { id: string; serialNumber: string; model?: string | null }) => ({
              id: m.id,
              serialNumber: m.serialNumber,
              model: m.model ?? null,
            }),
          )
        );
        setEngineerId(data.engineerId ?? data.engineer?.id ?? "");
      })
      .catch(() => {
        if (alive) setNotFound(true);
      });

    fetch("/api/engineers")
      .then((res) => (res.ok ? res.json() : []))
      .then((list: EngineerOption[]) => {
        if (!alive) return;
        setEngineers(Array.isArray(list) ? list.filter((e) => (e as { isActive?: boolean }).isActive !== false) : []);
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, [customerId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const clearImage = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setImageFile(null);
    setPreviewUrl(null);
  };

  const handleImageChange = (file: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : null;
    setImageFile(file);
    setPreviewUrl(previewRef.current);
  };

  const resetForm = () => {
    setMachineId("");
    setPageCount("");
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
  };

  const cancelAdd = () => {
    setShowAdd(false);
    resetForm();
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");

    if (!engineerId) {
      setFormError(t("copierTests.engineerRequired"));
      return;
    }
    const black = blackCounter.trim() === "" ? null : Number(blackCounter);
    const color = colorCounter.trim() === "" ? null : Number(colorCounter);
    if (
      (black == null && color == null) ||
      (black != null && (!Number.isInteger(black) || black < 0)) ||
      (color != null && (!Number.isInteger(color) || color < 0)) ||
      (black === 0 && color === 0)
    ) {
      setFormError(t("copierTests.countersRequired"));
      return;
    }
    const count = Number(pageCount);
    const effectiveCount =
      pageCount.trim() !== "" && Number.isInteger(count) && count >= 0
        ? count
        : ((black ?? 0) > 0 ? (black as number) : (color as number));
    const amount = collectedAmount.trim() === "" ? null : Number(collectedAmount);
    if (amount != null && (!Number.isFinite(amount) || amount <= 0)) {
      setFormError(t("copierTests.amountInvalid"));
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("engineerId", engineerId);
      formData.append("pageCount", String(effectiveCount));
      formData.append("blackCounter", String(black ?? 0));
      if (color != null) formData.append("colorCounter", String(color));
      if (imageFile) formData.append("image", imageFile);
      if (repairStatement.trim()) formData.append("repairStatement", repairStatement.trim());
      if (spareParts.trim()) formData.append("spareParts", spareParts.trim());
      if (amount != null) formData.append("collectedAmount", String(amount));
      if (collectionNote.trim()) formData.append("collectionNote", collectionNote.trim());
      if (notes.trim()) formData.append("notes", notes.trim());
      if (testDate) formData.append("testDate", new Date(testDate).toISOString());
      if (machineId) formData.append("machineId", machineId);

      const res = await fetch(`/api/customers/${customerId}/tests`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(apiErrorMessage(data, t));
        return;
      }

      resetForm();
      setShowAdd(false);
      // Filters can hide the new row (a machine or date filter the new test does
      // not match), so clear them before refreshing — otherwise the user saves
      // and appears to get nothing.
      setMachineFilter("");
      setEngineerFilter("");
      setDateFrom("");
      setDateTo("");
      setImageFilter("");
      setCollectedFilter("");
      setSearchInput("");
      setSearch("");
      setPage(1);
      refresh();
      notifyDataChanged(["customers", "sales", "settlements"]);
      toast.success(
        data?.settlementId ? t("copierTests.testSavedWithSettlement") : t("copierTests.testSaved")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: TestRow) => {
    if (!(await confirmAction({ title: t("common.delete"), message: t("copierTests.deleteTestConfirm") })))
      return;
    const res = await fetch(`/api/tests/${row.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(apiErrorMessage(data, t));
      return;
    }
    refresh();
    notifyDataChanged(["customers", "sales", "settlements"]);
    toast.success(t("copierTests.testDeleted"));
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const loc = locale === "ar" ? "ar-EG" : "en-GB";
    return d.toLocaleDateString(loc);
  };

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const loc = locale === "ar" ? "ar-EG" : "en-GB";
    return `${d.toLocaleDateString(loc)} ${d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}`;
  };

  const formatNum = (value: number | null | undefined) =>
    value == null ? "—" : value.toLocaleString(locale === "ar" ? "ar-EG" : "en-US");

  const hasFilters =
    machineFilter !== "" || engineerFilter !== "" || dateFrom !== "" || dateTo !== "" || imageFilter !== "" || collectedFilter !== "" || search !== "";

  const clearFilters = () => {
    setMachineFilter("");
    setEngineerFilter("");
    setDateFrom("");
    setDateTo("");
    setImageFilter("");
    setCollectedFilter("");
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const machineOptions = useMemo(
    () => [
      ...machines.map((m) => ({
        value: m.id,
        label: `${m.serialNumber}${m.model ? ` — ${m.model}` : ""}`,
      })),
      // Tests can be recorded without a machine, so that is a real bucket.
      { value: NO_MACHINE, label: t("copierTests.noMachineFilter") },
    ],
    [machines, t]
  );

  const exportRows = () => ({
    headers: [
      t("copierTests.date"),
      t("copierTests.machine"),
      t("copierTests.engineer"),
      t("copierTests.blackCounter"),
      t("copierTests.colorCounter"),
      t("copierTests.repairStatement"),
      t("copierTests.spareParts"),
      t("copierTests.collectedAmount"),
      t("copierTests.collectionNote"),
      t("copierTests.notes"),
    ],
    rows: rows.map((r) => [
      formatDate(r.testDate ?? r.createdAt),
      r.machine?.serialNumber ?? "",
      r.engineer?.name ?? "",
      r.blackCounter != null ? String(r.blackCounter) : "",
      r.colorCounter != null ? String(r.colorCounter) : "",
      r.repairStatement ?? "",
      r.spareParts ?? "",
      r.collectedAmount != null ? String(r.collectedAmount) : "",
      r.collectionNote ?? "",
      r.notes ?? "",
    ]),
  });

  if (notFound) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{t("common.notFound")}</p>
        <Link
          href="/customers"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          {t("customers.title")}
        </Link>
      </div>
    );
  }

  return (
    <div dir={dir} className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/customers")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition hover:bg-gray-50"
            aria-label={t("common.back")}
          >
            <ArrowRight size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Camera size={18} className="shrink-0 text-violet-600" />
              <span className="truncate">{customer?.name ?? t("copierTests.title")}</span>
            </h1>
            <p className="text-xs text-gray-500">{t("copierTests.customerTestsSubtitle")}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton onRefresh={refresh} refreshing={false} />
          <ExportButton filename={`tests-${customerId}`} getExport={exportRows} />
          {canWrite && (
            <button
              type="button"
              onClick={() => (showAdd ? cancelAdd() : setShowAdd(true))}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition ${
                showAdd ? "bg-gray-500 hover:bg-gray-600" : "bg-violet-600 hover:bg-violet-700"
              }`}
            >
              {showAdd ? <X size={15} /> : <Plus size={15} />}
              {showAdd ? t("common.cancel") : t("copierTests.addTest")}
            </button>
          )}
        </div>
      </div>

      {/* Inline add panel — a section in the page, not a popup */}
      {showAdd && canWrite && (
        <form
          onSubmit={handleSave}
          className="rounded-xl border border-violet-200 bg-violet-50/50 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("copierTests.engineer")} <span className="text-red-500">*</span>
              </label>
              <select
                value={engineerId}
                onChange={(e) => setEngineerId(e.target.value)}
                className={inputClass}
              >
                <option value="">{t("copierTests.selectEngineer")}</option>
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("copierTests.optionalMachine")}
              </label>
              <select
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className={inputClass}
              >
                <option value="">{t("copierTests.chooseMachine")}</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.serialNumber}
                    {m.model ? ` — ${m.model}` : ""}
                  </option>
                ))}
              </select>
              {machines.length === 0 && (
                <p className="mt-1 text-[11px] text-gray-500">
                  {t("copierTests.noCustomerMachinesHint")}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("copierTests.testDate")}
              </label>
              <input
                type="datetime-local"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("copierTests.blackCounter")} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={blackCounter}
                onChange={(e) => setBlackCounter(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("copierTests.colorCounter")}
              </label>
              <input
                type="number"
                min={0}
                value={colorCounter}
                onChange={(e) => setColorCounter(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("copierTests.pageCount")}
              </label>
              <input
                type="number"
                min={0}
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("copierTests.repairStatement")}
              </label>
              <textarea
                value={repairStatement}
                onChange={(e) => setRepairStatement(e.target.value)}
                rows={2}
                placeholder={t("copierTests.repairStatementPlaceholder")}
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("copierTests.spareParts")}
              </label>
              <textarea
                value={spareParts}
                onChange={(e) => setSpareParts(e.target.value)}
                rows={2}
                placeholder={t("copierTests.sparePartsPlaceholder")}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("copierTests.collectedAmount")}
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={collectedAmount}
                onChange={(e) => setCollectedAmount(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("copierTests.collectionNote")}
              </label>
              <input
                value={collectionNote}
                onChange={(e) => setCollectionNote(e.target.value)}
                placeholder={t("copierTests.collectionNotePlaceholder")}
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("copierTests.notes")}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("copierTests.testImage")} <span className="text-xs text-gray-400">
                  ({t("common.optional")})
                </span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
                  className="text-xs"
                />
                {previewUrl && (
                  <button
                    type="button"
                    onClick={clearImage}
                    className="rounded-lg border border-gray-300 p-1 text-gray-500 hover:bg-gray-50"
                    aria-label={t("common.remove")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {previewUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewUrl}
                  alt={t("copierTests.testImage")}
                  className="mt-2 h-24 w-32 rounded-lg object-cover"
                />
              )}
            </div>
          </div>

          {formError && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          {/* One save button at the end, rather than a submit per field. */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelAdd}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              {t("common.cancel")}
            </button>
            <SubmitButton
              loading={saving}
              label={t("copierTests.saveTest")}
              loadingLabel={t("copierTests.savingTest")}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            />
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder={t("copierTests.searchPlaceholder")}
        />
        <FilterSelect
          value={machineFilter}
          onChange={(v) => {
            setMachineFilter(v);
            setPage(1);
          }}
          options={machineOptions}
          allLabel={t("copierTests.allMachines")}
        />
        <FilterSelect
          value={engineerFilter}
          onChange={(v) => {
            setEngineerFilter(v);
            setPage(1);
          }}
          options={engineers.map((e) => ({ value: e.id, label: e.name }))}
          allLabel={t("copierTests.allEngineers")}
        />
        <DateRangeFilter
          from={dateFrom}
          to={dateTo}
          onFromChange={(v) => {
            setDateFrom(v);
            setPage(1);
          }}
          onToChange={(v) => {
            setDateTo(v);
            setPage(1);
          }}
        />
        <FilterSelect
          value={imageFilter}
          onChange={(v) => {
            setImageFilter(v);
            setPage(1);
          }}
          options={[
            { value: "with", label: t("copierTests.withImage") },
            { value: "without", label: t("copierTests.withoutImage") },
          ]}
          allLabel={t("copierTests.imageFilter")}
        />
        <FilterSelect
          value={collectedFilter}
          onChange={(v) => {
            setCollectedFilter(v);
            setPage(1);
          }}
          options={[
            { value: "with", label: t("copierTests.withCollected") },
            { value: "without", label: t("copierTests.withoutCollected") },
          ]}
          allLabel={t("copierTests.collectedFilter")}
        />
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600 transition hover:bg-gray-50"
          >
            {t("copierTests.clearFilters")}
          </button>
        )}
      </div>

      {/* Summary */}
      {total > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
            <p className="text-[11px] text-gray-500">{t("copierTests.testsCount")}</p>
            <p className="text-sm font-bold text-gray-900">{formatNum(total)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
            <p className="text-[11px] text-gray-500">{t("copierTests.blackTotal")}</p>
            <p className="text-sm font-bold text-gray-900">{formatNum(summary.blackTotal)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
            <p className="text-[11px] text-gray-500">{t("copierTests.colorTotal")}</p>
            <p className="text-sm font-bold text-gray-900">{formatNum(summary.colorTotal)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
            <p className="text-[11px] text-gray-500">{t("copierTests.collectedTotal")}</p>
            <p className="text-sm font-bold text-emerald-700">{formatNum(summary.collectedTotal)}</p>
          </div>
        </div>
      )}

      {loadError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <PrinterLoader label={t("common.loading")} />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
          <p className="text-sm text-gray-500">
            {hasFilters ? t("copierTests.noResults") : t("copierTests.noTestsYet")}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] text-start">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-start text-xs font-semibold text-gray-600">
                  {t("copierTests.date")}
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-gray-600">
                  {t("copierTests.machine")}
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-gray-600">
                  {t("copierTests.engineer")}
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-gray-600">
                  {t("copierTests.blackCounter")}
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-gray-600">
                  {t("copierTests.colorCounter")}
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-gray-600">
                  {t("copierTests.repairStatement")}
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-gray-600">
                  {t("copierTests.spareParts")}
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-gray-600">
                  {t("copierTests.collectedAmount")}
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-gray-600">
                  {t("copierTests.image")}
                </th>
                <th className="px-3 py-2 text-start text-xs font-semibold text-gray-600">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm whitespace-nowrap text-gray-700">
                    {formatDate(row.testDate ?? row.createdAt)}
                    <span className="block text-[11px] text-gray-400">
                      {formatDateTime(row.createdAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap text-gray-700" dir="ltr">
                    {row.machine?.serialNumber ?? "—"}
                    {row.machine?.model && (
                      <span className="block text-[11px] text-gray-400">{row.machine.model}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap text-gray-700">
                    {row.engineer?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-sm font-semibold text-gray-900">
                    {formatNum(row.blackCounter ?? row.pageCount)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-700">{formatNum(row.colorCounter)}</td>
                  <td className="max-w-[220px] px-3 py-2 text-sm text-gray-700">
                    <p className="truncate" title={row.repairStatement ?? ""}>
                      {row.repairStatement || "—"}
                    </p>
                    {row.notes && (
                      <p className="truncate text-[11px] text-gray-400" title={row.notes}>
                        {row.notes}
                      </p>
                    )}
                  </td>
                  <td className="max-w-[180px] px-3 py-2 text-sm text-gray-700">
                    <p className="truncate" title={row.spareParts ?? ""}>
                      {row.spareParts || "—"}
                    </p>
                    {row.collectionNote && (
                      <p className="truncate text-[11px] text-gray-400" title={row.collectionNote}>
                        {row.collectionNote}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm font-semibold whitespace-nowrap text-emerald-700">
                    {formatNum(row.collectedAmount)}
                  </td>
                  <td className="px-3 py-2">
                    {row.imageUrl ? (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(row.imageUrl as string)}
                        className="overflow-hidden rounded-lg border border-gray-200"
                        aria-label={t("copierTests.image")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={row.imageUrl}
                          alt={t("copierTests.testImage")}
                          className="h-10 w-14 object-cover transition hover:opacity-90"
                        />
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        className="rounded-lg border border-red-200 p-1.5 text-red-600 transition hover:bg-red-50"
                        aria-label={t("common.delete")}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
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

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt={t("copierTests.testImage")}
            className="max-h-full max-w-full rounded-xl"
          />
        </div>
      )}
    </div>
  );
}
