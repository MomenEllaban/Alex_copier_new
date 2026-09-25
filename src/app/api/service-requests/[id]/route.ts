import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { notifyServiceRequestAssigned, notifyServiceRequestStatusChanged } from "@/lib/notifications";
import { traceError } from "@/lib/prisma-errors";

async function getScopedRequest(id: string, user: { id: string; role?: string }) {
  const serviceRequest = await prisma.serviceRequest.findUnique({
    where: { id },
    include: {
      customer: true,
      location: true,
      machine: true,
      engineer: true,
      problems: true,
      visits: {
        include: { engineer: true },
        orderBy: { visitedAt: "desc" },
      },
    },
  });

  if (!serviceRequest) return { notFound: true as const };
  // Engineers may only access requests assigned to them.
  if (user.role === "ENGINEER") {
    const engineer = await prisma.engineer.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (serviceRequest.engineerId !== engineer?.id) return { forbidden: true as const };
  }
  return { serviceRequest };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePageAccess("serviceRequests");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const { id } = await params;
    const result = await getScopedRequest(id, user as { id: string; role?: string });
    if ("notFound" in result) {
      return NextResponse.json({ error: "Service request not found" }, { status: 404 });
    }
    if ("forbidden" in result) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(result.serviceRequest);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch service request" }, { status: 500 });
  }
}

const VALID_STATUSES = ["NEW", "ASSIGNED", "VISITED", "RESOLVED", "NOT_RESOLVED", "REASSIGNED", "CLOSED"];

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePageAccess("serviceRequests");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const actorRole = (actor as { role?: string }).role;
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.serviceRequest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "طلب الصيانة غير موجود" }, { status: 404 });
    }

    // Engineers can only progress their own assigned requests through visit statuses.
    if (actorRole === "ENGINEER") {
      const engineer = await prisma.engineer.findUnique({ where: { userId: actor.id }, select: { id: true } });
      if (existing.engineerId !== engineer?.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const allowedStatuses = ["VISITED", "RESOLVED", "NOT_RESOLVED"];
      if ((body.engineerId && body.engineerId !== existing.engineerId) || body.priority || body.customerId) {
        return NextResponse.json({ error: "لا يمكنك تعديل هذه البيانات" }, { status: 403 });
      }
      if (body.status && !allowedStatuses.includes(body.status)) {
        return NextResponse.json({ error: "حالة غير مسموحة" }, { status: 403 });
      }
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "قيمة الحالة غير صالحة" }, { status: 400 });
    }
    if ("engineerId" in body && body.engineerId) {
      const engineer = await prisma.engineer.findUnique({ where: { id: body.engineerId }, select: { id: true } });
      if (!engineer) {
        return NextResponse.json({ error: "المهندس غير موجود", code: "ENGINEER_NOT_FOUND" }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {};
    if ("status" in body) data.status = body.status;
    if ("engineerId" in body) data.engineerId = body.engineerId || null;
    if ("description" in body) data.description = body.description;
    if ("priority" in body && actorRole !== "ENGINEER") data.priority = body.priority;

    // Auto-status: assigning an engineer to a NEW request moves it to ASSIGNED.
    if (data.engineerId && !data.status && existing.status === "NEW") {
      data.status = "ASSIGNED";
    }
    if (data.engineerId && existing.engineerId && data.engineerId !== existing.engineerId && data.status === "ASSIGNED") {
      // keep ASSIGNED; UI reports reassignment via notification
    }

    const serviceRequest = await prisma.serviceRequest.update({
      where: { id },
      data,
      include: {
        customer: true,
        location: true,
        machine: true,
        engineer: true,
        problems: true,
        visits: true,
      },
    });

    // Business events
    if (data.engineerId && data.engineerId !== existing.engineerId) {
      void notifyServiceRequestAssigned({
        requestId: serviceRequest.id,
        requestNumber: serviceRequest.requestNumber,
        engineerId: data.engineerId as string,
        engineerName: serviceRequest.engineer?.name ?? null,
        reassigned: Boolean(existing.engineerId),
        actorId: actor.id,
      }).catch(() => undefined);
    }
    if (data.status && data.status !== existing.status) {
      void notifyServiceRequestStatusChanged({
        requestId: serviceRequest.id,
        requestNumber: serviceRequest.requestNumber,
        status: data.status as string,
        actorId: actor.id,
      }).catch(() => undefined);
    }

    return NextResponse.json(serviceRequest);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update service request" }, { status: traceError("[service-requests:PUT] update failed", error) });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAuth();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (admin as { role?: string }).role;
    if (!["GENERAL_MANAGER", "MAINTENANCE_MANAGER"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    await prisma.serviceRequest.delete({ where: { id } });
    return NextResponse.json({ message: "Service request deleted" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete service request" }, { status: 500 });
  }
}
