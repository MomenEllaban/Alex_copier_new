import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, requireAuth } from "@/lib/auth-helpers";
import { invalidatePermissionCache } from "@/lib/permissions-server";
import { isActionKey } from "@/lib/rbac-catalog";

type Params = { params: Promise<{ id: string }> };

async function deny() {
  const authed = await requireAuth();
  return NextResponse.json(
    { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
    { status: authed ? 403 : 401 }
  );
}

/**
 * The whole catalogue plus this role's current grants, in one response. The UI
 * needs all three — pages, their actions, and what this role holds — to render
 * the tree without a second round trip.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    if (!(await requireSuperAdmin())) return deny();

    const { id } = await params;
    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        pages: { select: { pageId: true, canView: true } },
        actionPermissions: { select: { actionId: true, isAllowed: true } },
        _count: { select: { users: true } },
      },
    });
    if (!role) {
      return NextResponse.json({ error: "Role not found", code: "ROLE_NOT_FOUND" }, { status: 404 });
    }

    const pages = await prisma.page.findMany({
      where: { isActive: true },
      include: { actions: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
    });

    const pageView = new Map(role.pages.map((p) => [p.pageId, p.canView]));
    const actionAllowed = new Map(role.actionPermissions.map((a) => [a.actionId, a.isAllowed]));

    return NextResponse.json({
      role: {
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        userCount: role._count.users,
      },
      pages: pages.map((page) => ({
        id: page.id,
        key: page.key,
        name: page.name,
        icon: page.icon,
        group: page.group,
        sortOrder: page.sortOrder,
        canView: pageView.get(page.id) ?? false,
        actions: page.actions.map((action) => ({
          id: action.id,
          key: action.key,
          name: action.name,
          isAllowed: actionAllowed.get(action.id) ?? false,
        })),
      })),
    });
  } catch (error) {
    console.error("GET /api/roles/[id]/permissions failed", error);
    return NextResponse.json({ error: "Failed to fetch permissions" }, { status: 500 });
  }
}

/**
 * Replaces the role's grants with the submitted matrix.
 *
 * Written as a single transaction so a partially-applied matrix can never be
 * observed. The cache is dropped only after the transaction commits, so a
 * concurrent request never reads a half-written state.
 *
 * The general manager's role is refused outright rather than partially applied:
 * a system role that could be trimmed would let the last admin lock everyone
 * out, including themselves.
 */
export async function PUT(request: Request, { params }: Params) {
  try {
    if (!(await requireSuperAdmin())) return deny();

    const { id } = await params;
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      return NextResponse.json({ error: "Role not found", code: "ROLE_NOT_FOUND" }, { status: 404 });
    }
    if (role.isSystem) {
      return NextResponse.json(
        { error: "صلاحيات المدير العام كاملة ودايمًا ولا يمكن تعديلها", code: "SYSTEM_ROLE_PROTECTED" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const incomingPages = body.pages as Record<string, unknown> | undefined;
    const incomingActions = body.actions as Record<string, unknown> | undefined;

    if (!incomingPages || typeof incomingPages !== "object" || Array.isArray(incomingPages)) {
      return NextResponse.json(
        { error: "الصفحات المرسلة غير صالحة", code: "PAGES_INVALID" },
        { status: 400 }
      );
    }

    const pages = await prisma.page.findMany({
      where: { isActive: true },
      include: { actions: { where: { isActive: true } } },
    });
    const pageByKey = new Map(pages.map((p) => [p.key, p]));

    // Reject anything the catalogue does not contain, so a crafted request
    // cannot invent a page or an action name.
    for (const key of Object.keys(incomingPages)) {
      if (!pageByKey.has(key)) {
        return NextResponse.json(
          { error: `صفحة غير معروفة: ${key}`, code: "PAGE_UNKNOWN" },
          { status: 400 }
        );
      }
    }

    type ActionInput = { pageId: string; actionId: string; isAllowed: boolean };
    const desiredActions: ActionInput[] = [];
    const seenActions = new Set<string>();

    for (const [ref, value] of Object.entries(incomingActions ?? {})) {
      const [pageKey, actionKey] = ref.split(":");
      const page = pageByKey.get(pageKey);
      if (!page) {
        return NextResponse.json(
          { error: `صفحة غير معروفة: ${pageKey}`, code: "PAGE_UNKNOWN" },
          { status: 400 }
        );
      }
      if (!actionKey || !isActionKey(actionKey)) {
        return NextResponse.json(
          { error: `إجراء غير معروف: ${ref}`, code: "ACTION_UNKNOWN" },
          { status: 400 }
        );
      }
      const action = page.actions.find((a) => a.key === actionKey);
      if (!action) {
        // The action was retired from this page by the scanner; ignore it
        // rather than failing a save the UI could not have produced.
        continue;
      }
      seenActions.add(action.id);
      desiredActions.push({ pageId: page.id, actionId: action.id, isAllowed: value === true });
    }

    // Turn the page switch off => its actions are meaningless, so they are all
    // cleared. This keeps the stored data self-consistent no matter what the
    // client sent.
    const desiredPages = pages.map((page) => ({
      pageId: page.id,
      canView: incomingPages[page.key] === true,
    }));
    const viewablePageIds = new Set(desiredPages.filter((p) => p.canView).map((p) => p.pageId));

    // The save touches every page and every action, which over the network to
    // Neon outlasts Prisma's 5s default interactive-transaction budget. The
    // whole thing has to be atomic though, or a reader could see a matrix that
    // is half applied.
    const applied = await prisma.$transaction(
      async (tx) => {
      const before = await tx.rolePage.findMany({ where: { roleId: id } });
      const beforeMap = new Map(before.map((r) => [r.pageId, r.canView]));

      // Batched rather than row-by-row: 31 pages and ~107 actions means ~140
      // sequential round trips otherwise, which is slow enough to look like a
      // hang and to strain the transaction budget against a remote database.
      const newPageRows = pages
        .filter((page) => !beforeMap.has(page.id))
        .map((page) => ({ roleId: id, pageId: page.id, canView: incomingPages[page.key] === true }));

      const flippedPageIds = pages
        .filter((page) => beforeMap.has(page.id) && beforeMap.get(page.id) !== (incomingPages[page.key] === true))
        .map((page) => page.id);

      if (newPageRows.length > 0) await tx.rolePage.createMany({ data: newPageRows });
      if (flippedPageIds.length > 0) {
        // One statement per distinct value, rather than one per page.
        await tx.rolePage.updateMany({
          where: { roleId: id, pageId: { in: flippedPageIds }, canView: false },
          data: { canView: true },
        });
        await tx.rolePage.updateMany({
          where: { roleId: id, pageId: { in: flippedPageIds }, canView: true },
          data: { canView: false },
        });
      }

      // Every action of every page, so a page switched off loses its actions.
      const actionPageId = new Map<string, string>();
      for (const page of pages) {
        for (const action of page.actions) actionPageId.set(action.id, page.id);
      }

      const desiredByActionId = new Map(desiredActions.map((a) => [a.actionId, a]));
      const existingActions = await tx.roleActionPermission.findMany({ where: { roleId: id } });
      const existingByActionId = new Map(existingActions.map((a) => [a.actionId, a]));

      /** An action is only ever allowed while its page is viewable. */
      const isAllowedNow = (actionId: string): boolean => {
        const pageId = actionPageId.get(actionId);
        if (!pageId || !viewablePageIds.has(pageId)) return false;
        return desiredByActionId.get(actionId)?.isAllowed ?? false;
      };

      const newActionRows: { roleId: string; actionId: string; isAllowed: boolean }[] = [];
      const enableIds: string[] = [];
      const disableIds: string[] = [];

      for (const actionId of actionPageId.keys()) {
        const isAllowed = isAllowedNow(actionId);
        const existing = existingByActionId.get(actionId);

        if (!existing) {
          newActionRows.push({ roleId: id, actionId, isAllowed });
        } else if (existing.isAllowed !== isAllowed) {
          (isAllowed ? enableIds : disableIds).push(actionId);
        }
      }

      if (newActionRows.length > 0) await tx.roleActionPermission.createMany({ data: newActionRows });
      if (enableIds.length > 0) {
        await tx.roleActionPermission.updateMany({
          where: { roleId: id, actionId: { in: enableIds } },
          data: { isAllowed: true },
        });
      }
      if (disableIds.length > 0) {
        await tx.roleActionPermission.updateMany({
          where: { roleId: id, actionId: { in: disableIds } },
          data: { isAllowed: false },
        });
      }

      // Count what actually moved, for the confirmation toast.
      const pagesEnabled = desiredPages.filter((p) => p.canView && beforeMap.get(p.pageId) !== true).length;
      const pagesDisabled = desiredPages.filter((p) => !p.canView && beforeMap.get(p.pageId) === true).length;

      let actionsEnabled = 0;
      let actionsDisabled = 0;
      for (const [actionId, existing] of existingByActionId) {
        const isAllowed = isAllowedNow(actionId);
        if (isAllowed && !existing.isAllowed) actionsEnabled++;
        if (!isAllowed && existing.isAllowed) actionsDisabled++;
      }
      for (const desired of desiredActions) {
        if (!existingByActionId.has(desired.actionId) && desired.isAllowed) actionsEnabled++;
      }

      return { pagesEnabled, pagesDisabled, actionsEnabled, actionsDisabled };
      },
      { timeout: 30_000, maxWait: 10_000 }
    );

    // Touch the role so getPermissionStamp() moves and open browsers refetch.
    await prisma.role.update({ where: { id }, data: { updatedAt: new Date() } });
    invalidatePermissionCache(id);

    return NextResponse.json({ ok: true, ...applied });
  } catch (error) {
    console.error("PUT /api/roles/[id]/permissions failed", error);
    return NextResponse.json({ error: "Failed to save permissions" }, { status: 500 });
  }
}
