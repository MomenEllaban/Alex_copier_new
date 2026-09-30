import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/auth-helpers";
import { traceError } from "@/lib/prisma-errors";

/**
 * The replacement log: every machine taken back from a customer, what it
 * became, which company holds it, and which contract it left.
 *
 * Feeds the "replacement products" page history and the machine detail panel.
 */
export async function GET(request: Request) {
  try {
    const user = await requirePageAccess("tradeIns");
    if (!user) {
      return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const contractId = params.get("contractId");
    const companyId = params.get("companyId");
    const serialNumber = params.get("serialNumber")?.trim();

    const rows = await prisma.machineReplacement.findMany({
      where: {
        ...(contractId ? { contractId } : {}),
        ...(companyId ? { companyId } : {}),
        ...(serialNumber
          ? { oldMachine: { serialNumber: { contains: serialNumber, mode: "insensitive" } } }
          : {}),
      },
      include: {
        oldMachine: {
          select: { id: true, serialNumber: true, manufacturer: true, model: true },
        },
        newMachine: {
          select: { id: true, serialNumber: true, manufacturer: true, model: true },
        },
        contract: {
          select: {
            id: true,
            contractNumber: true,
            customer: { select: { id: true, name: true } },
          },
        },
        company: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        product: {
          select: {
            id: true,
            name: true,
            isActive: true,
            inventoryItems: { select: { quantity: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json(
      { error: "فشل تحميل سجل الاستبدالات", code: "LOAD_FAILED", detail: traceError("[machine-replacements:GET]", error) },
      { status: 500 }
    );
  }
}
