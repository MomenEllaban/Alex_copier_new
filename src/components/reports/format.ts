const moneyFormatters = new Map<string, Intl.NumberFormat>();

/** EGP amount in the active locale, matching the formatting used elsewhere. */
export function moneyFormatter(value: number, locale: string): string {
  let formatter = moneyFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
      style: "currency",
      currency: "EGP",
      maximumFractionDigits: 0,
    });
    moneyFormatters.set(locale, formatter);
  }
  return formatter.format(value);
}

const numberFormatters = new Map<string, Intl.NumberFormat>();

export function numberFormatter(value: number, locale: string): string {
  let formatter = numberFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US");
    numberFormatters.set(locale, formatter);
  }
  return formatter.format(value);
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** ISO date in the active locale. */
export function dateFormatter(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  let formatter = dateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(iso));
}

/** A short badge for a workflow status string. */
export function statusClass(status: string): string {
  if (["ACTIVE", "RESOLVED", "CLOSED", "VERIFIED", "PAID"].includes(status)) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (["NEW", "ASSIGNED", "INITIAL", "UNDER_INSPECTION"].includes(status)) {
    return "bg-amber-100 text-amber-700";
  }
  if (["EXPIRED", "SCRAPPED", "CANCELLED", "REJECTED"].includes(status)) {
    return "bg-rose-100 text-rose-700";
  }
  return "bg-slate-100 text-slate-700";
}
