import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAction, requireAuth } from "@/lib/auth-helpers";
import { parseCsvRecords, validateRecords, type ImportError } from "@/lib/import-schemas";

export async function POST(request: Request) {
  try {
    const user = await requireAction("suppliers", "import");
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

    const parsed = parseCsvRecords(body.csv, "suppliers");
    if (parsed.errors.length > 0) {
      return NextResponse.json({ created: 0, errors: parsed.errors });
    }

    const [existingSuppliers, companies] = await Promise.all([
      prisma.supplier.findMany({ select: { name: true } }),
      prisma.company.findMany({ select: { id: true, name: true, nameAr: true } }),
    ]);
    const existingKeys = new Set(existingSuppliers.map((s) => s.name.trim().toLowerCase()));

    const companyByName = new Map<string, string>();
    for (const c of companies) {
      companyByName.set(c.name.trim().toLowerCase(), c.id);
      if (c.nameAr) companyByName.set(c.nameAr.trim().toLowerCase(), c.id);
    }

    // Resolve companyName -> companyId before validation
    const records = parsed.records.map((record) => {
      const key = (record.companyName || "").trim().toLowerCase();
      const companyId = companyByName.get(key);
      return { record, companyId };
    });

    const resolveErrors: ImportError[] = [];
    for (const { record, companyId } of records) {
      if (!companyId) {
        resolveErrors.push({
          row: Number(record.__row ?? 0),
          field: "companyName",
          message: `الشركة التابعة غير موجودة (${record.companyName}) — يجب أن تطابق اسم شركة قائمة في النظام`,
        });
      }
    }
    if (resolveErrors.length > 0) {
      return NextResponse.json({ created: 0, errors: resolveErrors });
    }

    const normalized = records.map(({ record, companyId }) => ({
      ...record,
      companyId: companyId as string,
    }));

    const { valid, errors } = validateRecords("suppliers", normalized, {
      existingKeys,
      passthroughKeys: ["companyId"],
    });
    if (errors.length > 0 || valid.length === 0) {
      return NextResponse.json({ created: 0, errors });
    }

    const result = await prisma.supplier.createMany({
      data: valid as { name: string; companyId: string; [key: string]: unknown }[],
    });

    return NextResponse.json({ created: result.count, errors: [] });
  } catch (error) {
    console.error("Supplier import failed:", error);
    return NextResponse.json({ error: "Failed to import suppliers" }, { status: 500 });
  }
}
