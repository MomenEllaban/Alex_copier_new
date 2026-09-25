import { auth } from "@/auth";
import { hasPageAccess, type Page } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return null;
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });
  if (!dbUser || !dbUser.isActive) {
    return null;
  }
  return session.user;
}

export async function requirePageAccess(page: Page) {
  const user = await requireAuth();
  if (!user) return null;
  const role = (user as { role?: string }).role;
  if (!hasPageAccess(role, page)) return null;
  return user;
}

/**
 * Guard for endpoints that are legitimately backed by more than one page — a
 * company's financial report, for example, is reachable by "companies" and by
 * "reports". Passing a single page here would lock out roles that the sidebar
 * already lets through.
 */
export async function requireAnyPage(...pages: Page[]) {
  const user = await requireAuth();
  if (!user) return null;
  const role = (user as { role?: string }).role;
  return pages.some((page) => hasPageAccess(role, page)) ? user : null;
}

export async function requireRole(...roles: string[]) {
  const user = await requireAuth();
  if (!user) return null;
  const role = (user as { role?: string }).role;
  if (!role || !roles.includes(role)) return null;
  return user;
}
