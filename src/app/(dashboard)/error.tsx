"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import { useToast } from "@/components/UIProvider";
import {
  clientExceptionInfo,
  publishError,
  reportClientError,
} from "@/lib/client-errors";

/** Dashboard-level error boundary with a bilingual, reportable failure. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t, locale, dir } = useI18n();
  const { error: toastError } = useToast();
  const [sent, setSent] = useState(false);
  const info = useMemo(() => clientExceptionInfo(error, "page-render"), [error]);

  useEffect(() => {
    console.error("[dashboard] page error:", error);
    publishError(info);
  }, [error, info]);

  const send = async () => {
    const ok = await reportClientError(info);
    if (!ok) toastError(t("common.reportFailed"));
    else setSent(true);
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center" dir={dir}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-3xl text-red-600">!</div>
      <h2 className="text-lg font-bold text-gray-800">{t("common.pageLoadError")}</h2>
      <p className="max-w-md text-sm leading-7 text-gray-600">{t("common.pageLoadErrorHint")}</p>
      {locale === "en" && <p dir="rtl" className="max-w-md text-sm leading-7 text-gray-500">البيانات مالتهاش دلوقتي. جرّب تحميل الصفحة تاني، ولو المشكلةفضلت أرسل البلاغ.</p>}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => reset()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">
          {t("common.retry")}
        </button>
        <button onClick={() => window.location.assign("/")} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
          {t("common.goHome")}
        </button>
        <button onClick={send} disabled={sent} className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:opacity-60">
          {sent ? t("common.reportSent") : t("common.sendReport")}
        </button>
      </div>
      {(error.digest || info.details) && (
        <pre dir="ltr" className="mt-2 max-h-32 max-w-lg overflow-auto rounded-lg bg-slate-900 p-3 text-start text-[11px] text-slate-200">
          {error.digest ? `ERROR ${error.digest}\n` : ""}{info.details || ""}
        </pre>
      )}
    </div>
  );
}
