"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Info, X, AlertTriangle } from "lucide-react";
import { useI18n } from "@/i18n/context";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
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

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === "success") return <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />;
  if (kind === "error") return <XCircle size={18} className="shrink-0 text-red-600" />;
  return <Info size={18} className="shrink-0 text-blue-600" />;
}

export default function UIProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const nextId = useRef(0);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++nextId.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const toastApi: ToastApi = {
    success: (message) => push("success", message),
    error: (message) => push("error", message),
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

        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[70] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
          {toasts.map((item) => (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg ${TOAST_STYLES[item.kind]}`}
            >
              <ToastIcon kind={item.kind} />
              <span className="flex-1">{item.message}</span>
              <button
                onClick={() => setToasts((prev) => prev.filter((toastItem) => toastItem.id !== item.id))}
                aria-label={t("common.close")}
                className="text-inherit opacity-60 hover:opacity-100"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>

        {confirmState && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[1px]"
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
