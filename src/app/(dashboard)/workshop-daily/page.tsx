"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowDownCircle, ArrowUpCircle, Eye, Lock, Pencil, Plus, Tags, Trash2, Wallet, X } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { apiErrorMessage } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import Pagination from "@/components/Pagination";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import PrinterLoader from "@/components/PrinterLoader";
import { useConfirm, useToast } from "@/components/UIProvider";
import { usePermissions } from "@/components/PermissionsProvider";
import SelectWithAdd from "@/components/SelectWithAdd";
import { formatEgyptDateISO } from "@/lib/datetime";

interface Tx {
  id: string;
  direction: "IN" | "OUT";
  amount: number;
  reason: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  createdBy: string;
  category?: { id: string; name: string } | null;
  revenueType?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  createdByName?: string | null;
  confirmedByName?: string | null;
  rejectReason?: string | null;
  createdAt: string;
}

interface Totals {
  inTotal: number;
  outTotal: number;
  remaining: number;
  confirmedIn: number;
  confirmedOut: number;
  pendingCount: number;
  pendingAmount: number;
}

interface Book {
  id: string;
  bookDate: string;
  status: string;
  openedByName?: string | null;
  isOldDay: boolean;
  totals: Totals;
  transactions: Tx[];
}

/** A day in the history list: its totals, and whether it is still open. */
interface DayRow {
  id: string;
  bookDate: string;
  status: string;
  closedAt: string | null;
  handoverAmount: number | null;
  handoverTo: string | null;
  totals: Totals;
}

/** A day opened for reading: the entries booked on it. */
interface DayDetail extends DayRow {
  transactions: Tx[];
}

interface Category {
  id: string;
  name: string;
}

interface DailyData {
  company: { id: string; name: string };
  book: Book | null;
  days: DayRow[];
  daysTotal: number;
  /** 1 = the week of today, 2 = the week before it, and so on. */
  weekIndex: number;
  weeksTotal: number;
  /** The Saturday the week opens with, and the Thursday it closes with. */
  weekStart: string;
  weekEnd: string;
  /** Every day that is still open, including the one the page works on. */
  openDays: DayRow[];
  categories: Category[];
}

const FINANCE_ROLES = ["ACCOUNTANT", "GENERAL_MANAGER", "COMPANY_MANAGER"];

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  CONFIRMED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const PAGE_SIZE = 10;
/** `YYYY-MM-DD` in Egypt time — the shape an `<input type="date">` uses. */
const toDateKey = (value: string | Date) => formatEgyptDateISO(value);

export default function WorkshopDailyPage() {
  const { t, locale, dir } = useI18n();
  const { data: session } = useSession();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const { canAct } = usePermissions();

  // The server refuses what the role does not hold, so the buttons that ask
  // for it are only shown to the roles that may use them.
  const canAdd = canAct("workshopDaily", "add");
  const canEdit = canAct("workshopDaily", "edit");
  const canDelete = canAct("workshopDaily", "delete");
  const canClose = canAct("workshopDaily", "close");
  const canManageCategories = canAdd || canEdit || canDelete;

  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const currentUserId = session?.user?.id ?? "";
  const isFinance = FINANCE_ROLES.includes(role);

  const todayKey = toDateKey(new Date());

  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearchInput] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState<Tx | null>(null);
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [revenueType, setRevenueType] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [txDate, setTxDate] = useState(todayKey);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<Tx | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const [showClose, setShowClose] = useState(false);
  const [closeBookId, setCloseBookId] = useState("");
  const [closeTotalsOverride, setCloseTotalsOverride] = useState<Totals | null>(null);
  const [handoverTo, setHandoverTo] = useState("الخزينة الرئيسية");
  const [handoverNote, setHandoverNote] = useState("");
  const [closeError, setCloseError] = useState("");
  const [closing, setClosing] = useState(false);

  const [showCategories, setShowCategories] = useState(false);
  const [catName, setCatName] = useState("");
  const [catError, setCatError] = useState("");
  const [catSaving, setCatSaving] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  const [dayOpen, setDayOpen] = useState(false);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState("");

  // The day log is paginated by week on the server, so the week it is on has
  // to survive a refresh of the open book.
  const weekIndexRef = useRef(1);

  const fetchDaily = async () => {
    try {
      const res = await fetch(`/api/workshop-daily?weekIndex=${weekIndexRef.current}`);
      const json = await res.json().catch(() => null);
      if (res.ok) setData(json);
    } finally {
      setLoading(false);
    }
  };

  const { refresh } = useAutoRefresh(fetchDaily, ["workshop", "expenses"]);

  useEffect(() => {
    fetchDaily();
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/customers")
      .then((r) => r.json())
      .then((customersData) => {
        if (!alive) return;
        setCustomers(Array.isArray(customersData) ? customersData.map((c: { id: string; name?: string }) => ({ id: c.id, name: c.name ?? "" })) : []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const transactions = data?.book?.transactions ?? [];
  const filtered = transactions.filter(
    (tx) =>
      (!directionFilter || tx.direction === directionFilter) &&
      (!statusFilter || tx.status === statusFilter) &&
      (matchesQuery(tx.reason, search) ||
        matchesQuery(tx.category?.name, search) ||
        matchesQuery(tx.createdByName, search)),
  );
  const hasActiveFilters = search !== "" || directionFilter !== "" || statusFilter !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const categories = data?.categories ?? [];
  const days = data?.days ?? [];
  const daysTotal = data?.daysTotal ?? 0;
  const openDays = data?.openDays ?? [];
  const weeksTotal = Math.max(1, data?.weeksTotal ?? 1);
  const safeWeekIndex = Math.min(data?.weekIndex ?? 1, weeksTotal);
  // The days left open behind the day the page works on: the "you forgot to
  // close the previous day" case.
  const leftOpenDays = openDays.filter((d) => d.id !== data?.book?.id);

  const fmtMoney = (n: number) => `${n.toLocaleString(locale === "ar" ? "ar-EG" : "en-US")} ج.م`;
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB");
  /**
   * The name of the day — "الاثنين". The timezone is fixed so the server and
   * the browser name the same day.
   */
  const fmtDayName = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", {
      weekday: "long",
      timeZone: "Africa/Cairo",
    });
  /** The day with its name next to it — "الاثنين 05/10/2026". */
  const fmtDayLabel = (iso: string) => `${fmtDayName(iso)} ${fmtDate(iso)}`;

  const canModify = (tx: Tx) => tx.status === "PENDING" && (isFinance || tx.createdBy === currentUserId);
  const openAddForm = () => {
    setEditingTx(null);
    setDirection("OUT");
    setAmount("");
    setReason("");
    setRevenueType("");
    setCustomerId("");
    setCategoryId("");
    setTxDate(todayKey);
    setFormError("");
    setShowForm(true);
  };

  const openEditForm = (tx: Tx) => {
    setEditingTx(tx);
    setDirection(tx.direction);
    setAmount(String(tx.amount));
    setReason(tx.reason);
    setRevenueType(tx.revenueType ?? "");
    setCustomerId(tx.customerId ?? "");
    setCategoryId(tx.category?.id ?? "");
    setTxDate(todayKey);
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTx(null);
  };

  const fetchDay = async (bookId: string) => {
    setDayLoading(true);
    setDayError("");
    try {
      const res = await fetch(`/api/workshop-daily/books/${bookId}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setDayError(apiErrorMessage(json, t));
        return;
      }
      setDayDetail(json);
    } catch {
      setDayError(t("common.error"));
    } finally {
      setDayLoading(false);
    }
  };

  const openDayDetails = (bookId: string) => {
    setDayDetail(null);
    setDayError("");
    setDayOpen(true);
    void fetchDay(bookId);
  };

  const reloadDay = () => {
    if (dayDetail) void fetchDay(dayDetail.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setFormError(t("workshopDaily.amount") + "؟");
      return;
    }
    if (!reason.trim()) {
      setFormError(t("workshopDaily.reasonRequired"));
      return;
    }
    if (direction === "IN" && !revenueType) {
      setFormError(t("workshopDaily.revenueTypeRequired"));
      return;
    }
    if (direction === "IN" && revenueType === "CASH_COLLECTION" && !customerId) {
      setFormError(t("workshopDaily.customerRequired"));
      return;
    }
    const editing = editingTx;
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/workshop-daily/${editing.id}` : "/api/workshop-daily", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          amount: value,
          reason: reason.trim(),
          ...(direction === "IN" ? { revenueType } : { categoryId }),
          ...(revenueType === "CASH_COLLECTION" ? { customerId } : {}),
          ...(editing ? {} : { bookDate: txDate }),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(apiErrorMessage(json, t));
        return;
      }
      closeForm();
      refresh();
      reloadDay();
      notifyDataChanged(["workshop"]);
      toastSuccess(t("common.success"));
      if (!editing && json?.reopened) {
        toastInfo(t("workshopDaily.dayReopened"));
      } else if (!editing && json?.bookDate && toDateKey(json.bookDate) !== todayKey) {
        toastInfo(t("workshopDaily.addedBackdatedNext"));
      } else {
        toastInfo(t(editing ? "workshopDaily.editedNext" : "workshopDaily.addedNext"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tx: Tx) => {
    if (!(await confirmAction({ title: t("common.delete"), message: t("workshopDaily.deletePrompt") }))) return;
    try {
      const res = await fetch(`/api/workshop-daily/${tx.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toastError(apiErrorMessage(json, t));
        return;
      }
      refresh();
      reloadDay();
      notifyDataChanged(["workshop"]);
      toastSuccess(t("common.success"));
    } catch {
      toastError(t("common.error"));
    }
  };

  const handleConfirm = async (tx: Tx) => {
    if (!(await confirmAction({ message: t("workshopDaily.confirmPrompt") }))) return;
    try {
      const res = await fetch(`/api/workshop-daily/${tx.id}/confirm`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toastError(apiErrorMessage(json, t));
        return;
      }
      refresh();
      reloadDay();
      notifyDataChanged(["workshop", "expenses"]);
      toastSuccess(t("common.success"));
      toastInfo(t(json.postedToBooks ? "workshopDaily.confirmedOutNext" : "workshopDaily.confirmedInNext"));
    } catch {
      toastError(t("common.error"));
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setRejectError("");
    if (!rejectReason.trim()) {
      setRejectError(t("workshopDaily.rejectReason") + "؟");
      return;
    }
    setRejecting(true);
    try {
      const res = await fetch(`/api/workshop-daily/${rejectTarget.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectReason: rejectReason.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setRejectError(apiErrorMessage(json, t));
        return;
      }
      setRejectTarget(null);
      setRejectReason("");
      refresh();
      reloadDay();
      notifyDataChanged(["workshop"]);
      toastSuccess(t("common.success"));
      toastInfo(t("workshopDaily.rejectedNext"));
    } finally {
      setRejecting(false);
    }
  };

  /**
   * Opens the handover form for one day. The totals of that day are passed in
   * so the form shows the numbers of the day being closed, not the numbers of
   * the day the page happens to be working on.
   */
  const openCloseForm = (bookId = "", bookTotals: Totals | null = null) => {
    setCloseBookId(bookId);
    setCloseTotalsOverride(bookTotals);
    setCloseError("");
    setShowClose(true);
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloseError("");
    if (!handoverTo.trim()) {
      setCloseError(t("workshopDaily.handoverTo") + "؟");
      return;
    }
    setClosing(true);
    try {
      const res = await fetch("/api/workshop-daily/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handoverTo: handoverTo.trim(),
          handoverNote: handoverNote.trim() || undefined,
          ...(closeBookId ? { bookId: closeBookId } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = apiErrorMessage(json, t);
        setCloseError(msg);
        if (json?.code === "PENDING_EXIST") toastInfo(t("workshopDaily.closeBlockedPending"));
        return;
      }
      setShowClose(false);
      setCloseBookId("");
      setCloseTotalsOverride(null);
      setHandoverNote("");
      refresh();
      reloadDay();
      notifyDataChanged(["workshop"]);
      toastSuccess(t("common.success"));
      toastInfo(t("workshopDaily.closedNext"));
    } finally {
      setClosing(false);
    }
  };

  // ── التصنيفات ────────────────────────────────────────────────────────────
  const handleCategoryCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError("");
    const name = catName.trim();
    if (!name) {
      setCatError(t("errors.CATEGORY_NAME_REQUIRED"));
      return;
    }
    setCatSaving(true);
    try {
      const res = await fetch("/api/workshop-daily/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setCatError(apiErrorMessage(json, t));
        return;
      }
      setCatName("");
      refresh();
      notifyDataChanged(["expenses"]);
      toastSuccess(t("common.success"));
    } finally {
      setCatSaving(false);
    }
  };

  const handleCategoryRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat) return;
    setCatError("");
    const name = editingCat.name.trim();
    if (!name) {
      setCatError(t("errors.CATEGORY_NAME_REQUIRED"));
      return;
    }
    setCatSaving(true);
    try {
      const res = await fetch(`/api/workshop-daily/categories/${editingCat.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setCatError(apiErrorMessage(json, t));
        return;
      }
      setEditingCat(null);
      refresh();
      notifyDataChanged(["expenses"]);
      toastSuccess(t("common.success"));
    } finally {
      setCatSaving(false);
    }
  };

  const handleCategoryDelete = async (category: Category) => {
    if (!(await confirmAction({ message: t("workshopDaily.deleteCategoryConfirm") }))) return;
    try {
      const res = await fetch(`/api/workshop-daily/categories/${category.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toastError(apiErrorMessage(json, t));
        return;
      }
      refresh();
      notifyDataChanged(["expenses"]);
      toastSuccess(t("common.success"));
    } catch {
      toastError(t("common.error"));
    }
  };

  const goToWeek = (next: number) => {
    weekIndexRef.current = Math.max(1, next);
    fetchDaily();
  };

  const totals = data?.book?.totals;
  const closeTotals = closeTotalsOverride ?? totals;

  const renderTxActions = (tx: Tx) => {
    const showConfirm = isFinance && tx.status === "PENDING";
    const showEdit = canEdit && canModify(tx);
    const showDelete = canDelete && canModify(tx);
    if (!showConfirm && !showEdit && !showDelete) return <span className="text-xs text-gray-400">—</span>;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {showConfirm && (
          <>
            <button onClick={() => handleConfirm(tx)} className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100">
              {t("workshopDaily.confirm")}
            </button>
            <button onClick={() => { setRejectTarget(tx); setRejectReason(""); setRejectError(""); }} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100">
              {t("workshopDaily.reject")}
            </button>
          </>
        )}
        {showEdit && (
          <button onClick={() => openEditForm(tx)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600" title={t("common.edit")} aria-label={t("common.edit")}>
            <Pencil size={16} className="shrink-0" />
          </button>
        )}
        {showDelete && (
          <button onClick={() => handleDelete(tx)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600" title={t("common.delete")} aria-label={t("common.delete")}>
            <Trash2 size={16} className="shrink-0" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div dir={dir} className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("workshopDaily.title")}</h1>
          <p className="text-sm text-gray-500">{t("workshopDaily.subtitle")}</p>
        </div>
        <div className="ms-auto flex flex-wrap gap-2">
          {canManageCategories && (
            <button
              onClick={() => { setCatError(""); setShowCategories(true); }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Tags size={16} className="shrink-0" />{t("workshopDaily.manageCategories")}
            </button>
          )}
          {canAdd && (
            <button
              onClick={openAddForm}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <Plus size={16} className="shrink-0" />{t("workshopDaily.addTransaction")}
            </button>
          )}
          {canClose && (
            <button
              onClick={() => openCloseForm(data?.book?.id ?? "", data?.book?.totals ?? null)}
              disabled={!data?.book}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
            >
              <Lock size={16} className="shrink-0" />{t("workshopDaily.closeDay")}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <PrinterLoader size="md" label={t("common.loading")} />
        </div>
      ) : (
        <>
          {data?.book?.isOldDay && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              <X size={16} className="shrink-0" />
              <span>
                {t("workshopDaily.oldDayWarning")} ({data.book ? fmtDayLabel(data.book.bookDate) : ""})
              </span>
              {canClose && (
                <button
                  onClick={() => openCloseForm(data.book!.id, data.book!.totals)}
                  className="ms-auto inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  <Lock size={14} className="shrink-0" />{t("workshopDaily.closeThisDay")}
                </button>
              )}
            </div>
          )}
          {!data?.book && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
              {t("workshopDaily.noOpenDay")}
            </div>
          )}

          {/* ── أيام مفتوحة خلف اليوم الحالي: أقفلها من هنا ───────────────── */}
          {leftOpenDays.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-red-800">
                <Lock size={16} className="shrink-0" />{t("workshopDaily.leftOpenDays")}
              </p>
              <ul className="mt-2 space-y-2">
                {leftOpenDays.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm text-red-700">
                    <span className="font-semibold">{fmtDayLabel(d.bookDate)}</span>
                    <span className="text-xs text-red-600">
                      {t("workshopDaily.cashboxBalance")}: <span dir="ltr">{fmtMoney(d.totals.remaining)}</span>
                    </span>
                    {canClose && (
                      <button
                        onClick={() => openCloseForm(d.id, d.totals)}
                        className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                      >
                        <Lock size={14} className="shrink-0" />{t("workshopDaily.closeThisDay")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Wallet size={14} className="shrink-0" />{t("workshopDaily.cashboxBalance")}</p>
              <p className="mt-1 text-2xl font-bold text-emerald-800" dir="ltr">{totals ? fmtMoney(totals.remaining) : "—"}</p>
              <p className="mt-1 text-xs text-emerald-600">{data?.book ? `${t("workshopDaily.openDay")}: ${fmtDayLabel(data.book.bookDate)}` : t("workshopDaily.noOpenDay")}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500"><ArrowUpCircle size={14} className="shrink-0 text-green-600" />{t("workshopDaily.totalIn")}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900" dir="ltr">{totals ? fmtMoney(totals.inTotal) : "—"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500"><ArrowDownCircle size={14} className="shrink-0 text-red-600" />{t("workshopDaily.totalOut")}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900" dir="ltr">{totals ? fmtMoney(totals.outTotal) : "—"}</p>
            </div>
            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-xs font-medium text-yellow-700">{t("workshopDaily.pendingReview")}</p>
              <p className="mt-1 text-2xl font-bold text-yellow-800" dir="ltr">{totals ? fmtMoney(totals.pendingAmount) : "—"}</p>
              <p className="mt-1 text-xs text-yellow-600">{totals ? `${totals.pendingCount}` : "—"}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
              <div className="w-full md:w-80 md:flex-none">
                <SearchInput value={search} onChange={(v) => { setSearchInput(v); setPage(1); }} placeholder={t("workshopDaily.reason")} />
              </div>
              <FilterSelect
                value={directionFilter}
                onChange={(v) => { setDirectionFilter(v); setPage(1); }}
                options={[
                  { value: "IN", label: t("workshopDaily.in") },
                  { value: "OUT", label: t("workshopDaily.out") },
                ]}
                allLabel={`${t("workshopDaily.direction")} — ${t("common.all")}`}
                className="md:w-40"
              />
              <FilterSelect
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1); }}
                options={[
                  { value: "PENDING", label: t("workshopDaily.pending") },
                  { value: "CONFIRMED", label: t("workshopDaily.confirmed") },
                  { value: "REJECTED", label: t("workshopDaily.rejected") },
                ]}
                allLabel={`${t("workshopDaily.status")} — ${t("common.all")}`}
                className="md:w-44"
              />
              {hasActiveFilters && (
                <button onClick={() => { setSearchInput(""); setDirectionFilter(""); setStatusFilter(""); setPage(1); }} className="text-sm font-medium text-blue-600 hover:underline">
                  {t("common.resetFilters")}
                </button>
              )}
              <div className="ms-auto">
                <ExportButton
                  filename={t("workshopDaily.exportFilename")}
                  disabled={filtered.length === 0}
                  getExport={() => ({
                    headers: [t("workshopDaily.time"), t("workshopDaily.direction"), t("workshopDaily.category"), t("workshopDaily.reason"), t("workshopDaily.amount"), t("workshopDaily.status"), t("workshopDaily.createdBy")],
                    rows: filtered.map((tx) => [
                      fmtTime(tx.createdAt),
                      tx.direction === "IN" ? t("workshopDaily.in") : t("workshopDaily.out"),
                      tx.category?.name || t("workshopDaily.noCategory"),
                      tx.reason,
                      String(tx.amount),
                      tx.status === "PENDING" ? t("workshopDaily.pending") : tx.status === "CONFIRMED" ? t("workshopDaily.confirmed") : t("workshopDaily.rejected"),
                      tx.createdByName || "",
                    ]),
                  })}
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">{t("common.noData")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("workshopDaily.time")}</th>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("workshopDaily.direction")}</th>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("workshopDaily.category")}</th>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("workshopDaily.reason")}</th>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("workshopDaily.amount")}</th>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("workshopDaily.status")}</th>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("workshopDaily.createdBy")}</th>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paged.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm whitespace-nowrap text-slate-600">{fmtTime(tx.createdAt)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${tx.direction === "IN" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {tx.direction === "IN" ? <ArrowUpCircle size={12} className="shrink-0" /> : <ArrowDownCircle size={12} className="shrink-0" />}
                            {tx.direction === "IN" ? t("workshopDaily.in") : t("workshopDaily.out")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="font-medium text-slate-700">{tx.category?.name || t("workshopDaily.noCategory")}</span>
                          {tx.direction === "IN" && tx.revenueType && (
                            <span className={`ms-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${
                              tx.revenueType === "SERVICE_REVENUE" ? "bg-blue-50 text-blue-700" :
                              tx.revenueType === "CASH_COLLECTION" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"
                            }`}>
                              {tx.revenueType === "SERVICE_REVENUE" ? t("workshopDaily.serviceRevenue") :
                               tx.revenueType === "CASH_COLLECTION" ? t("workshopDaily.cashCollection") : t("workshopDaily.otherIncome")}
                            </span>
                          )}
                          {tx.direction === "IN" && tx.customerName && (
                            <span className="mt-0.5 block text-xs text-slate-500">👤 {tx.customerName}</span>
                          )}
                        </td>
                        <td className="max-w-[260px] truncate px-4 py-3 text-sm text-slate-800" title={tx.rejectReason || tx.reason}>
                          {tx.reason}
                          {tx.status === "REJECTED" && tx.rejectReason && (
                            <span className="block truncate text-xs text-red-500">{tx.rejectReason}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold whitespace-nowrap text-slate-900"><span dir="ltr">{fmtMoney(tx.amount)}</span></td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${STATUS_STYLES[tx.status]}`}>
                            {tx.status === "PENDING" ? t("workshopDaily.pending") : tx.status === "CONFIRMED" ? t("workshopDaily.confirmed") : t("workshopDaily.rejected")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{tx.createdByName || "—"}</td>
                        <td className="px-4 py-3">{renderTxActions(tx)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
          </div>

          {/* ── سجل الأيام: باجينيشن بالأسبوع (السبت → الخميس) ─────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">{t("workshopDaily.daysHistory")}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{daysTotal}</span>
              <span className="ms-auto flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                  {t("workshopDaily.week")}: {data?.weekStart ? fmtDate(data.weekStart) : ""} — {data?.weekEnd ? fmtDate(data.weekEnd) : ""}
                </span>
                {safeWeekIndex > 1 && (
                  <button
                    onClick={() => goToWeek(1)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {t("workshopDaily.thisWeek")}
                  </button>
                )}
              </span>
            </div>
            {days.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">{t("workshopDaily.noDays")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.openDay")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.status")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.totalIn")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.totalOut")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.handoverAmount")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.handoverTo")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {days.map((b) => (
                      <tr
                        key={b.id}
                        onClick={() => openDayDetails(b.id)}
                        className="cursor-pointer hover:bg-blue-50/60"
                      >
                        <td className="px-4 py-2 text-sm whitespace-nowrap font-medium text-slate-700">
                          <span className="font-semibold text-slate-800">{fmtDayName(b.bookDate)}</span>{" "}
                          <span className="text-slate-500">{fmtDate(b.bookDate)}</span>
                        </td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${b.status === "OPEN" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                            {b.status === "OPEN" ? t("workshopDaily.openBadge") : t("workshopDaily.closedBadge")}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm font-semibold text-green-700"><span dir="ltr">{fmtMoney(b.totals.inTotal)}</span></td>
                        <td className="px-4 py-2 text-sm font-semibold text-red-700"><span dir="ltr">{fmtMoney(b.totals.outTotal)}</span></td>
                        <td className="px-4 py-2 text-sm font-bold text-slate-900"><span dir="ltr">{b.handoverAmount != null ? fmtMoney(b.handoverAmount) : "—"}</span></td>
                        <td className="px-4 py-2 text-sm text-slate-600">{b.handoverTo || "—"}</td>
                        <td className="px-4 py-2 text-sm">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700">
                              <Eye size={14} className="shrink-0" />{t("workshopDaily.viewDay")}
                            </span>
                            {b.status === "OPEN" && canClose && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCloseForm(b.id, b.totals);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                              >
                                <Lock size={14} className="shrink-0" />{t("workshopDaily.closeThisDay")}
                              </button>
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
              currentPage={safeWeekIndex}
              totalPages={weeksTotal}
              onPageChange={goToWeek}
            />
          </div>
        </>
      )}

      {/* ── إضافة / تعديل حركة ─────────────────────────────────────────────── */}
      <FormModal open={showForm} onClose={closeForm} title={editingTx ? t("workshopDaily.editTransaction") : t("workshopDaily.addTransaction")}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {(["OUT", "IN"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold transition ${direction === d
                  ? d === "OUT"
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-green-500 bg-green-50 text-green-700"
                  : "border-gray-300 text-gray-500 hover:bg-gray-50"}`}
              >
                {d === "OUT" ? <ArrowDownCircle size={16} className="shrink-0" /> : <ArrowUpCircle size={16} className="shrink-0" />}
                {d === "OUT" ? t("workshopDaily.out") : t("workshopDaily.in")}
              </button>
            ))}
          </div>
          {!editingTx && (
            <div className="space-y-1.5">
              <label className="mb-1 block text-sm font-medium">{t("workshopDaily.transactionDate")}</label>
              <input
                type="date"
                value={txDate}
                max={todayKey}
                onChange={(e) => setTxDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <p className="text-xs text-gray-500">{t("workshopDaily.dateHint")}</p>
            </div>
          )}
          {direction === "IN" && (
            <div className="space-y-1.5">
              <label className="mb-1 block text-sm font-medium">{t("workshopDaily.revenueType")} <span className="text-red-500">*</span></label>
              <select value={revenueType} onChange={(e) => { setRevenueType(e.target.value); if (e.target.value !== "CASH_COLLECTION") setCustomerId(""); }} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option value="">{t("workshopDaily.selectRevenueType")}</option>
                <option value="SERVICE_REVENUE">{t("workshopDaily.serviceRevenue")}</option>
                <option value="CASH_COLLECTION">{t("workshopDaily.cashCollection")}</option>
                <option value="OTHER_INCOME">{t("workshopDaily.otherIncome")}</option>
              </select>
            </div>
          )}
          {direction === "IN" && revenueType === "CASH_COLLECTION" && (
            <SelectWithAdd
              label={t("workshopDaily.customer")}
              required
              value={customerId}
              onChange={setCustomerId}
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={t("workshopDaily.selectCustomer")}
              quickAddTitle="إضافة عميل جديد"
              quickAddFields={[
                { key: "name", label: "اسم العميل", required: true, colSpan: 2 },
                { key: "phone", label: "الهاتف", placeholder: "01xxxxxxxxx", colSpan: 1 },
                { key: "email", label: "البريد الإلكتروني", type: "email", colSpan: 1 },
                { key: "address", label: "العنوان", colSpan: 2 },
              ]}
              quickAddEndpoint="/api/customers"
              notifyEntities={["customers"]}
              onQuickAddSuccess={(item) => {
                setCustomers((prev) => (prev.some((c) => c.id === item.id) ? prev : [...prev, item]));
                setCustomerId(item.id);
                toastSuccess("تمت إضافة العميل بنجاح");
              }}
            />
          )}
          {direction === "OUT" && (
            <SelectWithAdd
              label={t("workshopDaily.category")}
              value={categoryId}
              onChange={setCategoryId}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={t("workshopDaily.noCategory")}
              quickAddTitle="إضافة تصنيف مصروفات جديد"
              quickAddFields={[
                { key: "name", label: "اسم التصنيف", required: true, colSpan: 2 },
              ]}
              quickAddEndpoint="/api/workshop-daily/categories"
              onQuickAddSuccess={(item) => {
                setData((prev) => (prev ? { ...prev, categories: [...(prev.categories ?? []), item] } : prev));
                setCategoryId(item.id);
                toastSuccess("تمت إضافة التصنيف بنجاح");
              }}
            />
          )}
          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium">{t("workshopDaily.amount")} (ج.م)</label>
            <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" placeholder="200" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium">{t("workshopDaily.reason")}</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("workshopDaily.reasonPlaceholder")} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={closeForm} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 text-white hover:bg-blue-700" />
          </div>
        </form>
      </FormModal>

      {/* ── تفاصيل اليوم ───────────────────────────────────────────────────── */}
      <FormModal open={dayOpen} onClose={() => setDayOpen(false)} title={t("workshopDaily.dayDetails")} xl>
        {dayLoading ? (
          <div className="flex min-h-[220px] items-center justify-center">
            <PrinterLoader size="sm" label={t("common.loading")} />
          </div>
        ) : dayError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{dayError}</div>
        ) : dayDetail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-base font-bold text-slate-900">{fmtDayLabel(dayDetail.bookDate)}</h3>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${dayDetail.status === "OPEN" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                {dayDetail.status === "OPEN" ? t("workshopDaily.openBadge") : t("workshopDaily.closedBadge")}
              </span>
              {dayDetail.status === "OPEN" && canClose && (
                <button
                  onClick={() => openCloseForm(dayDetail.id, dayDetail.totals)}
                  className="ms-auto inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  <Lock size={14} className="shrink-0" />{t("workshopDaily.closeThisDay")}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                <p className="text-xs font-medium text-green-700">{t("workshopDaily.totalIn")}</p>
                <p className="mt-1 text-lg font-bold text-green-800" dir="ltr">{fmtMoney(dayDetail.totals.inTotal)}</p>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-medium text-red-700">{t("workshopDaily.totalOut")}</p>
                <p className="mt-1 text-lg font-bold text-red-800" dir="ltr">{fmtMoney(dayDetail.totals.outTotal)}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-medium text-emerald-700">{t("workshopDaily.cashboxBalance")}</p>
                <p className="mt-1 text-lg font-bold text-emerald-800" dir="ltr">{fmtMoney(dayDetail.totals.remaining)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">{t("workshopDaily.handoverTo")}</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-800">{dayDetail.handoverTo || "—"}</p>
              </div>
            </div>

            {dayDetail.transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">{t("common.noData")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.time")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.direction")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.category")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.reason")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.amount")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.status")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.createdBy")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {dayDetail.transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm whitespace-nowrap text-slate-600">{fmtTime(tx.createdAt)}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${tx.direction === "IN" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {tx.direction === "IN" ? <ArrowUpCircle size={12} className="shrink-0" /> : <ArrowDownCircle size={12} className="shrink-0" />}
                            {tx.direction === "IN" ? t("workshopDaily.in") : t("workshopDaily.out")}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm">
                          <span className="font-medium text-slate-700">{tx.category?.name || t("workshopDaily.noCategory")}</span>
                          {tx.direction === "IN" && tx.revenueType && (
                            <span className="ms-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap bg-blue-50 text-blue-700">
                              {tx.revenueType === "SERVICE_REVENUE" ? t("workshopDaily.serviceRevenue") :
                               tx.revenueType === "CASH_COLLECTION" ? t("workshopDaily.cashCollection") : t("workshopDaily.otherIncome")}
                            </span>
                          )}
                          {tx.direction === "IN" && tx.customerName && (
                            <span className="mt-0.5 block text-xs text-slate-500">👤 {tx.customerName}</span>
                          )}
                        </td>
                        <td className="max-w-[260px] truncate px-4 py-2 text-sm text-slate-800" title={tx.rejectReason || tx.reason}>
                          {tx.reason}
                          {tx.status === "REJECTED" && tx.rejectReason && (
                            <span className="block truncate text-xs text-red-500">{tx.rejectReason}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm font-bold whitespace-nowrap text-slate-900"><span dir="ltr">{fmtMoney(tx.amount)}</span></td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${STATUS_STYLES[tx.status]}`}>
                            {tx.status === "PENDING" ? t("workshopDaily.pending") : tx.status === "CONFIRMED" ? t("workshopDaily.confirmed") : t("workshopDaily.rejected")}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm text-slate-600">{tx.createdByName || "—"}</td>
                        <td className="px-4 py-2">{renderTxActions(tx)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </FormModal>

      {/* ── إدارة التصنيفات ─────────────────────────────────────────────────── */}
      <FormModal open={showCategories} onClose={() => setShowCategories(false)} title={t("workshopDaily.manageCategories")}>
        <div className="space-y-4">
          {catError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{catError}</div>
          )}

          {canAdd && (
            <form onSubmit={handleCategoryCreate} className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <label className="mb-1 block text-sm font-medium">{t("workshopDaily.categoryName")}</label>
                <input
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder={t("workshopDaily.categoryNamePlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <SubmitButton loading={catSaving} label={t("workshopDaily.addCategory")} loadingLabel={t("common.saving")} className="bg-blue-600 text-white hover:bg-blue-700" />
            </form>
          )}

          {categories.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">{t("workshopDaily.categoriesEmpty")}</p>
          ) : (
            <ul className="divide-y divide-gray-200 rounded-xl border border-slate-200">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                  {editingCat?.id === c.id ? (
                    <form onSubmit={handleCategoryRename} className="flex flex-1 items-center gap-2">
                      <input
                        value={editingCat.name}
                        onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                      <button type="submit" disabled={catSaving} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">
                        {t("common.save")}
                      </button>
                      <button type="button" onClick={() => setEditingCat(null)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50">
                        {t("common.cancel")}
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-sm font-medium text-slate-700">{c.name}</span>
                      {canEdit && (
                        <button onClick={() => setEditingCat(c)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600" title={t("common.edit")} aria-label={t("common.edit")}>
                          <Pencil size={16} className="shrink-0" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => handleCategoryDelete(c)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600" title={t("common.delete")} aria-label={t("common.delete")}>
                          <Trash2 size={16} className="shrink-0" />
                        </button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </FormModal>

      <FormModal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title={t("workshopDaily.reject")}>
        <form onSubmit={handleReject} className="space-y-3">
          {rejectError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{rejectError}</div>
          )}
          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium">{t("workshopDaily.rejectReason")} <span className="text-red-500">*</span></label>
            <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={t("workshopDaily.rejectReasonPlaceholder")} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setRejectTarget(null)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            <SubmitButton loading={rejecting} label={t("workshopDaily.reject")} loadingLabel={t("common.saving")} className="bg-red-600 text-white hover:bg-red-700" />
          </div>
        </form>
      </FormModal>

      <FormModal open={showClose} onClose={() => setShowClose(false)} title={t("workshopDaily.closeDayTitle")}>
        <form onSubmit={handleClose} className="space-y-3">
          {closeError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{closeError}</div>
          )}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="flex justify-between py-1"><span className="text-gray-500">{t("workshopDaily.totalIn")}</span><span className="font-bold text-green-700" dir="ltr">{closeTotals ? fmtMoney(closeTotals.inTotal) : "—"}</span></div>
            <div className="flex justify-between py-1"><span className="text-gray-500">{t("workshopDaily.totalOut")}</span><span className="font-bold text-red-700" dir="ltr">{closeTotals ? fmtMoney(closeTotals.outTotal) : "—"}</span></div>
            <div className="flex justify-between border-t border-slate-200 py-1 pt-2"><span className="font-medium text-slate-700">{t("workshopDaily.handoverAmount")}</span><span className="font-bold text-slate-900" dir="ltr">{closeTotals ? fmtMoney(closeTotals.remaining) : "—"}</span></div>
            <p className="pt-1 text-xs text-gray-500">{t("workshopDaily.closeDayHint")}</p>
          </div>
          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium">{t("workshopDaily.handoverTo")} <span className="text-red-500">*</span></label>
            <input value={handoverTo} onChange={(e) => setHandoverTo(e.target.value)} placeholder={t("workshopDaily.handoverToPlaceholder")} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium">{t("workshopDaily.handoverNote")}</label>
            <input value={handoverNote} onChange={(e) => setHandoverNote(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowClose(false)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            <SubmitButton loading={closing} label={t("workshopDaily.closeDay")} loadingLabel={t("common.saving")} className="bg-amber-600 text-white hover:bg-amber-700" />
          </div>
        </form>
      </FormModal>
    </div>
  );
}
