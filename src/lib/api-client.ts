// Shared client-side helper for API error responses.
// Server routes return { error: string, code?: string }. The code maps to an
// i18n key under `errors.*` so messages follow the UI locale; the raw server
// message is the fallback (and the final fallback is common.error).
//
// The message is always rendered here rather than sent from the route: several
// routes used to embed the text in the response, half in Arabic and half in
// English, which showed the wrong language depending on which route failed.

type ApiErrorData = { error?: unknown; code?: unknown; message?: unknown } | null | undefined;

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
  const code = typeof data?.code === "string" ? data.code : "";
  if (code) {
    const key = `errors.${code}`;
    const translated = t(key);
    if (translated !== key) return fill(translated, values);
  }
  if (typeof data?.error === "string" && data.error.trim() !== "") return data.error;
  if (typeof data?.message === "string" && data.message.trim() !== "") return data.message;
  const fallback = t(fallbackKey);
  return fallback !== fallbackKey ? fill(fallback, values) : t("common.error");
}

export async function readApiError(response: Response): Promise<ApiErrorData> {
  try {
    return (await response.json()) as ApiErrorData;
  } catch {
    return null;
  }
}
