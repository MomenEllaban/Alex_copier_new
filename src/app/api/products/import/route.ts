import { NextResponse } from "next/server";
import { requireAction, requireAuth } from "@/lib/auth-helpers";
import { importProductsCsv } from "@/lib/products-import";

/**
 * Bulk-creates products from a CSV in the shape the products page exports. The
 * company comes from the `companyName` column, so one file can carry a whole
 * catalogue and still land each row against the right owner. The work itself is
 * in lib/products-import, shared with the catalogue loader.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAction("products", "import");
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

    const result = await importProductsCsv(body.csv);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Product import failed:", error);
    return NextResponse.json({ error: "Failed to import products" }, { status: 500 });
  }
}
