import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAction, type ActionKey } from "@/lib/auth-helpers";

/** PUT and DELETE share this check, so the verb's action is passed in. */
async function guardMutations(action: ActionKey) {
  const actor = await requireAction("customers", action);
  if (actor) return { actor };
  const authed = await requireAuth();
  return {
    actor: null,
    response: NextResponse.json(
      { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
      { status: authed ? 403 : 401 },
    ),
  };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { actor, response } = await guardMutations("edit");
    if (!actor && response) return response;
    const { id } = await params;

    const existing = await prisma.customerLocation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "الفرع غير موجود", code: "LOCATION_NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if ("name" in body) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "اسم الفرع مطلوب", code: "LOCATION_NAME_REQUIRED" }, { status: 400 });
      }
      data.name = name;
    }
    for (const field of ["address", "city", "governorate", "phone"] as const) {
      if (field in body) {
        const value = body[field];
        data[field] = typeof value === "string" && value.trim() !== "" ? value.trim() : null;
      }
    }
    if ("isActive" in body) data.isActive = body.isActive === true;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات للتحديث", code: "NO_CHANGES" }, { status: 400 });
    }

    const location = await prisma.customerLocation.update({ where: { id }, data });
    return NextResponse.json(location);
  } catch (error) {
    console.error("[locations] PUT failed:", error);
    return NextResponse.json({ error: "Failed to update location", code: "UPDATE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { actor, response } = await guardMutations("delete");
    if (!actor && response) return response;
    const { id } = await params;

    const existing = await prisma.customerLocation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "الفرع غير موجود", code: "LOCATION_NOT_FOUND" }, { status: 404 });
    }

    const [machinesCount, requestsCount] = await Promise.all([
      prisma.machine.count({ where: { customerLocationId: id } }),
      prisma.serviceRequest.count({ where: { locationId: id } }),
    ]);
    if (machinesCount + requestsCount > 0) {
      // Keep history consistent: deactivate instead of deleting referenced sites.
      await prisma.customerLocation.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({ message: "Location deactivated (in use)", deactivated: true });
    }

    await prisma.customerLocation.delete({ where: { id } });
    return NextResponse.json({ message: "Location deleted", deactivated: false });
  } catch (error) {
    console.error("[locations] DELETE failed:", error);
    return NextResponse.json({ error: "Failed to delete location", code: "DELETE_FAILED" }, { status: 500 });
  }
}
