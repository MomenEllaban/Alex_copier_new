import { differenceInDays } from "date-fns";
import { NextResponse } from "next/server";
import type { RequestStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

/**
 * Shared handler for the per-report GET routes.
 *
 * Every report answers with the same envelope and the same two failure modes,
 * so the guard and the error mapping live here instead of being copied into
 * eight route files. Kept in one place so a change to the reports auth
 * contract cannot drift between reports.
 *
 * Row-shaped reports are normalised to `{ rows }`; the two scalar reports
 * (cash position, customer satisfaction) return their `{ summary }` object as
 * is. The shared UI reads `rows` for tables and `summary` for headline cards.
 */
export async function reportResponse<T>(load: () => Promise<T>): Promise<NextResponse> {
  try {
    const user = await requirePageAccess("reports");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 },
      );
    }

    const data = await load();
    return NextResponse.json(Array.isArray(data) ? { rows: data } : { summary: data });
  } catch (error) {
    console.error("[reports] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch report" }, { status: 500 });
  }
}

/**
 * Report data loaders.
 *
 * These used to live in a single `GET /api/reports` that ran eight heavy
 * `findMany` calls with nested includes on every request and returned every
 * report in one payload. Each report is now its own endpoint, so a page only
 * pays for the tables it actually shows — the contracts report no longer loads
 * settlements, expenses, investors and products, and vice versa.
 *
 * The arithmetic is unchanged from the original endpoint so the numbers on
 * screen do not move when the reports are split.
 */

/** Estimated margin per contract type, used for the profitability report. */
const MARGIN_RATE_BY_TYPE: Record<string, number> = {
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

const DEFAULT_MARGIN_RATE = 0.2;

const OPEN_REQUEST_STATUSES: RequestStatus[] = ["NEW", "ASSIGNED", "VISITED", "REASSIGNED"];
const CLOSED_REQUEST_STATUSES: RequestStatus[] = ["RESOLVED", "CLOSED"];

/** Margin applied to a contract, given its type. */
export function marginForContractType(contractType: string): number {
  return MARGIN_RATE_BY_TYPE[contractType] ?? DEFAULT_MARGIN_RATE;
}

export interface ContractProfitabilityRow {
  id: string;
  contractNumber: string;
  customer: string;
  contractType: string;
  value: number;
  status: string;
  visitsCount: number;
  estimatedProfit: number;
}

export async function loadContractProfitability(): Promise<ContractProfitabilityRow[]> {
  // `machines` and `visits` were included by the original endpoint but never
  // read; only the visit count is shown, so it comes from _count instead.
  const contracts = await prisma.contract.findMany({
    select: {
      id: true,
      contractNumber: true,
      contractType: true,
      value: true,
      status: true,
      customer: { select: { name: true } },
      _count: { select: { visits: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return contracts.map((contract) => ({
    id: contract.id,
    contractNumber: contract.contractNumber,
    customer: contract.customer.name,
    contractType: contract.contractType,
    value: contract.value,
    status: contract.status,
    visitsCount: contract._count.visits,
    estimatedProfit: Math.round(contract.value * marginForContractType(contract.contractType)),
  }));
}

export interface EngineerPerformanceRow {
  id: string;
  name: string;
  user: { id: string; name: string; email: string } | null;
  areas: string[];
  skills: string[];
  baseSalary: number;
  commissionRate: number;
  openCount: number;
  resolvedCount: number;
  visitsCount: number;
  avgRating: number;
}

export async function loadEngineerPerformance(): Promise<EngineerPerformanceRow[]> {
  const engineers = await prisma.engineer.findMany({
    select: {
      id: true,
      name: true,
      baseSalary: true,
      commissionRate: true,
      areas: { select: { areaName: true } },
      skills: { select: { modelType: true } },
      user: { select: { id: true, name: true, email: true } },
      serviceRequests: { select: { status: true, customerRating: true, _count: { select: { visits: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return engineers.map((engineer) => {
    const requests = engineer.serviceRequests;
    const ratings = requests
      .map((r) => r.customerRating)
      .filter((rating): rating is number => typeof rating === "number");

    return {
      id: engineer.id,
      name: engineer.name,
      user: engineer.user,
      areas: engineer.areas.map((area) => area.areaName),
      skills: engineer.skills.map((skill) => skill.modelType),
      baseSalary: engineer.baseSalary,
      commissionRate: engineer.commissionRate,
      openCount: requests.filter((r) => OPEN_REQUEST_STATUSES.includes(r.status)).length,
      resolvedCount: requests.filter((r) => CLOSED_REQUEST_STATUSES.includes(r.status)).length,
      // Counted through _count rather than by loading every visit row.
      visitsCount: requests.reduce((sum, r) => sum + r._count.visits, 0),
      avgRating: ratings.length
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0,
    };
  });
}

export interface CashPosition {
  totalCollected: number;
  totalPendingVerification: number;
  totalExpenses: number;
  netCash: number;
}

export async function loadCashPosition(): Promise<CashPosition> {
  // Summed in the database rather than by reading every settlement row.
  const [collected, pending, expenses] = await Promise.all([
    prisma.settlement.aggregate({ _sum: { amount: true }, where: { status: "VERIFIED" } }),
    prisma.settlement.aggregate({ _sum: { amount: true }, where: { status: "INITIAL" } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
  ]);

  const totalCollected = Number(collected._sum.amount ?? 0);
  const totalExpenses = Number(expenses._sum.amount ?? 0);

  return {
    totalCollected,
    totalPendingVerification: Number(pending._sum.amount ?? 0),
    totalExpenses,
    netCash: totalCollected - totalExpenses,
  };
}

export interface MachineNeedingInspection {
  id: string;
  serialNumber: string;
  currentStatus: string;
  product?: { name?: string } | null;
  customerLocation?: { name?: string } | null;
}

export async function loadMachinesNeedingInspection(): Promise<MachineNeedingInspection[]> {
  // Two targeted queries instead of loading every machine with all of its
  // service requests and visits, then filtering in JavaScript.
  const [flagged, withOpenVisit] = await Promise.all([
    prisma.machine.findMany({
      where: { currentStatus: "UNDER_INSPECTION" },
      select: {
        id: true,
        serialNumber: true,
        currentStatus: true,
        product: { select: { name: true } },
        customerLocation: { select: { name: true } },
      },
    }),
    prisma.machine.findMany({
      where: { serviceRequests: { some: { status: { in: ["VISITED", "NOT_RESOLVED"] } } } },
      select: {
        id: true,
        serialNumber: true,
        currentStatus: true,
        product: { select: { name: true } },
        customerLocation: { select: { name: true } },
      },
    }),
  ]);

  const merged = new Map<string, MachineNeedingInspection>();
  for (const machine of [...flagged, ...withOpenVisit]) merged.set(machine.id, machine);
  return [...merged.values()].sort((a, b) => a.serialNumber.localeCompare(b.serialNumber, "en"));
}

export interface ExpiringWarranty {
  id: string;
  serialNumber: string;
  machineName: string;
  warrantyEnd: string;
  daysLeft: number;
  isExpiringSoon: boolean;
}

export async function loadExpiringWarranties(withinDays = 60): Promise<ExpiringWarranty[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  const machines = await prisma.machine.findMany({
    where: { warranty: { endDate: { lte: cutoff } } },
    select: {
      id: true,
      serialNumber: true,
      model: true,
      product: { select: { name: true } },
      warranty: { select: { endDate: true } },
    },
  });

  return machines
    .map((machine) => {
      const endDate = machine.warranty!.endDate;
      const daysLeft = differenceInDays(new Date(endDate), new Date());
      return {
        id: machine.id,
        serialNumber: machine.serialNumber,
        machineName: machine.product?.name ?? machine.model ?? "—",
        warrantyEnd: endDate.toISOString(),
        daysLeft,
        isExpiringSoon: daysLeft <= 30,
      };
    })
    .filter((item) => item.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export interface InvestorDistributionRow {
  id: string;
  cycleDate: string;
  totalProfit: number;
  distributions: Array<{ investor: string; ownershipPct: number; amount: number }>;
}

export async function loadInvestorDistribution(): Promise<InvestorDistributionRow[]> {
  const cycles = await prisma.investorDistributionCycle.findMany({
    select: {
      id: true,
      cycleDate: true,
      totalProfit: true,
      distributions: {
        select: {
          amount: true,
          investor: { select: { name: true, ownershipPct: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return cycles.map((cycle) => ({
    id: cycle.id,
    cycleDate: cycle.cycleDate.toISOString(),
    totalProfit: cycle.totalProfit,
    distributions: cycle.distributions.map((distribution) => ({
      investor: distribution.investor.name,
      ownershipPct: distribution.investor.ownershipPct,
      amount: distribution.amount,
    })),
  }));
}

export interface SparePartRow {
  id: string;
  name: string;
  compatibleMachines: string[];
}

export async function loadSparePartMatrix(): Promise<SparePartRow[]> {
  const parts = await prisma.product.findMany({
    where: { productType: "SPARE_PART", isActive: true },
    select: {
      id: true,
      name: true,
      sparePartCompatibilities: {
        select: { machineModel: { select: { name: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return parts.map((part) => ({
    id: part.id,
    name: part.name,
    compatibleMachines: part.sparePartCompatibilities.map((compat) => compat.machineModel.name),
  }));
}

export interface ReportsOverview {
  totalContracts: number;
  totalContractValue: number;
  totalEngineers: number;
  totalOpenServiceRequests: number;
  netCash: number;
  expiringWarranties: number;
}

/**
 * Numbers for the reports landing page.
 *
 * This endpoint used to return all eight report datasets at once; it now
 * returns only the headline counts so the landing page stays cheap. The
 * per-report endpoints serve the detail.
 */
export async function loadReportsOverview(): Promise<ReportsOverview> {
  const [contracts, contractValue, engineers, openRequests, cash, warranties] = await Promise.all([
    prisma.contract.count(),
    prisma.contract.aggregate({ _sum: { value: true } }),
    prisma.engineer.count(),
    prisma.serviceRequest.count({ where: { status: { in: OPEN_REQUEST_STATUSES } } }),
    loadCashPosition(),
    loadExpiringWarranties(),
  ]);

  return {
    totalContracts: contracts,
    totalContractValue: Number(contractValue._sum.value ?? 0),
    totalEngineers: engineers,
    totalOpenServiceRequests: openRequests,
    netCash: cash.netCash,
    expiringWarranties: warranties.length,
  };
}

export interface CustomerSatisfaction {
  averageRating: number;
  ratedRequests: number;
  totalRequests: number;
  openRequests: number;
}

export async function loadCustomerSatisfaction(): Promise<CustomerSatisfaction> {
  // Aggregated in the database: the original endpoint pulled every service
  // request with its full visit tree just to average one integer column.
  const [totals, rated, average, open] = await Promise.all([
    prisma.serviceRequest.aggregate({ _count: { _all: true } }),
    prisma.serviceRequest.aggregate({ _count: { _all: true }, where: { customerRating: { not: null } } }),
    prisma.serviceRequest.aggregate({ _avg: { customerRating: true }, where: { customerRating: { not: null } } }),
    prisma.serviceRequest.count({ where: { status: { in: OPEN_REQUEST_STATUSES } } }),
  ]);

  return {
    averageRating: Number(average._avg.customerRating ?? 0),
    ratedRequests: rated._count._all,
    totalRequests: totals._count._all,
    openRequests: open,
  };
}
