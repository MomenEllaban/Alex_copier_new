import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const user = await requirePageAccess("workshop");
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const where = { deletedAt: null };

    const [total, sales, replacements, returns, pendingReceipt] = await Promise.all([
      prisma.workshopPartMovement.count({ where }),
      prisma.workshopPartMovement.count({ where: { ...where, movementType: "SALE" } }),
      prisma.workshopPartMovement.count({ where: { ...where, movementType: "REPLACEMENT" } }),
      prisma.workshopPartMovement.count({ where: { ...where, movementType: "RETURN" } }),
      prisma.workshopPartMovement.count({ where: { ...where, receivedAt: null } }),
    ]);

    return NextResponse.json({
      total,
      sales,
      replacements,
      returns,
      pendingReceipt,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
