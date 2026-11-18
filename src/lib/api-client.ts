// Shared client-side helper for API error responses.
//
// Every failing action now produces a detailed bilingual envelope from
// `src/lib/api-errors.ts`. This module picks the right language (Arabic first),
// fills placeholders, and publishes the full detail object so the UI can show
// a "Error details / تفاصيل الخطأ" panel and a one-click report button.

import { getErrorLocale, publishError, toClientError } from "./client-errors";

type ApiErrorData = {
  error?: unknown;
  code?: unknown;
  message?: unknown;
  messageAr?: unknown;
  messageEn?: unknown;
  hintAr?: unknown;
  hintEn?: unknown;
  requestId?: unknown;
} | null | undefined;

/** Substitutes `{name}`-style placeholders left in a translated string. */
export function fill(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole
  );
}

export function apiErrorMessage(
  data: ApiErrorData,
  t: (key: string) => string,
  fallbackKey = "common.error",
  values?: Record<string, string | number>,
): string {
  const info = toClientError(data);
  if (info) publishError(info);

  const code = typeof data?.code === "string" ? data.code : "";
  // Keep i18n overrides (they carry placeholders such as {count}).
  if (code && values && Object.keys(values).length > 0) {
    const key = `errors.${code}`;
    const translated = t(key);
    if (translated !== key) return fill(translated, values);
  }

  if (info) {
    const message = getErrorLocale() === "ar" ? info.messageAr : info.messageEn;
    return fill(message, values);
  }

  if (typeof data?.error === "string" && data.error.trim() !== "") return fill(data.error, values);
  if (typeof data?.message === "string" && data.message.trim() !== "") return fill(data.message, values);
  const fallback = t(fallbackKey);
  return fallback !== fallbackKey ? fill(fallback, values) : t("common.error");
}

/** Formatted detailed text used by the error-details dialog and copy button. */
export function formatErrorDetails(info: unknown, locale: "ar" | "en" = "ar"): string {
  if (!info || typeof info !== "object") return "";
  const i = info as Record<string, unknown>;
  const label = locale === "ar"
    ? {
        code: "رمز الخطأ", requestId: "رقم الطلب", time: "الوقت", path: "الصفحة",
        action: "العملية", ar: "الرسالة (عربي)", en: "Message (English)",
        hintAr: "المقترح (عربي)", hintEn: "Suggestion (English)", details: "تفاصيل تقنية",
      }
    : {
        code: "Code", requestId: "Request ID", time: "Time", path: "Page",
        action: "Action", ar: "Message (Arabic)", en: "Message (English)",
        hintAr: "Hint (Arabic)", hintEn: "Hint (English)", details: "Technical details",
      };
  const rows: string[] = [];
  const add = (key: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) rows.push(`${label[key as keyof typeof label]}: ${value}`);
  };
  add("code", i.code);
  add("requestId", i.requestId);
  add("time", i.at);
  add("path", i.path);
  add("action", i.action);
  add("ar", i.messageAr);
  add("en", i.messageEn);
  add("hintAr", i.hintAr);
  add("hintEn", i.hintEn);
  add("details", i.details);
  return rows.join("\n");
}

export async function readApiError(response: Response): Promise<ApiErrorData> {
  try {
    return (await response.json()) as ApiErrorData;
  } catch {
    return null;
  }
}

/** True when a response body carries the new detailed envelope. */
export function isRichError(data: ApiErrorData): boolean {
  return Boolean(data && typeof data.code === "string" && typeof data.requestId === "string");
}

