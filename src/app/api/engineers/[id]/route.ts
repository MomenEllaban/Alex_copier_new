import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePageAccess("engineers");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const { id } = await params;
    const engineer = await prisma.engineer.findUnique({
      where: { id },
      include: {
        areas: true,
        skills: true,
        serviceRequests: {
          include: { customer: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
        visits: {
          include: { serviceRequest: { select: { requestNumber: true } } },
          orderBy: { visitedAt: "desc" },
          take: 50,
        },
        settlements: { select: { settlementNumber: true, amount: true, status: true, createdAt: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!engineer) {
      return NextResponse.json({ error: "Engineer not found" }, { status: 404 });
    }

    return NextResponse.json(engineer);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch engineer" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("engineers");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const { areas, skills, ...data } = body;

    const existing = await prisma.engineer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "المهندس غير موجود" }, { status: 404 });
    }

    // Link/unlink a login account to this engineer.
    let userId: string | null | undefined;
    if ("userId" in body) {
      if (typeof body.userId === "string" && body.userId !== "") {
        const linkedUser = await prisma.user.findUnique({ where: { id: body.userId } });
        if (!linkedUser) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 400 });
        if (linkedUser.role !== "ENGINEER") {
          return NextResponse.json({ error: "الحساب المرتبط يجب أن يكون بدور مهندس" }, { status: 400 });
        }
        const taken = await prisma.engineer.findUnique({ where: { userId: linkedUser.id } });
        if (taken && taken.id !== id) {
          return NextResponse.json({ error: "هذا الحساب مرتبط بمهندس آخر" }, { status: 409 });
        }
        userId = linkedUser.id;
      } else {
        userId = null;
      }
    }

    if (areas) {
      await prisma.engineerArea.deleteMany({ where: { engineerId: id } });
    }
    if (skills) {
      await prisma.engineerSkill.deleteMany({ where: { engineerId: id } });
    }

    const engineer = await prisma.engineer.update({
      where: { id },
      data: {
        ...(userId !== undefined ? { userId } : {}),
        ...data,
        ...(areas && {
          areas: {
            create: areas.map((a: { areaName: string; isDefault?: boolean }) => ({
              areaName: a.areaName,
              isDefault: a.isDefault ?? true,
            })),
          },
        }),
        ...(skills && {
          skills: {
            create: skills.map((s: { modelType: string; skillLevel?: number }) => ({
              modelType: s.modelType,
              skillLevel: s.skillLevel ?? 1,
            })),
          },
        }),
      },
      include: {
        areas: true,
        skills: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(engineer);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "هذا الحساب مرتبط بمهندس آخر" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update engineer" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("engineers");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const role = (actor as { role?: string }).role;
    if (!["GENERAL_MANAGER", "COMPANY_MANAGER", "WORKSHOP_MANAGER"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    // Engineers referenced by visits/requests/settlements must never vanish:
    // deactivate instead of deleting.
    const [visits, requests] = await Promise.all([
      prisma.visit.count({ where: { engineerId: id } }),
      prisma.serviceRequest.count({ where: { engineerId: id } }),
    ]);
    if (visits > 0 || requests > 0) {
      await prisma.engineer.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({
        message: "لا يمكن حذف مهندس له سجل عمل — تم تعطيل الحساب بدلًا من ذلك",
        deactivated: true,
      });
    }

    await prisma.engineer.delete({ where: { id } });
    return NextResponse.json({ message: "Engineer deleted" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete engineer" }, { status: 500 });
  }
}
