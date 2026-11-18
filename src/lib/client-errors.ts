"use client";

import { getErrorDefinition } from "./error-catalog";

export type ErrorLocale = "ar" | "en";
export type ErrorSource = "api" | "client";

export interface ClientErrorInfo {
  code: string;
  messageAr: string;
  messageEn: string;
  hintAr?: string;
  hintEn?: string;
  requestId?: string;
  path?: string;
  action?: string;
  at: string;
  source: ErrorSource;
  details?: string;
}

const DETAIL_EVENT = "app:error-detail";
let currentLocale: ErrorLocale = "ar";

/** Called by I18nProvider so the formatter picks Arabic by default. */
export function setErrorLocale(locale: ErrorLocale) {
  currentLocale = locale;
}
export function getErrorLocale(): ErrorLocale {
  return currentLocale;
}

export function publishError(info: ClientErrorInfo) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ClientErrorInfo>(DETAIL_EVENT, { detail: info }));
}

export function subscribeError(handler: (info: ClientErrorInfo) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => handler((event as CustomEvent<ClientErrorInfo>).detail);
  window.addEventListener(DETAIL_EVENT, listener);
  return () => window.removeEventListener(DETAIL_EVENT, listener);
}

/** Turn any API error body into a detailed, bilingual, reportable object. */
export function toClientError(data: unknown, action?: string): ClientErrorInfo | null {
  if (!data || typeof data !== "object") return null;
  const body = data as Record<string, unknown>;
  const code = typeof body.code === "string" && body.code.trim() ? body.code.trim() : "INTERNAL_ERROR";
  const definition = getErrorDefinition(code);
  const rawAr = typeof body.messageAr === "string" && body.messageAr.trim() ? body.messageAr.trim() : "";
  const rawEn = typeof body.messageEn === "string" && body.messageEn.trim() ? body.messageEn.trim() : "";
  const legacy = typeof body.error === "string" && body.error.trim() ? body.error.trim() : "";
  const legacyMessage = typeof body.message === "string" && body.message.trim() ? body.message.trim() : "";

  return {
    code,
    messageAr: rawAr || definition.ar,
    messageEn: rawEn || definition.en || legacyMessage || legacy || "An error occurred.",
    hintAr: typeof body.hintAr === "string" ? body.hintAr : definition.hintAr,
    hintEn: typeof body.hintEn === "string" ? body.hintEn : definition.hintEn,
    requestId: typeof body.requestId === "string" ? body.requestId : undefined,
    path: typeof window === "undefined" ? undefined : window.location.pathname,
    action,
    at: new Date().toISOString(),
    source: "api",
  };
}

/** JS exceptions / rejected promises outside an API response. */
export function clientExceptionInfo(error: unknown, action = "client"): ClientErrorInfo {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown client error";
  return {
    code: "CLIENT_ERROR",
    messageAr: "حدث خطأ في الواجهة أثناء تنفيذ العملية. لم تكتمل العملية.",
    messageEn: "A client-side error interrupted the action. The action was not completed.",
    hintAr: "أعد المحاولة. لو استمر الخطأ أرسل البلاغ.",
    hintEn: "Retry. If it persists, send the report.",
    path: typeof window === "undefined" ? undefined : window.location.pathname,
    action,
    at: new Date().toISOString(),
    source: "client",
    details: raw.slice(0, 800),
  };
}

/** Fire-and-forget report to the server. Never blocks the user action. */
export function reportClientError(info: ClientErrorInfo): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return fetch("/api/error-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(info),
    keepalive: true,
  })
    .then((response) => response.ok)
    .catch(() => false);
}
