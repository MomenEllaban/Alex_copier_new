import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAction, requireAuth } from "@/lib/auth-helpers";
import { parseCsvRecords, validateRecords } from "@/lib/import-schemas";

export async function POST(request: Request) {
  try {
    const user = await requireAction("customers", "import");
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

    const parsed = parseCsvRecords(body.csv, "customers");
    if (parsed.errors.length > 0) {
      return NextResponse.json({ created: 0, errors: parsed.errors });
    }

    const existing = await prisma.customer.findMany({
      select: { name: true, phone: true },
    });
    const existingKeys = new Set(
      existing.map((c) => `${c.name.trim().toLowerCase()}|${(c.phone || "").replace(/\s/g, "")}`)
    );

    const { valid, errors } = validateRecords("customers", parsed.records, { existingKeys });
    if (errors.length > 0 || valid.length === 0) {
      return NextResponse.json({ created: 0, errors });
    }

    const result = await prisma.customer.createMany({
      data: valid as { name: string; [key: string]: unknown }[],
    });

    return NextResponse.json({ created: result.count, errors: [] });
  } catch (error) {
    console.error("Customer import failed:", error);
    return NextResponse.json({ error: "Failed to import customers" }, { status: 500 });
  }
}
