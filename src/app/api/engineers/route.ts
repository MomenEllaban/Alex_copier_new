import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

const OPEN_STATUSES = ["NEW", "ASSIGNED", "VISITED", "REASSIGNED"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  try {
    const actor = await requireAuth();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const engineers = await prisma.engineer.findMany({
      include: {
        areas: true,
        skills: true,
        user: { select: { id: true, name: true, email: true } },
        serviceRequests: { select: { id: true, status: true } },
        _count: { select: { customers: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      engineers.map((e) => ({
        ...e,
        openAssignedCount: e.serviceRequests.filter((r) => OPEN_STATUSES.includes(r.status)).length,
        assignedCustomersCount: e._count.customers,
        serviceRequests: undefined,
        _count: undefined,
      })),
    );
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch engineers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePageAccess("engineers");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const body = await request.json();
    const { areas, skills, ...data } = body;

    if (!data.name || String(data.name).trim() === "") {
      return NextResponse.json({ error: "اسم المهندس مطلوب", code: "NAME_REQUIRED" }, { status: 400 });
    }

    // Business rule: every engineer owns a login account. Either link an
    // existing ENGINEER user, or create the account inline.
    const name = String(data.name).trim();
    const linkUserId =
      typeof data.userId === "string" && data.userId !== "" ? data.userId : null;
    const accountEmail =
      typeof data.accountEmail === "string" ? data.accountEmail.trim().toLowerCase() : "";
    const accountPassword = typeof data.accountPassword === "string" ? data.accountPassword : "";

    if (linkUserId && (accountEmail || accountPassword)) {
      return NextResponse.json(
        { error: "اختر إما ربط حساب موجود أو إنشاء حساب جديد — لا الاثنين معًا", code: "ACCOUNT_CHOICE_CONFLICT" },
        { status: 400 },
      );
    }

    let userId: string | null = null;
    if (linkUserId) {
      const linkedUser = await prisma.user.findUnique({ where: { id: linkUserId } });
      if (!linkedUser) return NextResponse.json({ error: "المستخدم غير موجود", code: "USER_NOT_FOUND" }, { status: 400 });
      if (linkedUser.role !== "ENGINEER") {
        return NextResponse.json({ error: "الحساب المرتبط يجب أن يكون بدور مهندس", code: "LINKED_USER_MUST_BE_ENGINEER" }, { status: 400 });
      }
      const taken = await prisma.engineer.findUnique({ where: { userId: linkedUser.id } });
      if (taken) return NextResponse.json({ error: "هذا الحساب مرتبط بمهندس آخر", code: "ACCOUNT_ALREADY_LINKED" }, { status: 409 });
      userId = linkedUser.id;
    } else {
      if (!accountEmail || !accountPassword) {
        return NextResponse.json(
          { error: "البريد الإلكتروني وكلمة المرور مطلوبان لإنشاء حساب المهندس", code: "ACCOUNT_FIELDS_REQUIRED" },
          { status: 400 },
        );
      }
      if (!EMAIL_REGEX.test(accountEmail)) {
        return NextResponse.json({ error: "صيغة البريد الإلكتروني غير صحيحة", code: "INVALID_EMAIL" }, { status: 400 });
      }
      if (accountPassword.length < 6) {
        return NextResponse.json(
          { error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", code: "PASSWORD_TOO_SHORT" },
          { status: 400 },
        );
      }
      const emailTaken = await prisma.user.findUnique({ where: { email: accountEmail } });
      if (emailTaken) {
        return NextResponse.json({ error: "البريد الإلكتروني مستخدم بالفعل", code: "DUPLICATE_EMAIL" }, { status: 409 });
      }
    }

    const passwordHash = !linkUserId ? await hash(accountPassword, 10) : null;

    delete data.userId;
    delete data.accountEmail;
    delete data.accountPassword;

    // Engineer + account are created atomically so no engineer ever exists
    // without a login.
    const engineer = await prisma.$transaction(async (tx) => {
      let linkedId = userId;
      if (!linkUserId) {
        const account = await tx.user.create({
          data: { name, email: accountEmail, passwordHash: passwordHash as string, role: "ENGINEER" },
          select: { id: true },
        });
        linkedId = account.id;
      }
      return tx.engineer.create({
        data: {
          ...data,
          name,
          userId: linkedId,
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
    });

    return NextResponse.json(engineer, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create engineer" }, { status: 500 });
  }
}
