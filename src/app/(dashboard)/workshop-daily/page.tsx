"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowDownCircle, ArrowUpCircle, Lock, Pencil, Plus, Trash2, Wallet, X } from "lucide-react";
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

interface Tx {
  id: string;
  direction: "IN" | "OUT";
  amount: number;
  reason: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  createdBy: string;
  category?: { id: string; name: string } | null;
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

interface ClosedBook {
  id: string;
  bookDate: string;
  closedAt: string | null;
  handoverAmount: number | null;
  handoverTo: string | null;
  totals: Totals;
}

interface DailyData {
  company: { id: string; name: string };
  book: Book | null;
  closedBooks: ClosedBook[];
}

const FINANCE_ROLES = ["ACCOUNTANT", "GENERAL_MANAGER", "COMPANY_MANAGER"];

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  CONFIRMED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

export default function WorkshopDailyPage() {
  const { t, locale, dir } = useI18n();
  const { data: session } = useSession();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const currentUserId = session?.user?.id ?? "";
  const isFinance = FINANCE_ROLES.includes(role);

  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearchInput] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState<Tx | null>(null);
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<Tx | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const [showClose, setShowClose] = useState(false);
  const [handoverTo, setHandoverTo] = useState("الخزينة الرئيسية");
  const [handoverNote, setHandoverNote] = useState("");
  const [closeError, setCloseError] = useState("");
  const [closing, setClosing] = useState(false);

  const fetchDaily = async () => {
    try {
      const res = await fetch("/api/workshop-daily");
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

  const fmtMoney = (n: number) => `${n.toLocaleString(locale === "ar" ? "ar-EG" : "en-US")} ج.م`;
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB");

  const canModify = (tx: Tx) => tx.status === "PENDING" && (isFinance || tx.createdBy === currentUserId);

  const openAddForm = () => {
    setEditingTx(null);
    setDirection("OUT");
    setAmount("");
    setReason("");
    setFormError("");
    setShowForm(true);
  };

  const openEditForm = (tx: Tx) => {
    setEditingTx(tx);
    setDirection(tx.direction);
    setAmount(String(tx.amount));
    setReason(tx.reason);
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTx(null);
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
      setFormError(t("workshopDaily.reason") + "؟");
      return;
    }
    const editing = editingTx;
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/workshop-daily/${editing.id}` : "/api/workshop-daily", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, amount: value, reason: reason.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(apiErrorMessage(json, t));
        return;
      }
      closeForm();
      refresh();
      notifyDataChanged(["workshop"]);
      toastSuccess(t("common.success"));
      toastInfo(t(editing ? "workshopDaily.editedNext" : "workshopDaily.addedNext"));
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
      notifyDataChanged(["workshop"]);
      toastSuccess(t("common.success"));
      toastInfo(t("workshopDaily.rejectedNext"));
    } finally {
      setRejecting(false);
    }
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
        body: JSON.stringify({ handoverTo: handoverTo.trim(), handoverNote: handoverNote.trim() || undefined }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = apiErrorMessage(json, t);
        setCloseError(msg);
        if (json?.code === "PENDING_EXIST") toastInfo(t("workshopDaily.closeBlockedPending"));
        return;
      }
      setShowClose(false);
      setHandoverNote("");
      refresh();
      notifyDataChanged(["workshop"]);
      toastSuccess(t("common.success"));
      toastInfo(t("workshopDaily.closedNext"));
    } finally {
      setClosing(false);
    }
  };

  const totals = data?.book?.totals;

  return (
    <div dir={dir} className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("workshopDaily.title")}</h1>
          <p className="text-sm text-gray-500">{t("workshopDaily.subtitle")}</p>
        </div>
        <div className="ms-auto flex gap-2">
          <button
            onClick={openAddForm}
            disabled={!!data?.book?.isOldDay}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus size={16} className="shrink-0" />{t("workshopDaily.addTransaction")}
          </button>
          <button
            onClick={() => { setCloseError(""); setShowClose(true); }}
            disabled={!data?.book}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
          >
            <Lock size={16} className="shrink-0" />{t("workshopDaily.closeDay")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <PrinterLoader size="md" label={t("common.loading")} />
        </div>
      ) : (
        <>
          {data?.book?.isOldDay && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              <X size={16} className="shrink-0" />{t("workshopDaily.oldDayWarning")} ({data.book ? fmtDate(data.book.bookDate) : ""})
            </div>
          )}
          {!data?.book && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
              {t("workshopDaily.noOpenDay")}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Wallet size={14} className="shrink-0" />{t("workshopDaily.cashboxBalance")}</p>
              <p className="mt-1 text-2xl font-bold text-emerald-800" dir="ltr">{totals ? fmtMoney(totals.remaining) : "—"}</p>
              <p className="mt-1 text-xs text-emerald-600">{data?.book ? `${t("workshopDaily.openDay")}: ${fmtDate(data.book.bookDate)}` : t("workshopDaily.noOpenDay")}</p>
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
              <div className="w-full md:w-72 md:flex-none">
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
                      tx.category?.name || "",
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
                    {paged.map((tx) => {
                      const showConfirm = isFinance && tx.status === "PENDING";
                      const showModify = canModify(tx);
                      const hasActions = showConfirm || showModify;
                      return (
                        <tr key={tx.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm whitespace-nowrap text-slate-600">{fmtTime(tx.createdAt)}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${tx.direction === "IN" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {tx.direction === "IN" ? <ArrowUpCircle size={12} className="shrink-0" /> : <ArrowDownCircle size={12} className="shrink-0" />}
                              {tx.direction === "IN" ? t("workshopDaily.in") : t("workshopDaily.out")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">{tx.category?.name || "—"}</td>
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
                          <td className="px-4 py-3">
                            {hasActions ? (
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
                                {showModify && (
                                  <>
                                    <button onClick={() => openEditForm(tx)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600" title={t("common.edit")} aria-label={t("common.edit")}>
                                      <Pencil size={16} className="shrink-0" />
                                    </button>
                                    <button onClick={() => handleDelete(tx)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600" title={t("common.delete")} aria-label={t("common.delete")}>
                                      <Trash2 size={16} className="shrink-0" />
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-slate-900">{t("workshopDaily.closedHistory")}</h2>
            {!data || data.closedBooks.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">{t("workshopDaily.noClosedDays")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.openDay")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.totalIn")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.totalOut")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.handoverAmount")}</th>
                      <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("workshopDaily.handoverTo")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.closedBooks.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm whitespace-nowrap text-slate-700">{fmtDate(b.bookDate)}</td>
                        <td className="px-4 py-2 text-sm font-semibold text-green-700"><span dir="ltr">{fmtMoney(b.totals.inTotal)}</span></td>
                        <td className="px-4 py-2 text-sm font-semibold text-red-700"><span dir="ltr">{fmtMoney(b.totals.outTotal)}</span></td>
                        <td className="px-4 py-2 text-sm font-bold text-slate-900"><span dir="ltr">{b.handoverAmount != null ? fmtMoney(b.handoverAmount) : "—"}</span></td>
                        <td className="px-4 py-2 text-sm text-slate-600">{b.handoverTo || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

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
            <div className="flex justify-between py-1"><span className="text-gray-500">{t("workshopDaily.totalIn")}</span><span className="font-bold text-green-700" dir="ltr">{totals ? fmtMoney(totals.inTotal) : "—"}</span></div>
            <div className="flex justify-between py-1"><span className="text-gray-500">{t("workshopDaily.totalOut")}</span><span className="font-bold text-red-700" dir="ltr">{totals ? fmtMoney(totals.outTotal) : "—"}</span></div>
            <div className="flex justify-between border-t border-slate-200 py-1 pt-2"><span className="font-medium text-slate-700">{t("workshopDaily.handoverAmount")}</span><span className="font-bold text-slate-900" dir="ltr">{totals ? fmtMoney(totals.remaining) : "—"}</span></div>
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
