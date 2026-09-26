import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

/**
 * List every copier test with server-side search / filters / pagination.
 *
 * The table holds tens of thousands of rows, so filtering happens in Postgres
 * (the client only ever receives one page).
 *
 * Query params:
 *   q          free text → customer name, machine serial, engineer, statements, notes
 *   customerId exact customer
 *   engineerId exact engineer
 *   machineId  exact machine
 *   from,to    YYYY-MM-DD bounds on testDate (falls back to createdAt when testDate is null)
 *   image      "with" | "without"
 *   collected  "with" | "without"
 *   page       1-based page number (default 1)
 *   pageSize   rows per page (default 15, max 100)
 */
export async function GET(request: Request) {
  try {
    const user = await requirePageAccess("copierTests");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized" },
        { status: authed ? 403 : 401 },
      );
    }

    const params = new URL(request.url).searchParams;
    const q = (params.get("q") ?? "").trim();
    const customerId = (params.get("customerId") ?? "").trim();
    const engineerId = (params.get("engineerId") ?? "").trim();
    const machineId = (params.get("machineId") ?? "").trim();
    const from = (params.get("from") ?? "").trim();
    const to = (params.get("to") ?? "").trim();
    const image = (params.get("image") ?? "").trim();
    const collected = (params.get("collected") ?? "").trim();
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(params.get("pageSize")) || 15));

    // Engineers are scoped to the customers assigned to them (Customer.engineerId).
    const role = (user as { role?: string }).role;
    let myEngineerId: string | null = null;
    if (role === "ENGINEER") {
      const userId = (user as { id?: string }).id ?? "";
      const mine = await prisma.engineer.findUnique({ where: { userId }, select: { id: true } });
      myEngineerId = mine?.id ?? "__none__";
    }

    const where: Record<string, unknown> = {};
    if (myEngineerId) where.customer = { engineerId: myEngineerId };
    if (customerId) where.customerId = customerId;
    if (engineerId) where.engineerId = engineerId;
    // A test can be recorded without a machine, so "no machine" is a real
    // choice in the filter rather than an empty option.
    if (machineId === "__none__") where.machineId = null;
    else if (machineId) where.machineId = machineId;
    if (image === "with") where.imageUrl = { not: null };
    if (image === "without") where.imageUrl = null;
    if (collected === "with") where.collectedAmount = { gt: 0 };
    if (collected === "without") where.collectedAmount = null;

    if (from || to) {
      // testDate is nullable (imported rows) — bound those by their createdAt.
      const bounds: Record<string, Date> = {};
      if (from) bounds.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) bounds.lte = new Date(`${to}T23:59:59.999Z`);
      where.AND = [
        { OR: [{ testDate: bounds }, { AND: [{ testDate: null }, { createdAt: bounds }] }] },
      ];
    }

    if (q) {
      const like = { contains: q, mode: "insensitive" };
      where.OR = [
        { customer: { name: like } },
        { machine: { serialNumber: like } },
        { engineer: { name: like } },
        { repairStatement: like },
        { spareParts: like },
        { collectionNote: like },
        { notes: like },
      ];
    }

    const [total, rows, aggregate] = await Promise.all([
      prisma.copierTest.count({ where }),
      prisma.copierTest.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          engineer: { select: { id: true, name: true } },
          machine: { select: { id: true, serialNumber: true, model: true } },
        },
        orderBy: [{ testDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.copierTest.aggregate({
        where,
        _count: { _all: true },
        _sum: { collectedAmount: true, blackCounter: true, colorCounter: true },
      }),
    ]);

    return NextResponse.json({
      rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary: {
        total,
        collectedTotal: aggregate._sum.collectedAmount ?? 0,
        blackTotal: aggregate._sum.blackCounter ?? 0,
        colorTotal: aggregate._sum.colorCounter ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch tests" }, { status: 500 });
  }
}
