import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/auth-helpers";
import { traceError } from "@/lib/prisma-errors";

/**
 * Replacement products — the machines taken back from customers.
 *
 * Separate from `/api/products` because this page needs the stock position, not
 * just the product row: where each returned machine is held and how many units
 * of it are in that warehouse. A returned machine is one physical unit keyed on
 * its own serial number, so its quantity is normally 1.
 *
 * `?companyId` narrows the list; without it every company's trade-in stock is
 * returned, which is what the page needs in order to show which company is
 * holding what.
 */
export async function GET(request: Request) {
  try {
    const user = await requirePageAccess("tradeIns");
    if (!user) {
      return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }

    const companyId = new URL(request.url).searchParams.get("companyId");

    const products = await prisma.product.findMany({
      where: {
        isTradeIn: true,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        company: { select: { id: true, name: true } },
        inventoryItems: {
          select: {
            quantity: true,
            warehouse: { select: { id: true, name: true, isMain: true } },
          },
        },
        // The replacement record is the link back to the machine it came from
        // and the contract it left, so the page can show "replaced from …".
        machineReplacement: {
          include: {
            oldMachine: {
              select: { id: true, serialNumber: true, manufacturer: true, model: true },
            },
            contract: {
              select: { id: true, contractNumber: true, customer: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(products);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch replacement products",
        code: "FETCH_FAILED",
        detail: traceError("[trade-ins:GET]", error),
      },
      { status: 500 }
    );
  }
}
