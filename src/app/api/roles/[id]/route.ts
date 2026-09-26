import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, requireAuth } from "@/lib/auth-helpers";
import { invalidatePermissionCache } from "@/lib/permissions-server";

async function deny() {
  const authed = await requireAuth();
  return NextResponse.json(
    { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
    { status: authed ? 403 : 401 }
  );
}

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    if (!(await requireSuperAdmin())) return deny();

    const { id } = await params;
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      return NextResponse.json({ error: "Role not found", code: "ROLE_NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();

    // The general manager is the system's root of trust: its name and key are
    // fixed, and only its description may be edited.
    if (role.isSystem) {
      const description =
        typeof body.description === "string" ? body.description.trim() : role.description ?? "";
      if (typeof body.name === "string" && body.name.trim() !== role.name) {
        return NextResponse.json(
          { error: "دور النظام محمي ولا يمكن تغيير اسمه", code: "SYSTEM_ROLE_PROTECTED" },
          { status: 403 }
        );
      }
      const updated = await prisma.role.update({ where: { id }, data: { description: description || null } });
      invalidatePermissionCache(id);
      return NextResponse.json({ id: updated.id, name: updated.name, description: updated.description });
    }

    const name = typeof body.name === "string" ? body.name.trim() : role.name;
    if (!name) {
      return NextResponse.json({ error: "اسم الدور مطلوب", code: "ROLE_NAME_REQUIRED" }, { status: 400 });
    }
    const description =
      typeof body.description === "string" ? body.description.trim() : role.description ?? "";

    const updated = await prisma.role.update({
      where: { id },
      data: { name, description: description || null },
    });

    // A rename must reach cached permission sets, which are keyed by id.
    invalidatePermissionCache(id);

    return NextResponse.json({ id: updated.id, name: updated.name, description: updated.description });
  } catch (error) {
    console.error("PATCH /api/roles/[id] failed", error);
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    if (!(await requireSuperAdmin())) return deny();

    const { id } = await params;
    const role = await prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) {
      return NextResponse.json({ error: "Role not found", code: "ROLE_NOT_FOUND" }, { status: 404 });
    }

    if (role.isSystem) {
      return NextResponse.json(
        { error: "دور النظام محمي ولا يمكن حذفه", code: "SYSTEM_ROLE_PROTECTED" },
        { status: 403 }
      );
    }

    if (role._count.users > 0) {
      return NextResponse.json(
        {
          error: `يوجد ${role._count.users} مستخدم مرتبط بهذا الدور. انقلهم لدور تاني الأول.`,
          code: "ROLE_IN_USE",
          userCount: role._count.users,
        },
        { status: 409 }
      );
    }

    // RolePage and RoleActionPermission cascade from Role.
    await prisma.role.delete({ where: { id } });
    invalidatePermissionCache(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/roles/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete role" }, { status: 500 });
  }
}
