import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAction, requireAuth } from "@/lib/auth-helpers";
import { parseCsvRecords, validateRecords } from "@/lib/import-schemas";

export async function POST(request: Request) {
  try {
    const user = await requireAction("machines", "import");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const body = await request.json();
    if (typeof body?.csv !== "string" || body.csv.trim() === "") {
      return NextResponse.json({ error: "Missing csv content" }, { status: 400 });
    }

    const parsed = parseCsvRecords(body.csv, "machines");
    if (parsed.errors.length > 0) {
      return NextResponse.json({ created: 0, errors: parsed.errors });
    }

    const existing = await prisma.machine.findMany({
      select: { serialNumber: true },
    });
    const existingKeys = new Set(existing.map((m) => m.serialNumber.trim().toLowerCase()));

    const { valid, errors } = validateRecords("machines", parsed.records, { existingKeys });
    if (errors.length > 0 || valid.length === 0) {
      return NextResponse.json({ created: 0, errors });
    }

    const result = await prisma.machine.createMany({
      data: valid as { serialNumber: string; [key: string]: unknown }[],
    });

    return NextResponse.json({ created: result.count, errors: [] });
  } catch (error) {
    console.error("Machine import failed:", error);
    return NextResponse.json({ error: "Failed to import machines" }, { status: 500 });
  }
}
