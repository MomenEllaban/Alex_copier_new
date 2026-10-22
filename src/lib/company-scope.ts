/**
 * Company scoping rules shared by every module that acts on a company.
 *
 * Two different questions live here, and they must not be mixed:
 *
 * 1. Operational scope — who may post into a company, read its HR, edit its
 *    record. A user tied to a company (`User.companyId`) works in that company
 *    only; the general manager, or a user with no home company, works across
 *    the group. See `canActOnCompany` / `companyScopeFilter` /
 *    `resolveCompanyId`.
 *
 * 2. Report scope — which companies' financial reports a user may open. This is
 *    the per-user grant edited on the roles screen (`UserCompanyAccess`). The
 *    rows are authoritative when present, so the general manager can also take
 *    a company away; with no rows the user falls back to their home company, or
 *    to every company when they have none. See `reportCompanyIds` /
 *    `canViewCompanyReport`.
 *
 * Keeping them apart matters: widening the report scope must never widen the
 * operational one, or an accountant granted a second company's report would
 * also start seeing that company's payroll and employees.
 */

export interface CompanyScopedActor {
  id: string;
  role?: string | null;
  companyId?: string | null;
  /** Explicit report grants (`UserCompanyAccess`) — empty when none are set. */
  companyAccessIds?: string[] | null;
}

/** Roles that work across every company of the group. */
const GROUP_LEVEL_ROLES = ["GENERAL_MANAGER"];

/**
 * A group-level user: no company of their own, or the general manager.
 * The general manager owns the group, so a company they belong to is only
 * their home company — not a limit on where they may work.
 */
export function isGroupLevelActor(actor: CompanyScopedActor): boolean {
  if (!actor.companyId) return true;
  return GROUP_LEVEL_ROLES.includes(actor.role ?? "");
}

/** True when the actor may read from or write to this company. */
export function canActOnCompany(
  actor: CompanyScopedActor,
  companyId: string | null | undefined
): boolean {
  if (!companyId) return true;
  if (isGroupLevelActor(actor)) return true;
  return actor.companyId === companyId;
}

/**
 * The company a list query is limited to. `null` means "every company" and
 * only a group-level user ever gets it; a company-scoped user is always
 * limited to their own company, whatever the request asked for.
 */
export function companyScopeFilter(
  actor: CompanyScopedActor,
  requested?: string | null
): string | null {
  if (!isGroupLevelActor(actor)) return actor.companyId ?? null;
  return requested || null;
}

/**
 * The company a write acts on. A company-scoped user always writes into
 * their own company, whatever the body asks for; a group-level user names
 * the company they work on and falls back to their own company.
 */
export function resolveCompanyId(
  actor: CompanyScopedActor,
  requested?: string | null
): string | null {
  if (!isGroupLevelActor(actor)) return actor.companyId ?? requested ?? null;
  return requested || actor.companyId || null;
}

// ───────────────────────────────────────────────────────────────────────────
// Financial-report scope (per-user grants)
// ───────────────────────────────────────────────────────────────────────────

/**
 * The companies whose financial reports this actor may open.
 *
 * `null` means "every company". Order of precedence:
 *   1. the general manager — always every company;
 *   2. explicit grants — exactly those companies (a grant can restrict);
 *   3. no grants but a home company — that company;
 *   4. no grants and no home company — every company (group-level user,
 *      the same access they had before grants existed).
 */
export function reportCompanyIds(actor: CompanyScopedActor): string[] | null {
  if (GROUP_LEVEL_ROLES.includes(actor.role ?? "")) return null;

  const granted = (actor.companyAccessIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );
  if (granted.length > 0) return Array.from(new Set(granted));

  if (!actor.companyId) return null;
  return [actor.companyId];
}

/** True when the actor may open this company's financial report. */
export function canViewCompanyReport(
  actor: CompanyScopedActor,
  companyId: string | null | undefined
): boolean {
  if (!companyId) return false;
  const ids = reportCompanyIds(actor);
  return ids === null || ids.includes(companyId);
}
