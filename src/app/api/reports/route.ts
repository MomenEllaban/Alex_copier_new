import { NextResponse } from "next/server";
import { differenceInDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [
      contracts,
      engineers,
      settlements,
      machines,
      expenses,
      products,
      distributionCycles,
      serviceRequests,
    ] = await Promise.all([
      prisma.contract.findMany({
        include: {
          customer: true,
          machines: { include: { machine: true } },
          visits: true,
          _count: { select: { visits: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.engineer.findMany({
        include: {
          areas: true,
          skills: true,
          user: { select: { id: true, name: true, email: true } },
          serviceRequests: { include: { visits: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.settlement.findMany({
        include: {
          company: true,
          customer: true,
          engineer: true,
          collector: true,
          verifier: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.machine.findMany({
        include: {
          currentOwner: true,
          customerLocation: true,
          product: true,
          warranty: true,
          serviceRequests: { include: { visits: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.expense.findMany({
        include: { company: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.product.findMany({
        where: { productType: "SPARE_PART", isActive: true },
        include: {
          sparePartCompatibilities: {
            include: { machineModel: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.investorDistributionCycle.findMany({
        include: {
          distributions: { include: { investor: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.serviceRequest.findMany({
        include: {
          engineer: true,
          customer: true,
          visits: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const contractProfitability = contracts.map((contract) => {
      const marginRateMap: Record<string, number> = {
        MAINTENANCE: 0.22,
        MAINTENANCE_ONLY: 0.22,
        MAINTENANCE_AND_PARTS: 0.28,
        MAINTENANCE_AND_PRINTING: 0.25,
        RENTAL: 0.18,
        VISIT: 0.3,
        ARCHIVE: 0.1,
        WARRANTY: 0.12,
        CONTRACT_REQUIRED: 0.2,
        PENDING: 0.2,
      };
      const marginRate = marginRateMap[contract.contractType] ?? 0.2;

      const estimatedProfit = Math.round(contract.value * marginRate);
      return {
        id: contract.id,
        contractNumber: contract.contractNumber,
        customer: contract.customer.name,
        contractType: contract.contractType,
        value: contract.value,
        status: contract.status,
        visitsCount: contract._count.visits,
        estimatedProfit,
      };
    });

    const engineerPerformance = engineers.map((engineer) => {
      const assigned = engineer.serviceRequests ?? [];
      const openCount = assigned.filter((request) =>
        ["NEW", "ASSIGNED", "VISITED", "REASSIGNED"].includes(request.status),
      ).length;
      const resolvedCount = assigned.filter((request) => ["RESOLVED", "CLOSED"].includes(request.status)).length;
      const visitsCount = assigned.reduce((sum, request) => sum + request.visits.length, 0);
      const ratings = assigned
        .map((request) => request.customerRating)
        .filter((rating): rating is number => typeof rating === "number");
      const avgRating = ratings.length
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0;

      return {
        id: engineer.id,
        name: engineer.name,
        user: engineer.user,
        areas: engineer.areas.map((area) => area.areaName),
        skills: engineer.skills.map((skill) => skill.modelType),
        baseSalary: engineer.baseSalary,
        commissionRate: engineer.commissionRate,
        openCount,
        resolvedCount,
        visitsCount,
        avgRating,
      };
    });

    const totalCollected = settlements
      .filter((settlement) => settlement.status === "VERIFIED")
      .reduce((sum, settlement) => sum + Number(settlement.amount || 0), 0);
    const totalPendingVerification = settlements
      .filter((settlement) => settlement.status === "INITIAL")
      .reduce((sum, settlement) => sum + Number(settlement.amount || 0), 0);
    const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const machinesNeedingInspection = machines.filter((machine) => {
      if (machine.currentStatus === "UNDER_INSPECTION") return true;
      return machine.serviceRequests.some((request) => ["VISITED", "NOT_RESOLVED"].includes(request.status));
    });

    const expiringWarranties = machines
      .filter((machine) => machine.warranty)
      .map((machine) => {
        const warranty = machine.warranty!;
        const daysLeft = differenceInDays(new Date(warranty.endDate), new Date());
        return {
          id: machine.id,
          serialNumber: machine.serialNumber,
          machineName: machine.product?.name ?? machine.model ?? "—",
          warrantyEnd: warranty.endDate,
          daysLeft,
          isExpiringSoon: daysLeft <= 30,
        };
      })
      .filter((item) => item.daysLeft <= 60)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const sparePartMatrix = products.map((part) => ({
      id: part.id,
      name: part.name,
      compatibleMachines: part.sparePartCompatibilities.map((compat) => compat.machineModel.name),
    }));

    const investorDistribution = distributionCycles.map((cycle) => ({
      id: cycle.id,
      cycleDate: cycle.cycleDate,
      totalProfit: cycle.totalProfit,
      distributions: cycle.distributions.map((distribution) => ({
        investor: distribution.investor.name,
        ownershipPct: distribution.investor.ownershipPct,
        amount: distribution.amount,
      })),
    }));

    const ratedRequests = serviceRequests.filter((request) => typeof request.customerRating === "number");
    const averageRating = ratedRequests.length
      ? ratedRequests.reduce((sum, request) => sum + Number(request.customerRating ?? 0), 0) / ratedRequests.length
      : 0;

    return NextResponse.json({
      contracts: contractProfitability,
      engineers: engineerPerformance,
      cash: {
        totalCollected,
        totalPendingVerification,
        totalExpenses,
        netCash: totalCollected - totalExpenses,
      },
      machinesNeedingInspection,
      warranties: expiringWarranties,
      investorDistribution,
      sparePartMatrix,
      customerSatisfaction: {
        averageRating,
        ratedRequests: ratedRequests.length,
        totalRequests: serviceRequests.length,
      },
      summary: {
        totalContracts: contracts.length,
        totalEngineers: engineers.length,
        totalOpenServiceRequests: serviceRequests.filter((request) =>
          ["NEW", "ASSIGNED", "VISITED", "REASSIGNED"].includes(request.status),
        ).length,
      },
    });
  } catch (error) {
    console.error("[reports] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
