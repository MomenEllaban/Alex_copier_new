import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, requireAuth } from "@/lib/auth-helpers";

/** Reject non-admins with the same shape the rest of the app uses. */
async function deny() {
  const authed = await requireAuth();
  return NextResponse.json(
    {
      error: authed ? "Forbidden" : "Unauthorized",
      code: authed ? "FORBIDDEN" : "UNAUTHORIZED",
    },
    { status: authed ? 403 : 401 }
  );
}

const KEY_REGEX = /^[a-z][a-z0-9_]{1,40}$/;

export async function GET() {
  try {
    if (!(await requireSuperAdmin())) return deny();

    const roles = await prisma.role.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { users: true } },
        pages: { where: { canView: true }, select: { pageId: true } },
        actionPermissions: { where: { isAllowed: true }, select: { actionId: true } },
      },
    });

    return NextResponse.json(
      roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        sortOrder: role.sortOrder,
        userCount: role._count.users,
        pageCount: role.pages.length,
        actionCount: role.actionPermissions.length,
      }))
    );
  } catch (error) {
    console.error("GET /api/roles failed", error);
    return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await requireSuperAdmin())) return deny();

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const key = typeof body.key === "string" ? body.key.trim().toLowerCase() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (!name) {
      return NextResponse.json(
        { error: "اسم الدور مطلوب", code: "ROLE_NAME_REQUIRED" },
        { status: 400 }
      );
    }
    if (!KEY_REGEX.test(key)) {
      return NextResponse.json(
        {
          error: "مفتاح الدور لازم يكون حروف إنجليزية صغيرة وأرقام فقط، زي: sales_lead",
          code: "ROLE_KEY_INVALID",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.role.findUnique({ where: { key } });
    if (existing) {
      return NextResponse.json(
        { error: "يوجد دور بنفس المفتاح", code: "ROLE_KEY_TAKEN" },
        { status: 409 }
      );
    }

    // Copy the starting permissions from a chosen role so the new role is
    // useful immediately instead of granting nothing.
    const copyFrom = typeof body.copyFromKey === "string" ? body.copyFromKey : null;
    const source = copyFrom ? await prisma.role.findUnique({ where: { key: copyFrom } }) : null;

    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          key,
          name,
          description: description || null,
          isSystem: false,
          sortOrder: 900,
        },
      });

      if (source) {
        const [sourcePages, sourceActions] = await Promise.all([
          tx.rolePage.findMany({ where: { roleId: source.id, canView: true } }),
          tx.roleActionPermission.findMany({ where: { roleId: source.id, isAllowed: true } }),
        ]);
        if (sourcePages.length > 0) {
          await tx.rolePage.createMany({
            data: sourcePages.map((p) => ({ roleId: created.id, pageId: p.pageId, canView: true })),
          });
        }
        if (sourceActions.length > 0) {
          await tx.roleActionPermission.createMany({
            data: sourceActions.map((a) => ({ roleId: created.id, actionId: a.actionId, isAllowed: true })),
          });
        }
      }

      return created;
    });

    return NextResponse.json({ id: role.id, key: role.key, name: role.name }, { status: 201 });
  } catch (error) {
    console.error("POST /api/roles failed", error);
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
  }
}
