import { withApiErrors } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireSuperAdmin } from "@/lib/auth-helpers";
import { ROLES } from "@/lib/permissions";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function DELETE__raw(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireSuperAdmin();
    if (!admin) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const { id } = await params;
    const target = await prisma.user.findUnique({
      where: { id },
      include: {
        engineer: true,
      },
    });

    if (!target) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    if (target.id === admin.id) {
      return NextResponse.json({ error: "لا يمكنك حذف حسابك الشخصي" }, { status: 400 });
    }

    if (target.role === "GENERAL_MANAGER") {
      return NextResponse.json(
        { error: "لا يمكن حذف حساب مسؤول آخر" },
        { status: 403 }
      );
    }

    if (target.role === "ENGINEER") {
      const engineerId = target.engineer?.id;
      if (engineerId) {
        const hasLinkedRecords = await prisma.$transaction(async (tx) => {
          const [assignments, visits, settlements, custody, salaries, warranties] = await Promise.all([
            tx.serviceRequest.count({ where: { engineerId } }),
            tx.visit.count({ where: { engineerId } }),
            tx.settlement.count({ where: { engineerId } }),
            tx.sparePartCustody.count({ where: { engineerId } }),
            tx.engineerSalary.count({ where: { engineerId } }),
            tx.warranty.count({ where: { engineerId } }),
          ]);

          return assignments + visits + settlements + custody + salaries + warranties > 0;
        });

        if (hasLinkedRecords) {
          return NextResponse.json(
            { error: "لا يمكن حذف هذا المستخدم لأنه لديه سجلات مرتبطة مثل الطلبات أو الزيارات أو المواد المخصصة." },
            { status: 409 }
          );
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      const engineerProfile = await tx.engineer.findUnique({ where: { userId: id } });

      if (engineerProfile) {
        await tx.serviceRequest.updateMany({
          where: { engineerId: engineerProfile.id },
          data: { engineerId: null },
        });
        await tx.settlement.updateMany({
          where: { engineerId: engineerProfile.id },
          data: { engineerId: null },
        });
        await tx.warranty.updateMany({
          where: { engineerId: engineerProfile.id },
          data: { engineerId: null },
        });
        await tx.engineer.delete({ where: { id: engineerProfile.id } });
      }

      await tx.session.deleteMany({ where: { userId: id } });
      await tx.notification.deleteMany({
        where: { OR: [{ userId: id }, { senderId: id }] },
      });
      await tx.user.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[users] DELETE failed:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}

async function PUT__raw(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireSuperAdmin();
    if (!admin) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized" },
        { status: authed ? 403 : 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    if (target.id === admin.id && ("role" in body || "isActive" in body)) {
      return NextResponse.json(
        { error: "لا يمكنك تعديل دور أو حالة حسابك الشخصي" },
        { status: 400 }
      );
    }

    if (target.role === "GENERAL_MANAGER" && target.id !== admin.id) {
      return NextResponse.json(
        { error: "لا يمكن تعديل حساب مسؤول آخر" },
        { status: 403 }
      );
    }

    const data: Record<string, unknown> = {};

    if ("name" in body) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 });
      }
      data.name = name;
    }

    if ("email" in body) {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!EMAIL_REGEX.test(email)) {
        return NextResponse.json({ error: "صيغة البريد الإلكتروني غير صحيحة" }, { status: 400 });
      }
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: "البريد الإلكتروني مستخدم بالفعل" }, { status: 409 });
      }
      data.email = email;
    }

    if ("password" in body && body.password !== "") {
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < 6) {
        return NextResponse.json(
          { error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" },
          { status: 400 }
        );
      }
      data.passwordHash = await hash(password, 10);
    }

    if ("role" in body) {
      if (!ROLES.includes(body.role)) {
        return NextResponse.json({ error: "الدور غير صالح" }, { status: 400 });
      }
      data.role = body.role;
    }

    if ("isActive" in body) {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json({ error: "قيمة الحالة غير صالحة" }, { status: 400 });
      }
      data.isActive = body.isActive;
    }

    if ("companyId" in body) {
      const companyId =
        typeof body.companyId === "string" && body.companyId !== "" ? body.companyId : null;
      if (companyId) {
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        if (!company) {
          return NextResponse.json({ error: "الشركة غير موجودة" }, { status: 400 });
        }
      }
      data.companyId = companyId;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات للتحديث" }, { status: 400 });
    }

    // Business rule: ENGINEER users always keep a matching engineer profile.
    // Role/status changes sync the profile (create / reactivate / deactivate).
    const newRole = (data.role as string | undefined) ?? target.role;
    const newActive = (data.isActive as boolean | undefined) ?? target.isActive;
    const roleChanged = "role" in data && data.role !== target.role;

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          companyId: true,
          isActive: true,
          createdAt: true,
        },
      });

      const profile = await tx.engineer.findUnique({ where: { userId: id } });
      if (newRole === "ENGINEER") {
        if (!profile) {
          await tx.engineer.create({ data: { userId: id, name: updated.name, isActive: newActive } });
        } else if (roleChanged || "isActive" in data) {
          await tx.engineer.update({ where: { id: profile.id }, data: { isActive: newActive } });
        }
      } else if (profile && (roleChanged || ("isActive" in data && !newActive))) {
        // Leaving the engineer role (or suspending the account) hides the
        // technician from assignment lists without destroying work history.
        await tx.engineer.update({ where: { id: profile.id }, data: { isActive: false } });
      }

      return updated;
    });

    return NextResponse.json(user);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "البريد الإلكتروني مستخدم بالفعل" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export const PUT = withApiErrors(PUT__raw);
export const DELETE = withApiErrors(DELETE__raw);
