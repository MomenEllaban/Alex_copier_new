// Payment-method normalization.
//
// The business exposes only Cash (كاش) and Credit (أجل). The DB enum also
// carries legacy values (INSTALLMENT, MIXED) from before the UX was simplified.
// Those are normalized to CREDIT everywhere for calculation/reporting, while
// the raw value stays on the record for historical display.

export type NormalizedPaymentMethod = "CASH" | "CREDIT";

const LEGACY = new Set(["INSTALLMENT", "MIXED"]);

/** True when a value means the customer is billed on credit (أجل). */
export function isCreditLike(method: string | null | undefined): boolean {
  return method !== "CASH" && method !== null && method !== undefined;
}

/** Normalize any stored method to the two business-facing ones. */
export function normalizePaymentMethod(method: string | null | undefined): NormalizedPaymentMethod {
  return method === "CASH" ? "CASH" : "CREDIT";
}

/**
 * Validate an incoming method from the UI: only CASH and CREDIT are accepted;
 * legacy values are tolerated (coerced to CREDIT for backward compatibility).
 * Returns null for anything invalid.
 */
export function sanitizePaymentMethod(method: unknown): NormalizedPaymentMethod | null {
  if (typeof method !== "string" || !method) return null;
  if (method === "CASH" || method === "CREDIT") return method as NormalizedPaymentMethod;
  if (LEGACY.has(method)) return "CREDIT";
  return null;
}
