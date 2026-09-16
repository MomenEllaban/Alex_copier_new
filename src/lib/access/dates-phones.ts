// Access date parsing + Egyptian phone normalization. Pure functions.

/**
 * Parse Access-exported date strings ("M/D/YYYY h:mm:ss AM").
 * Returns null for empty/invalid/out-of-range values (typos like year
 * 223, 1025, 1930 fall outside 2000-2035 and are rejected).
 */
export function parseAccessDate(raw: string | null | undefined): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 2000 || y > 2035) return null;
  return d;
}

/** Parse an Access numeric field that may be empty. */
export function parseAccessInt(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/**
 * Normalize Egyptian phone numbers stored as Access Long integers
 * (leading zero lost, e.g. 1202672775 -> "01202672775").
 */
export function normalizeAccessPhone(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith("1")) return `0${digits}`;
  return digits;
}
