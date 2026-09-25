import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { LOW_STOCK_THRESHOLD } from "@/lib/notifications";
import {
  OPEN_REQUEST_STATUSES,
  buildAlerts,
  buildCompanyPerformance,
  buildEngineerWorkload,
  buildExpiringContracts,
  machinesInService,
  toRecentRequestViews,
  type CompanyFinanceRaw,
  type MachineStatusCounts,
} from "@/lib/dashboard";

export async function GET() {
  try {
    const user = await requirePageAccess("dashboard");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const userRole = (user as { role?: string }).role ?? "";
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const openStatuses = [...OPEN_REQUEST_STATUSES];
    const expiryLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const engineer = userRole === "ENGINEER"
      ? await prisma.engineer.findUnique({
          where: { userId: user.id },
          select: { id: true, name: true },
        })
      : null;

    if (userRole === "ENGINEER" && engineer) {
      const engineerId = engineer.id;
      const [myOpenRequests, myUrgentRequests, myVisits, myAssignedOpen, myRecentRequests] = await Promise.all([
        prisma.serviceRequest.count({ where: { engineerId, status: { in: openStatuses } } }),
        prisma.serviceRequest.count({ where: { engineerId, status: { in: openStatuses }, priority: { in: ["URGENT", "EMERGENCY"] } } }),
        prisma.visit.count({ where: { engineerId, visitedAt: { gte: monthStart } } }),
        prisma.serviceRequest.groupBy({
          by: ["engineerId"],
          where: { engineerId, status: { in: openStatuses } },
          _count: { _all: true },
        }),
        prisma.serviceRequest.findMany({
          where: { engineerId, status: { in: openStatuses } },
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 6,
          select: {
            id: true, requestNumber: true, description: true, priority: true, status: true, createdAt: true,
            customer: { select: { name: true } },
            machine: { select: { serialNumber: true } },
            engineer: { select: { name: true } },
          },
        }),
      ]);

      const payload = {
        role: userRole,
        view: "ENGINEER" as const,
        monthStart: monthStart.toISOString(),
        generatedAt: now.toISOString(),
        kpis: {
          openRequests: myOpenRequests,
          urgentRequests: myUrgentRequests,
          unassignedRequests: 0,
          visitsThisMonth: myVisits,
          activeContracts: 0,
          machinesInService: 0,
        },
        machineStatuses: {},
        companies: [],
        alerts: buildAlerts({
          urgentRequests: myUrgentRequests,
          unassignedRequests: 0,
          overdueInstallments: { count: 0, totalAmount: 0 },
          expiringContracts: [],
          lowStockItems: 0,
        }),
        recentRequests: toRecentRequestViews(myRecentRequests),
        engineerWorkload: buildEngineerWorkload(
          [{ engineerId, _count: { _all: myVisits } }],
          [{ engineerId, _count: { _all: myAssignedOpen[0]?._count._all ?? 0 } }],
          [{ id: engineer.id, name: engineer.name }]
        ),
      };

      return NextResponse.json(payload);
    }

    const [
      companies,
      machineStatusGroups,
      activeContracts,
      serviceCounts,
      urgentRequests,
      unassignedRequests,
      monthVisits,
      recentRequests,
      engineerVisits,
      engineerAssigned,
      overdueInstallmentAggregate,
      expiringContracts,
      lowStockItems,
    ] = await Promise.all([
      prisma.company.findMany({ orderBy: { name: "asc" } }),
      prisma.machine.groupBy({ by: ["currentStatus"], _count: { _all: true } }),
      prisma.contract.count({ where: { status: "ACTIVE" } }),
      prisma.serviceRequest.count({ where: { status: { in: openStatuses } } }),
      prisma.serviceRequest.count({ where: { status: { in: openStatuses }, priority: { in: ["URGENT", "EMERGENCY"] } } }),
      prisma.serviceRequest.count({ where: { status: { in: openStatuses }, engineerId: null } }),
      prisma.visit.count({ where: { visitedAt: { gte: monthStart } } }),
      prisma.serviceRequest.findMany({
        where: { status: { in: openStatuses } },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 6,
        select: {
          id: true, requestNumber: true, description: true, priority: true, status: true, createdAt: true,
          customer: { select: { name: true } },
          machine: { select: { serialNumber: true } },
          engineer: { select: { name: true } },
        },
      }),
      prisma.visit.groupBy({
        by: ["engineerId"],
        where: { visitedAt: { gte: monthStart } },
        _count: { _all: true },
        orderBy: { _count: { engineerId: "desc" } },
      }),
      prisma.serviceRequest.groupBy({
        by: ["engineerId"],
        where: { status: { in: openStatuses }, engineerId: { not: null } },
        _count: { _all: true },
      }),
      prisma.installment.aggregate({
        where: { dueDate: { lt: now }, status: { not: "PAID" } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.contract.findMany({
        where: { status: "ACTIVE", endDate: { lte: expiryLimit } },
        orderBy: { endDate: "asc" },
        take: 10,
        select: { id: true, contractNumber: true, endDate: true, customer: { select: { name: true } } },
      }),
      prisma.warehouseInventory.count({
        where: { quantity: { lte: LOW_STOCK_THRESHOLD }, product: { isActive: true, productType: "SPARE_PART" } },
      }),
    ]);

    const machineStatuses: MachineStatusCounts = Object.fromEntries(
      machineStatusGroups.map((group) => [group.currentStatus, group._count._all])
    );

    const engineerIds = new Set<string>([
      ...engineerVisits.map((item) => item.engineerId),
      ...engineerAssigned.filter((item) => item.engineerId !== null).map((item) => item.engineerId as string),
    ]);
    const engineers = engineerIds.size
      ? await prisma.engineer.findMany({ where: { id: { in: [...engineerIds] } }, select: { id: true, name: true } })
      : [];

    const financeByCompany: Record<string, CompanyFinanceRaw> = {};
    await Promise.all(
      companies.map(async (company) => {
        const [sales, purchases, expenses, settlements, openRequests] = await Promise.all([
          prisma.salesOrder.aggregate({ where: { companyId: company.id, orderDate: { gte: monthStart } }, _sum: { total: true } }),
          prisma.purchaseOrder.aggregate({ where: { companyId: company.id, orderDate: { gte: monthStart } }, _sum: { total: true } }),
          prisma.expense.aggregate({ where: { companyId: company.id, date: { gte: monthStart } }, _sum: { amount: true } }),
          prisma.settlement.aggregate({ where: { companyId: company.id, status: "VERIFIED", createdAt: { gte: monthStart } }, _sum: { amount: true } }),
          prisma.serviceRequest.count({ where: { companyId: company.id, status: { in: openStatuses } } }),
        ]);
        financeByCompany[company.id] = { sales, purchases, expenses, settlements, openRequests };
      })
    );

    const payload = {
      role: userRole,
      view: "MANAGEMENT" as const,
      monthStart: monthStart.toISOString(),
      generatedAt: now.toISOString(),
      kpis: {
        openRequests: serviceCounts,
        urgentRequests,
        unassignedRequests,
        visitsThisMonth: monthVisits,
        activeContracts,
        machinesInService: machinesInService(machineStatuses),
      },
      machineStatuses,
      companies: buildCompanyPerformance(companies, financeByCompany),
      alerts: buildAlerts({
        urgentRequests,
        unassignedRequests,
        overdueInstallments: {
          count: overdueInstallmentAggregate._count._all,
          totalAmount: overdueInstallmentAggregate._sum.amount ?? 0,
        },
        expiringContracts: buildExpiringContracts(expiringContracts, now),
        lowStockItems,
      }),
      recentRequests: toRecentRequestViews(recentRequests),
      engineerWorkload: buildEngineerWorkload(
        engineerVisits,
        engineerAssigned.filter((item): item is { engineerId: string; _count: { _all: number } } => item.engineerId !== null),
        engineers
      ),
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
