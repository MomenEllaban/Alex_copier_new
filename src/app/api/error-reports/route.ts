import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAction, requireAuth } from "@/lib/auth-helpers";
import { apiError, withApiErrors } from "@/lib/api-errors";

const reportSchema = z.object({
  code: z.string().min(1).max(80),
  messageAr: z.string().max(1000),
  messageEn: z.string().max(1000),
  hintAr: z.string().max(1000).optional(),
  hintEn: z.string().max(1000).optional(),
  requestId: z.string().max(80).optional(),
  path: z.string().max(300).optional(),
  action: z.string().max(120).optional(),
  details: z.string().max(2000).optional(),
  at: z.string().max(60).optional(),
  source: z.enum(["api", "client"]).optional(),
});

/**
 * Anyone (including users on public statement links) can report a failed
 * action. The payload is validated and stored so support can act on it.
 */
async function POST__raw(request: Request) {
  try {
    const parsed = reportSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", {
        ar: "بيانات البلاغ غير صالحة. أعد محاولة الإرسال من نافذة تفاصيل الخطأ.",
        en: "Invalid report payload. Retry from the error details dialog.",
      });
    }
    const actor = await requireAuth();
    const payload = parsed.data;
    const report = await prisma.errorReport.create({
      data: {
        code: payload.code,
        messageAr: payload.messageAr,
        messageEn: payload.messageEn,
        hintAr: payload.hintAr,
        hintEn: payload.hintEn,
        requestId: payload.requestId,
        path: payload.path,
        action: payload.action,
        details: payload.details,
        userId: actor?.id,
        userEmail: typeof actor?.email === "string" ? actor.email : undefined,
      },
    });
    return NextResponse.json({ id: report.id }, { status: 201 });
  } catch (error) {
    console.error("[error-reports:POST]", error);
    return apiError("CREATE_FAILED");
  }
}

/** Only users with settings access can read the report inbox. */
async function GET__raw(request: Request) {
  try {
    const actor = await requireAction("settings", "view");
    if (!actor) return apiError("FORBIDDEN");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "NEW";
    const reports = await prisma.errorReport.findMany({
      where: status === "ALL" ? undefined : { status },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(reports);
  } catch (error) {
    console.error("[error-reports:GET]", error);
    return apiError("FETCH_FAILED");
  }
}

export const GET = withApiErrors(GET__raw);
export const POST = withApiErrors(POST__raw);
