import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  canPerformAction,
  canViewPage,
  resolvePermissions,
  type ResolvedPermissions,
} from "@/lib/permissions-server";
import type { ActionKey } from "@/lib/rbac-catalog";
import type { Page } from "@/lib/permissions";

/** The shape every guard hands back to a route handler. */
export interface AuthedUser {
  id: string;
  role?: string;
  roleId?: string | null;
  companyId?: string | null;
  [key: string]: unknown;
}

export interface AuthedUserWithPermissions extends AuthedUser {
  permissions: ResolvedPermissions;
}

/**
 * Reads roleId alongside isActive from the row it is already fetching, so the
 * live role is known without an extra query and without trusting a stale JWT.
 */
export async function requireAuth(): Promise<AuthedUser | null> {
  const session = await auth();
  if (!session?.user) return null;

  const userId = (session.user as { id?: string }).id;
  if (!userId) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, role: true, roleId: true, companyId: true },
  });
  if (!dbUser || !dbUser.isActive) return null;

  return {
    ...(session.user as Record<string, unknown>),
    id: dbUser.id,
    role: dbUser.role,
    roleId: dbUser.roleId,
    companyId: dbUser.companyId,
  };
}

/**
 * requireAuth plus the resolved permission set. Preferred inside handlers that
 * need to check more than one thing, so the set is loaded once.
 */
export async function requireAuthWithPermissions(): Promise<AuthedUserWithPermissions | null> {
  const user = await requireAuth();
  if (!user) return null;
  const permissions = await resolvePermissions({ roleId: user.roleId, role: user.role });
  if (!permissions) return null;
  return { ...user, permissions };
}

export async function requirePageAccess(page: Page): Promise<AuthedUserWithPermissions | null> {
  const user = await requireAuthWithPermissions();
  if (!user) return null;
  if (!canViewPage(user.permissions, page)) return null;
  return user;
}

/**
 * Guard for endpoints that are legitimately backed by more than one page — a
 * company's financial report, for example, is reachable by "companies" and by
 * "reports". Passing a single page here would lock out roles that the sidebar
 * already lets through.
 */
export async function requireAnyPage(...pages: Page[]): Promise<AuthedUserWithPermissions | null> {
  const user = await requireAuthWithPermissions();
  if (!user) return null;
  return pages.some((page) => canViewPage(user.permissions, page)) ? user : null;
}

/**
 * Action-level guard. This is what stops a caller who reaches an endpoint
 * directly — Postman, curl, a stale tab — from performing something the matrix
 * does not grant them. Hiding the button in the UI is a convenience, not the
 * control.
 *
 * Returns null on denial, matching the other guards; handlers translate that
 * into 401 (not signed in) or 403 (signed in, not allowed).
 */
export async function requireAction(
  page: Page,
  action: ActionKey
): Promise<AuthedUserWithPermissions | null> {
  const user = await requireAuthWithPermissions();
  if (!user) return null;
  if (!canPerformAction(user.permissions, page, action)) return null;
  return user;
}

/**
 * As requireAction, but for a list of actions where holding any one is enough —
 * a route that both creates and updates, for instance.
 */
export async function requireAnyAction(
  page: Page,
  ...actions: ActionKey[]
): Promise<AuthedUserWithPermissions | null> {
  const user = await requireAuthWithPermissions();
  if (!user) return null;
  if (!actions.some((action) => canPerformAction(user.permissions, page, action))) return null;
  return user;
}

/**
 * Restricted to a named role. Still used for the handful of endpoints that are
 * about the system itself rather than a page — creating users, the roles
 * matrix, the data reset.
 */
export async function requireRole(...roles: string[]): Promise<AuthedUser | null> {
  const user = await requireAuth();
  if (!user) return null;
  if (!user.role || !roles.includes(user.role)) return null;
  return user;
}

/** The general manager, by role key. Used by the RBAC admin endpoints. */
export async function requireSuperAdmin(): Promise<AuthedUser | null> {
  return requireRole("GENERAL_MANAGER");
}

export { canPerformAction, canViewPage };
export type { ActionKey, Page };
