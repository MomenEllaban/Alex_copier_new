/**
 * Two different levels of "reset", with two different levels of risk, so they
 * get two different guards.
 *
 * 1. Wipe the WHOLE database (`/api/dev/reset-transactions`). Irreversible and
 *    system-wide, so it stays dark in production unless the deployment opts in
 *    with ENABLE_DATA_RESET=1.
 *
 * 2. Zero ONE company's transactions (`/api/companies/[id]/reset-transactions`).
 *    Scoped to a single company and already behind the GENERAL_MANAGER role plus
 *    a typed confirmation of the company name, so requiring a deployment-wide
 *    env var as well only made the feature unusable — which is how it ended up
 *    showing a dead-end "edit your server settings" message to the one person
 *    allowed to use it. Enabled by default; set ENABLE_COMPANY_RESET=0 to lock
 *    a deployment out entirely.
 */

/** The system-wide wipe. Production must opt in. */
export function isDataResetEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ENABLE_DATA_RESET === "1";
}

/** The per-company wipe. Allowed unless a deployment locks it out. */
export function isCompanyResetEnabled(): boolean {
  return process.env.ENABLE_COMPANY_RESET !== "0";
}

/**
 * The caller has to type the company's name exactly. This is the guard that
 * replaces the deployment-wide switch: it is per-action, so it protects against
 * a misclick without blocking legitimate use, and the server never hands the
 * expected name back, so a caller that never rendered the page cannot skip it.
 */
export function isConfirmationValid(typed: unknown, companyName: string): boolean {
  if (typeof typed !== "string") return false;
  return typed.trim() === companyName.trim();
}
