"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from "react";
import { CheckCircle2, XCircle, Info, X, AlertTriangle, ClipboardCopy, Send, ChevronLeft } from "lucide-react";
import { useI18n } from "@/i18n/context";
import {
  clientExceptionInfo,
  getErrorLocale,
  reportClientError,
  subscribeError,
  type ClientErrorInfo,
} from "@/lib/client-errors";
import { formatErrorDetails } from "@/lib/api-client";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  errorInfo?: ClientErrorInfo;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string, info?: ClientErrorInfo) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({
  success: () => {},
  error: () => {},
  info: () => {},
});

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(
  async () => false,
);

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

const TOAST_STYLES: Record<ToastKind, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-blue-200 bg-blue-50 text-blue-800",
};

function localizedMessage(info: ClientErrorInfo): string {
  return getErrorLocale() === "ar" ? info.messageAr : info.messageEn;
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === "success") return <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />;
  if (kind === "error") return <XCircle size={18} className="shrink-0 text-red-600" />;
  return <Info size={18} className="shrink-0 text-blue-600" />;
}

function ErrorDetailsDialog({
  info, onClose,
}: { info: ClientErrorInfo; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatErrorDetails(info, locale));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const send = async () => {
    setSendState("sending");
    const ok = await reportClientError(info);
    setSendState(ok ? "sent" : "failed");
  };

  const field = (label: string, value?: string, dir?: "rtl" | "ltr") =>
    value ? (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="block text-[11px] font-medium text-slate-500">{label}</span>
        <span dir={dir} className="mt-0.5 block break-words font-mono text-xs text-slate-800">{value}</span>
      </div>
    ) : null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("common.errorDetails")}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-red-100 bg-red-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle size={20} />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">{t("common.errorDetails")}</h2>
              <p className="mt-0.5 text-xs text-red-700">{t("common.errorDetailsIntro")}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-slate-500 hover:bg-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-500">{t("common.arabicMessage")}</span>
            <p dir="rtl" className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm font-medium leading-7 text-red-900">
              {info.messageAr}
            </p>
            {info.hintAr && (
              <p dir="rtl" className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs leading-6 text-amber-800">
                💡 {info.hintAr}
              </p>
            )}
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-500">{t("common.englishMessage")}</span>
            <p dir="ltr" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-start text-sm leading-6 text-slate-700">
              {info.messageEn}
            </p>
            {info.hintEn && <p dir="ltr" className="mt-2 text-start text-xs text-slate-500">{info.hintEn}</p>}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {field(t("common.errorCode"), info.code, "ltr")}
            {field(t("common.requestId"), info.requestId, "ltr")}
            {field(t("common.page"), info.path, "ltr")}
            {field(t("common.time"), info.at, "ltr")}
            {field(t("common.action"), info.action)}
          </div>

          {info.details && (
            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-500">{t("common.technicalDetails")}</span>
              <pre dir="ltr" className="max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 text-start text-[11px] leading-5 text-slate-200">
                {info.details}
              </pre>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ChevronLeft size={15} /> {t("common.close")}
          </button>
          <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ClipboardCopy size={15} /> {copied ? t("common.copied") : t("common.copyDetails")}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sendState === "sending" || sendState === "sent"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send size={15} />
            {sendState === "sending"
              ? t("common.sendingReport")
              : sendState === "sent"
                ? t("common.reportSent")
                : t("common.sendReport")}
          </button>
          {sendState === "failed" && <span className="text-xs text-red-600">{t("common.reportFailed")}</span>}
        </div>
      </div>
    </div>
  );
}

export default function UIProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [detailInfo, setDetailInfo] = useState<ClientErrorInfo | null>(null);
  const nextId = useRef(0);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const latestErrorRef = useRef<ClientErrorInfo | null>(null);

  const push = useCallback((kind: ToastKind, message: string, info?: ClientErrorInfo) => {
    const id = ++nextId.current;
    const errorInfo = kind === "error" ? info ?? latestErrorRef.current ?? undefined : undefined;
    latestErrorRef.current = null;
    setToasts((prev) => [...prev, { id, kind, message, errorInfo }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 6000);
  }, []);

  // One subscription handles both API errors (formatted in api-client) and raw
  // JS exceptions, so no action can fail silently.
  useEffect(() => {
    const unsubscribe = subscribeError((info) => {
      latestErrorRef.current = info;
      if (info.source === "client") push("error", localizedMessage(info), info);
    });
    const onError = (event: ErrorEvent) => {
      const info = clientExceptionInfo(event.error, "window.onerror");
      push("error", localizedMessage(info), info);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const info = clientExceptionInfo(event.reason, "unhandledrejection");
      push("error", localizedMessage(info), info);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      unsubscribe();
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [push]);

  const toastApi: ToastApi = {
    success: (message) => push("success", message),
    error: (message, info) => push("error", message, info),
    info: (message) => push("info", message),
  };

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setConfirmState(options);
      }),
    [],
  );

  const settle = (value: boolean) => {
    setConfirmState(null);
    resolveRef.current?.(value);
    resolveRef.current = null;
  };

  return (
    <ToastContext.Provider value={toastApi}>
      <ConfirmContext.Provider value={confirm}>
        {children}

        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
          {toasts.map((item) => (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg ${TOAST_STYLES[item.kind]}`}
            >
              <ToastIcon kind={item.kind} />
              <span className="flex-1 leading-6">{item.message}</span>
              {item.errorInfo && (
                <button
                  type="button"
                  onClick={() => setDetailInfo(item.errorInfo!)}
                  className="shrink-0 rounded-md bg-white/70 px-2 py-1 text-[11px] font-bold text-inherit underline decoration-dotted hover:bg-white"
                >
                  {t("common.details")}
                </button>
              )}
              <button
                onClick={() => setToasts((prev) => prev.filter((toastItem) => toastItem.id !== item.id))}
                aria-label={t("common.close")}
                className="shrink-0 text-inherit opacity-60 hover:opacity-100"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>

        {detailInfo && <ErrorDetailsDialog info={detailInfo} onClose={() => setDetailInfo(null)} />}

        {confirmState && (
          <div
            className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[1px]"
            onClick={() => settle(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-md cursor-default overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-red-50 to-rose-50 px-4 pb-4 pt-5 sm:px-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {confirmState.title || t("common.confirmTitle")}
                    </h2>
                    <p className="mt-2 text-sm leading-6 whitespace-pre-line text-slate-600">{confirmState.message}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={() => settle(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <X size={15} />
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => settle(true)}
                  className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                >
                  {confirmState.confirmLabel || t("common.confirm")}
                </button>
              </div>
            </div>
          </div>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
