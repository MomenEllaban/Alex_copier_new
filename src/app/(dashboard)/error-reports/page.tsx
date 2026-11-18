"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/context";
import { useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import RefreshButton from "@/components/RefreshButton";
import { CheckCircle2, RotateCcw } from "lucide-react";

interface ErrorReport {
  id: string;
  code: string;
  status: string;
  messageAr: string;
  messageEn: string;
  hintAr?: string | null;
  requestId?: string | null;
  path?: string | null;
  action?: string | null;
  userEmail?: string | null;
  createdAt: string;
}

export default function ErrorReportsPage() {
  const { t, locale } = useI18n();
  const { success, error: toastError } = useToast();
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [filter, setFilter] = useState("NEW");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/error-reports?status=${filter}`);
      const data = await res.json();
      if (!res.ok) {
        toastError(apiErrorMessage(data, t));
        return;
      }
      setReports(Array.isArray(data) ? data : []);
    } catch {
      toastError(t("common.connectionError"));
    } finally {
      setLoading(false);
    }
  }, [filter, t, toastError]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const setStatus = async (id: string, status: "NEW" | "RESOLVED") => {
    const res = await fetch(`/api/error-reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError(apiErrorMessage(data, t));
      return;
    }
    success(t("common.savedSuccessfully"));
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t("common.errorInbox.Title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("common.errorInbox.Subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-44"
            aria-label={t("common.errorInbox.Filter")}
          >
            <option value="NEW">{t("common.errorInbox.New")}</option>
            <option value="RESOLVED">{t("common.errorInbox.Resolved")}</option>
            <option value="ALL">{t("common.all")}</option>
          </select>
          <RefreshButton onRefresh={load} refreshing={loading} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="p-3 text-start font-semibold">{t("common.errorInbox.Code")}</th>
              <th className="p-3 text-start font-semibold">{t("common.errorInbox.Message")}</th>
              <th className="p-3 text-start font-semibold">{t("common.page")}</th>
              <th className="p-3 text-start font-semibold">{t("common.time")}</th>
              <th className="p-3 text-start font-semibold">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reports.map((report) => (
              <tr key={report.id} className="align-top hover:bg-slate-50/60">
                <td className="p-3 font-mono text-xs text-slate-700">{report.code}</td>
                <td className="p-3">
                  <p dir="rtl" className="font-medium text-slate-900">{report.messageAr}</p>
                  <p dir="ltr" className="mt-1 text-start text-xs text-slate-500">{report.messageEn}</p>
                  {report.requestId && <p dir="ltr" className="mt-1 text-start font-mono text-[11px] text-slate-400">#{report.requestId}</p>}
                </td>
                <td className="p-3 font-mono text-xs text-slate-600" dir="ltr">{report.path || "—"}</td>
                <td className="p-3 text-xs text-slate-600">{new Date(report.createdAt).toLocaleString(locale === "ar" ? "ar-EG" : "en-GB")}</td>
                <td className="p-3">
                  {report.status === "NEW" ? (
                    <button
                      type="button"
                      onClick={() => setStatus(report.id, "RESOLVED")}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 size={14} /> {t("common.errorInbox.Resolve")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStatus(report.id, "NEW")}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <RotateCcw size={14} /> {t("common.errorInbox.Reopen")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && reports.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">{t("common.errorInbox.NoReports")}</p>
        )}
      </div>
    </div>
  );
}


