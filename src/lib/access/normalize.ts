// Normalization helpers for legacy Access data (Arabic-first).
// Pure functions — safe to unit test, reused by the Access seeder.

const ARABIC_DIACRITICS = /[\u064B-\u0652\u0670]/g;

/** Trim, collapse whitespace, unify alef/hamza, teh-marbuta/ha, alef-maqsura/yeh. */
export function normalizeArabicName(value: string | null | undefined): string {
  if (value == null) return "";
  return value
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical key used to match engineer nicknames across tables. */
export function engineerKey(value: string | null | undefined): string {
  return normalizeArabicName(value);
}

/** Normalize a machine model for grouping: upper-case, no spaces. */
export function normalizeModel(value: string | null | undefined): string {
  if (value == null) return "";
  return value.replace(/\s+/g, "").toUpperCase().trim();
}

/** Normalize a customer name for merging: trim + collapse inner spaces. */
export function normalizeCustomerName(value: string | null | undefined): string {
  if (value == null) return "";
  return value.replace(/\s+/g, " ").trim();
}

/** Normalize a chassis/serial for comparison (trim only — case matters). */
export function normalizeSerial(value: string | null | undefined): string {
  if (value == null) return "";
  return value.trim();
}
