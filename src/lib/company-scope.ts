/**
 * Company scoping rules shared by every module that acts on a company.
 *
 * A user is either tied to one company (`User.companyId`) — the accountant of
 * "شركة القطاعي" for example — or is a group-level user who works across the
 * group: the general manager, or an HR manager with no home company.
 *
 * The rule is the same one the notifications already use
 * (`src/lib/notification-recipients.ts`): a user may act on a company when
 * they have no company of their own, when they are the general manager, or
 * when it is their own company. Expressing it once here keeps every route
 * from inventing its own version of "whose company is this?".
 */

export interface CompanyScopedActor {
  id: string;
  role?: string | null;
  companyId?: string | null;
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
