import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePageAccess, requireAction } from "@/lib/auth-helpers";
import { z } from "zod";

const createSchema = z.object({
  date: z.string().min(1, "Date is required"),
  engineerId: z.string().optional().nullable(),
  engineerName: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  description: z.string().min(1, "Description is required"),
  requestedBy: z.string().optional().nullable(),
  movementType: z.enum(["SALE", "REPLACEMENT", "RETURN"]),
  performedById: z.string().optional().nullable(),
  performedByName: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const user = await requirePageAccess("workshop");
    if (!user) {
      const authed = await requirePageAccess("workshop");
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const movementType = searchParams.get("movementType") || "";
    const engineerId = searchParams.get("engineerId") || "";
    const customerId = searchParams.get("customerId") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const receiptStatus = searchParams.get("receiptStatus") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));

    const where: Record<string, unknown> = { deletedAt: null };

    if (search) {
      where.OR = [
        { description: { contains: search, mode: "insensitive" } },
        { customerName: { contains: search, mode: "insensitive" } },
        { engineerName: { contains: search, mode: "insensitive" } },
        { requestedBy: { contains: search, mode: "insensitive" } },
      ];
    }
    if (movementType) where.movementType = movementType;
    if (engineerId) where.engineerId = engineerId;
    if (customerId) where.customerId = customerId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) (where.date as Record<string, string>).gte = new Date(dateFrom).toISOString();
      if (dateTo) (where.date as Record<string, string>).lte = new Date(dateTo).toISOString();
    }
    if (receiptStatus === "received") where.receivedAt = { not: null };
    if (receiptStatus === "pending") where.receivedAt = null;

    const [total, movements] = await Promise.all([
      prisma.workshopPartMovement.count({ where }),
      prisma.workshopPartMovement.findMany({
        where,
        include: {
          engineer: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          performedBy: { select: { id: true, name: true } },
          receivedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      data: movements,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch movements" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAction("workshop", "add");
    if (!actor) {
      const authed = await requireAction("workshop", "add");
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Validation failed", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const movement = await prisma.workshopPartMovement.create({
      data: {
        ...parsed.data,
        performedById: parsed.data.performedById || actor.id,
        performedByName: parsed.data.performedByName || (actor as { name?: string }).name || null,
        companyId: actor.companyId,
        createdById: actor.id,
      },
      include: {
        engineer: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        performedBy: { select: { id: true, name: true } },
        receivedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(movement, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create movement" }, { status: 500 });
  }
}
