import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, requireAuth } from "@/lib/auth-helpers";
import { reportCompanyIds } from "@/lib/company-scope";

async function deny() {
  const authed = await requireAuth();
  return NextResponse.json(
    { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
    { status: authed ? 403 : 401 }
  );
}

/**
 * Per-user access to the financial report of each company.
 *
 * The permissions matrix is per role; this is the one axis that has to be per
 * user — two accountants can hold the same role and still need a different set
 * of companies. The rows written here are read by `reportCompanyIds` in
 * `@/lib/company-scope`, so a save takes effect on the next request (auth is
 * re-read from the database, not from the token).
 *
 * Sitting under /api/roles keeps it next to the screen that edits it and
 * outside the action matrix: it administers access rather than operating a
 * business page, exactly like the other /api/roles endpoints.
 */
export async function GET() {
  try {
    if (!(await requireSuperAdmin())) return deny();

    const [companies, users] = await Promise.all([
      prisma.company.findMany({
        select: { id: true, name: true, nameAr: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          companyId: true,
          companyAccess: { select: { companyId: true } },
          company: { select: { name: true, nameAr: true } },
        },
        orderBy: [{ role: "asc" }, { name: "asc" }],
      }),
    ]);

    return NextResponse.json({
      companies,
      users: users.map((user) => {
        const explicitCompanyIds = user.companyAccess.map((row) => row.companyId);
        // null = every company (general manager, or a group-level user with no
        // home company and no explicit grant).
        const effectiveCompanyIds = reportCompanyIds({
          id: user.id,
          role: user.role,
          companyId: user.companyId,
          companyAccessIds: explicitCompanyIds,
        });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          companyName: user.company?.nameAr || user.company?.name || null,
          explicitCompanyIds,
          effectiveCompanyIds,
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/roles/company-access failed", error);
    return NextResponse.json(
      { error: "Failed to fetch company access", code: "FETCH_FAILED" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    if (!(await requireSuperAdmin())) return deny();

    const body = (await request.json().catch(() => null)) as {
      userId?: unknown;
      companyIds?: unknown;
    } | null;

    const userId = typeof body?.userId === "string" ? body.userId : "";
    const rawIds = body?.companyIds;
    if (!userId || !Array.isArray(rawIds)) {
      return NextResponse.json(
        { error: "userId and companyIds are required", code: "INPUT_INVALID" },
        { status: 400 }
      );
    }

    const companyIds = Array.from(
      new Set(
        rawIds.filter(
          (value): value is string => typeof value === "string" && value.length > 0
        )
      )
    );

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found", code: "USER_NOT_FOUND" }, { status: 404 });
    }
    // The general manager sees every company by definition; a row here would be
    // silently ignored, which is worse than refusing the save.
    if (user.role === "GENERAL_MANAGER") {
      return NextResponse.json(
        { error: "The general manager always sees every company", code: "GENERAL_MANAGER_PROTECTED" },
        { status: 403 }
      );
    }

    if (companyIds.length > 0) {
      const found = await prisma.company.count({ where: { id: { in: companyIds } } });
      if (found !== companyIds.length) {
        return NextResponse.json(
          { error: "One of the companies does not exist", code: "COMPANY_UNKNOWN" },
          { status: 400 }
        );
      }
    }

    // An empty list means "no explicit grant": the user falls back to their
    // home company (or to every company when they have none). This is also how
    // the screen's Reset button works.
    await prisma.$transaction(async (tx) => {
      await tx.userCompanyAccess.deleteMany({ where: { userId } });
      if (companyIds.length > 0) {
        await tx.userCompanyAccess.createMany({
          data: companyIds.map((companyId) => ({ userId, companyId })),
        });
      }
    });

    return NextResponse.json({ ok: true, userId, companyIds });
  } catch (error) {
    console.error("PUT /api/roles/company-access failed", error);
    return NextResponse.json(
      { error: "Failed to save company access", code: "UPDATE_FAILED" },
      { status: 500 }
    );
  }
}
