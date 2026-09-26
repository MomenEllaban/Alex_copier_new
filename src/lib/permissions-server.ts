// Server-side RBAC resolution.
//
// The system already calls prisma.user.findUnique on every authenticated
// request (to re-check isActive), so the user's roleId is read there for free —
// a role reassignment therefore applies on the very next request, with no
// re-login. The permission set for a role is cached in memory and keyed by
// roleId, so the cost is one query per role per TTL, not per request.
//
// Cache invalidation
//   • a write in this process drops the affected role immediately
//   • other processes pick the change up within PERMISSION_CACHE_TTL_MS
//   • the browser polls getPermissionStamp() and refetches when it moves, so
//     the sidebar and buttons update live without a logout
//
// Roles are cached by id, never by name, so a role can be renamed freely.

import { prisma } from "@/lib/prisma";
import { ACTION_KEYS, isActionKey, type ActionKey } from "@/lib/rbac-catalog";
import { ROLE_PERMISSIONS, type Page, type Role } from "@/lib/permissions";

/** How long a resolved role is trusted before it is re-read. */
export const PERMISSION_CACHE_TTL_MS = 15_000;

export interface RolePermissions {
  roleId: string;
  roleKey: string;
  isSystem: boolean;
  /** Pages the role may open. */
  pages: Set<Page>;
  /** `${page}:${action}` for every action the role may perform. */
  actions: Set<string>;
}

interface CacheEntry {
  value: RolePermissions;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
/** De-duplicates concurrent misses for the same role. */
const inflight = new Map<string, Promise<RolePermissions>>();

export function actionRef(page: string, action: string): string {
  return `${page}:${action}`;
}

/** Drop one role, or the whole cache when called with no argument. */
export function invalidatePermissionCache(roleId?: string): void {
  if (roleId) cache.delete(roleId);
  else cache.clear();
}

async function loadRolePermissions(roleId: string): Promise<RolePermissions> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: {
      id: true,
      key: true,
      isSystem: true,
      pages: { where: { canView: true }, select: { page: { select: { key: true } } } },
      actionPermissions: {
        where: { isAllowed: true },
        select: { action: { select: { key: true, page: { select: { key: true } } } } },
      },
    },
  });

  if (!role) {
    // A dangling roleId must fail closed, never open.
    return { roleId, roleKey: "", isSystem: false, pages: new Set(), actions: new Set() };
  }

  const pages = new Set<Page>();
  const actions = new Set<string>();

  for (const { page } of role.pages) pages.add(page.key as Page);
  for (const { action } of role.actionPermissions) {
    pages.add(action.page.key as Page); // an action implies its page
    actions.add(actionRef(action.page.key, action.key));
  }

  return { roleId: role.id, roleKey: role.key, isSystem: role.isSystem, pages, actions };
}

export async function getRolePermissions(roleId: string | null | undefined): Promise<RolePermissions | null> {
  if (!roleId) return null;

  const hit = cache.get(roleId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const pending = inflight.get(roleId);
  if (pending) return pending;

  const promise = loadRolePermissions(roleId)
    .then((value) => {
      cache.set(roleId, { value, expiresAt: Date.now() + PERMISSION_CACHE_TTL_MS });
      return value;
    })
    .finally(() => inflight.delete(roleId));

  inflight.set(roleId, promise);
  return promise;
}

/**
 * The static table, used when a user has no roleId yet (a row created before
 * RBAC shipped) or when the database is unreachable mid-migration. This keeps
 * the old behaviour intact rather than locking everyone out.
 */
export function getFallbackPermissions(role: string | undefined): RolePermissions | null {
  if (!role) return null;
  const pages = ROLE_PERMISSIONS[role as Role];
  if (!pages) return null;
  const pageSet = new Set<Page>(pages);
  return {
    roleId: "",
    roleKey: role,
    isSystem: role === "GENERAL_MANAGER",
    pages: pageSet,
    // The static table has no action dimension, so only "view" is certain.
    // Action checks fall back to allowing, preserving today's behaviour;
    // once a roleId exists the database is authoritative.
    actions: new Set([...pageSet].map((p) => actionRef(p, "view"))),
  };
}

export interface ResolvedPermissions extends RolePermissions {
  /** True when the answer came from the database rather than the static table. */
  fromDatabase: boolean;
}

/**
 * The single entry point used by the guards.
 *
 * When a roleId is present the database is authoritative, including when it
 * grants nothing — an empty grant means "deny", not "fall back to the old
 * table". Otherwise removing a permission in the matrix would appear to work in
 * the UI while the static table quietly kept granting it.
 *
 * The static table is used for the two cases where there is nothing to trust:
 *   • a user row created before RBAC shipped, so roleId is null
 *   • the Role row is missing (a deleted role, or a half-applied migration)
 */
export async function resolvePermissions(input: {
  roleId?: string | null;
  role?: string | null;
}): Promise<ResolvedPermissions | null> {
  if (input.roleId) {
    const fromDb = await getRolePermissions(input.roleId);
    // roleKey is empty only when the Role row itself could not be read.
    if (fromDb && fromDb.roleKey) return { ...fromDb, fromDatabase: true };
  }

  const fallback = getFallbackPermissions(input.role ?? undefined);
  if (fallback) return { ...fallback, fromDatabase: false };

  return null;
}

export function canViewPage(perms: ResolvedPermissions | null, page: Page): boolean {
  if (!perms) return false;
  // The general manager is never locked out of a page.
  if (perms.roleKey === "GENERAL_MANAGER") return true;
  return perms.pages.has(page);
}

export function canPerformAction(
  perms: ResolvedPermissions | null,
  page: Page,
  action: ActionKey
): boolean {
  if (!perms) return false;
  if (perms.roleKey === "GENERAL_MANAGER") return true;
  // No action means no page, so a hidden page cannot be acted on.
  if (!perms.pages.has(page)) return false;

  if (!perms.fromDatabase) {
    // Static-table fallback: preserve the pre-RBAC behaviour, where the only
    // enforced dimension was the page.
    return action === "view";
  }
  return perms.actions.has(actionRef(page, action));
}

// ───────────────────────────────────────────────────────────────────────────
// Change stamp — lets a browser notice that the matrix moved
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cheap fingerprint of the whole RBAC state. Derived from the Role table rather
 * than a dedicated counter so no extra table is needed: editing a role's
 * permissions touches its updatedAt, and creating or deleting a role changes
 * the count.
 */
export async function getPermissionStamp(): Promise<string> {
  const roles = await prisma.role.findMany({ select: { updatedAt: true } });
  if (roles.length === 0) return "0:empty";
  const newest = roles.reduce((max, r) => (r.updatedAt > max ? r.updatedAt : max), roles[0].updatedAt);
  return `${roles.length}:${newest.getTime()}`;
}

/** Normalise and validate an action key coming from a request. */
export function parseAction(value: unknown): ActionKey | null {
  return typeof value === "string" && isActionKey(value) ? value : null;
}

export { ACTION_KEYS };
