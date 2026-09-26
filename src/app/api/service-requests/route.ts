import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import { notifyServiceRequestCreated } from "@/lib/notifications";
import { traceError } from "@/lib/prisma-errors";

export async function GET() {
  try {
    const user = await requirePageAccess("serviceRequests");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const role = (user as { role?: string }).role;
    // Engineers see only requests assigned to them (documented role scope).
    if (role === "ENGINEER") {
      const engineer = await prisma.engineer.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      const serviceRequests = await prisma.serviceRequest.findMany({
        where: { engineerId: engineer?.id ?? "__none__" },
        include: {
          customer: true,
          location: true,
          machine: true,
          engineer: true,
          problems: true,
          visits: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(serviceRequests);
    }

    const serviceRequests = await prisma.serviceRequest.findMany({
      include: {
        customer: true,
        location: true,
        machine: true,
        engineer: true,
        problems: true,
        visits: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(serviceRequests);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch service requests" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAction("serviceRequests", "add");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" }, { status: authed ? 403 : 401 });
    }

    const actorRole = (actor as { role?: string }).role;
    const allowedCreateRoles = ["GENERAL_MANAGER", "COMPANY_MANAGER", "MAINTENANCE_MANAGER", "WORKSHOP_MANAGER"];
    if (!actorRole || !allowedCreateRoles.includes(actorRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { problems, ...data } = body;

    const customerId = typeof data.customerId === "string" ? data.customerId : "";
    if (!customerId || !data.description || String(data.description).trim() === "") {
      return NextResponse.json({ error: "العميل ووصف المشكلة مطلوبان", code: "REQUEST_FIELDS_REQUIRED" }, { status: 400 });
    }
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود", code: "CUSTOMER_NOT_FOUND" }, { status: 400 });
    }
    if (data.priority && !["NORMAL", "IMPORTANT", "URGENT", "EMERGENCY"].includes(data.priority)) {
      return NextResponse.json({ error: "قيمة الأولوية غير صالحة", code: "INVALID_PRIORITY" }, { status: 400 });
    }
    if (data.machineId) {
      const machine = await prisma.machine.findUnique({ where: { id: data.machineId }, select: { id: true } });
      if (!machine) {
        return NextResponse.json({ error: "الجهاز غير موجود", code: "MACHINE_NOT_FOUND" }, { status: 400 });
      }
    }
    if (data.locationId) {
      const location = await prisma.customerLocation.findUnique({ where: { id: data.locationId }, select: { id: true } });
      if (!location) {
        return NextResponse.json({ error: "الموقع غير موجود", code: "LOCATION_NOT_FOUND" }, { status: 400 });
      }
    }
    if (data.engineerId) {
      const engineer = await prisma.engineer.findUnique({ where: { id: data.engineerId }, select: { id: true } });
      if (!engineer) {
        return NextResponse.json({ error: "المهندس غير موجود", code: "ENGINEER_NOT_FOUND" }, { status: 400 });
      }
    }

    const requestNumber = `SR-${Date.now()}`;

    // Requests belong to a company; default to the actor's company.
    let companyId: string | null =
      typeof data.companyId === "string" && data.companyId !== "" ? data.companyId : null;
    if (!companyId) {
      companyId = (actor as { companyId?: string | null }).companyId ?? null;
    }
    if (!companyId) {
      const firstCompany = await prisma.company.findFirst({ select: { id: true } });
      companyId = firstCompany?.id ?? null;
    }
    if (!companyId) {
      return NextResponse.json({ error: "لا توجد شركة مرتبطة بالطلب", code: "COMPANY_REQUIRED" }, { status: 400 });
    }

    const serviceRequest = await prisma.serviceRequest.create({
      data: {
        ...data,
        companyId,
        requestNumber,
        ...(problems && {
          problems: {
            create: problems.map((p: { description: string }) => ({
              description: p.description,
            })),
          },
        }),
      },
      include: {
        customer: true,
        location: true,
        machine: true,
        engineer: true,
        problems: true,
      },
    });

    // Business event: maintenance managers (+GM) must know a new request arrived.
    void notifyServiceRequestCreated({
      requestId: serviceRequest.id,
      requestNumber: serviceRequest.requestNumber,
      priority: serviceRequest.priority,
      customerName: serviceRequest.customer?.name,
      actorId: actor.id,
    }).catch(() => undefined);

    return NextResponse.json(serviceRequest, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create service request" }, { status: traceError("[service-requests:POST] create failed", error) });
  }
}
