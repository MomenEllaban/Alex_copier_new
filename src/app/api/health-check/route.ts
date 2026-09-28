import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth-helpers";

/**
 * GET /api/health-check
 *
 * Liveness probe plus a row count per core table. The counts are business data
 * (how many customers, machines and contracts the company holds), so this was
 * previously readable by anyone who guessed the path, and nothing audited it:
 * `health-check` is in IGNORED_ROUTE_PREFIXES because it is a system endpoint
 * rather than a capability of any page, so the permission scanner skips it.
 *
 * Restricted to GENERAL_MANAGER, matching the other system-level endpoints
 * (`/api/users`, the roles matrix, `/api/dev/reset-transactions`). It stays in
 * IGNORED_ROUTE_PREFIXES; its guard is covered by route-auth-matrix.test.ts.
 */
export async function GET() {
  // Keep the shape of a liveness probe: a signed-in GM gets the counts, and
  // everyone else is told nothing beyond whether they are allowed in.
  const admin = await requireRole("GENERAL_MANAGER");
  if (!admin) {
    const authed = await requireAuth();
    return NextResponse.json(
      {
        error: authed ? "Forbidden" : "Unauthorized",
        code: authed ? "FORBIDDEN" : "UNAUTHORIZED",
      },
      { status: authed ? 403 : 401 }
    );
  }

  try {
    const [
      companies,
      users,
      customers,
      engineers,
      machines,
      contracts,
      serviceRequests,
      purchaseOrders,
      salesOrders,
      products,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.user.count(),
      prisma.customer.count(),
      prisma.engineer.count(),
      prisma.machine.count(),
      prisma.contract.count(),
      prisma.serviceRequest.count(),
      prisma.purchaseOrder.count(),
      prisma.salesOrder.count(),
      prisma.product.count(),
    ]);

    const tables = {
      companies,
      users,
      customers,
      engineers,
      machines,
      contracts,
      serviceRequests,
      purchaseOrders,
      salesOrders,
      products,
    };

    return NextResponse.json({ status: "healthy", tables });
  } catch (error) {
    // The raw driver message can name tables, columns and constraint names, so
    // it stays in the log and the caller only learns that the check failed.
    console.error("[health-check] GET failed:", error);
    return NextResponse.json(
      { status: "unhealthy", error: "Health check failed", code: "HEALTH_CHECK_FAILED" },
      { status: 500 }
    );
  }
}
