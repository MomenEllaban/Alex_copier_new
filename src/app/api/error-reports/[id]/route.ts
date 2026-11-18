import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/auth-helpers";
import { apiError, withApiErrors } from "@/lib/api-errors";

async function PATCH__raw(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAction("settings", "edit");
    if (!actor) return apiError("FORBIDDEN");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const status = body.status === "NEW" ? "NEW" : "RESOLVED";
    const report = await prisma.errorReport.update({
      where: { id },
      data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null },
    });
    return NextResponse.json(report);
  } catch (error) {
    console.error("[error-reports:PATCH]", error);
    return apiError("UPDATE_FAILED");
  }
}

export const PATCH = withApiErrors(PATCH__raw);
