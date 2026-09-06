import { prisma } from "./prisma";
import type { SalesOrderStatus } from "@/generated/prisma/enums";

export type EngineerStatementRowType = "SALE" | "SETTLEMENT" | "SERVICE_REQUEST" | "VISIT" | "SALARY";

export interface EngineerStatementRow {
  id: string;
  type: EngineerStatementRowType;
  date: string; // ISO datetime used for display + sort
  ref: string | null; // human reference (order number / settlement number / request number / month)
  description: string | null;
  amount: number; // signed: positive = money into the company, negative = money out
  balance: number; // running money-flow balance after this row
}

export interface EngineerStatement {
  engineerId: string;
  engineerName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  baseSalary: number;
  transportAllowance: number;
  commissionRate: number;
  rows: EngineerStatementRow[];
  openingBalance: number;
  closingBalance: number;
  summary: {
    totalSales: number; // value of all confirmed/delivered sales the engineer closed
    salesCount: number;
    totalCollections: number; // net of VERIFIED settlements collected by the engineer
    settlementCount: number;
    totalCommission: number; // commissions accrued on salary records
    totalPlannedSalary: number; // net payable per salary records
    totalSalaryPaid: number; // net payable already paid out
    serviceRequestCount: number;
    openRequests: number;
    resolvedRequests: number;
    visitsCount: number;
    resolvedVisits: number;
    custodyItems: number;
  };
  generatedAt: string;
}

// Sales are saved every time the form is submitted (no confirm step), so every
// invoice is a real money movement. They are always created as CONFIRMED and
// cancelled orders stay excluded.
const FINALIZED_SALE_STATUSES: SalesOrderStatus[] = ["CONFIRMED", "DELIVERED"];
const OPEN_REQUEST_STATUSES = ["NEW", "ASSIGNED", "VISITED", "REASSIGNED"];
const RESOLVED_REQUEST_STATUSES = ["RESOLVED", "CLOSED"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Input shapes (a projection of the Prisma records the query layer passes in).
export interface SaleRecord {
  id: string;
  total: number;
  createdAt: Date;
  customer: { name: string } | null;
}

export interface SettlementRecord {
  id: string;
  amount: number;
  direction: string;
  reason: string | null;
  settlementNumber: string;
  status: string;
  createdAt: Date;
  customer: { name: string } | null;
}

export interface ServiceRequestRecord {
  id: string;
  requestNumber: string;
  status: string;
  createdAt: Date;
  customer: { name: string } | null;
}

export interface VisitRecord {
  id: string;
  visitedAt: Date;
  resolutionNotes: string | null;
  resolved: boolean;
  serviceRequest: { requestNumber: string };
}

export interface SalaryRecord {
  id: string;
  month: number;
  year: number;
  commissionAmount: number;
  netPayable: number;
  isPaid: boolean;
  createdAt: Date;
}

export interface CustodyRecord {
  id: string;
  quantityIssued: number;
}

export interface EngineerBase {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  baseSalary: number;
  transportAllowance: number;
  commissionRate: number;
}

export interface EngineerStatementData {
  engineer: EngineerBase;
  salesOrders: SaleRecord[];
  settlements: SettlementRecord[];
  serviceRequests: ServiceRequestRecord[];
  visits: VisitRecord[];
  salaryRecords: SalaryRecord[];
  custodyItems: CustodyRecord[];
}

/**
 * Pure assembly of an engineer statement from fetched records (no DB access),
 * so the money-flow arithmetic can be unit-tested without a database.
 *
 * Balance convention: every confirmed money movement carries a signed `amount`
 * where positive is money that came into the company through the engineer
 * (sales, collected settlements) and negative is money paid out to the engineer
 * (salaries, refunded settlements). The running `balance` therefore ends at the
 * engineer's net money contribution to the company.
 */
export function assembleEngineerStatement(data: EngineerStatementData): EngineerStatement {
  const { engineer, salesOrders, settlements, serviceRequests, visits, salaryRecords, custodyItems } = data;

  interface Movement extends EngineerStatementRow {
    sort: number;
    finalized: boolean;
  }

  const moves: Movement[] = [];

  for (const o of salesOrders) {
    moves.push({
      id: o.id,
      type: "SALE",
      date: o.createdAt.toISOString(),
      ref: null,
      description: o.customer?.name ?? null,
      amount: o.total,
      balance: 0,
      sort: o.createdAt.getTime(),
      finalized: true,
    });
  }

  for (const s of settlements) {
    const finalized = s.status === "VERIFIED";
    const customerNote = s.customer ? `${s.customer.name} — ` : "";
    moves.push({
      id: s.id,
      type: "SETTLEMENT",
      date: s.createdAt.toISOString(),
      ref: s.settlementNumber,
      description: `${customerNote}${s.reason ?? ""}`.trim() || s.settlementNumber,
      amount: s.direction === "ADDITION" ? s.amount : -s.amount,
      balance: 0,
      sort: s.createdAt.getTime(),
      finalized,
    });
  }

  for (const r of serviceRequests) {
    moves.push({
      id: r.id,
      type: "SERVICE_REQUEST",
      date: r.createdAt.toISOString(),
      ref: r.requestNumber,
      description: r.customer?.name ?? null,
      amount: 0,
      balance: 0,
      sort: r.createdAt.getTime(),
      finalized: true,
    });
  }

  for (const v of visits) {
    moves.push({
      id: v.id,
      type: "VISIT",
      date: v.visitedAt.toISOString(),
      ref: v.serviceRequest.requestNumber,
      description: v.resolutionNotes || "",
      amount: 0,
      balance: 0,
      sort: v.visitedAt.getTime(),
      finalized: true,
    });
  }

  for (const s of salaryRecords) {
    moves.push({
      id: s.id,
      type: "SALARY",
      date: s.createdAt.toISOString(),
      ref: `${s.month}/${s.year}`,
      description: null,
      amount: -s.netPayable,
      balance: 0,
      sort: s.createdAt.getTime(),
      finalized: s.isPaid,
    });
  }

  moves.sort((a, b) => a.sort - b.sort || a.date.localeCompare(b.date));

  const rows: EngineerStatementRow[] = [];
  let balance = 0;
  for (const d of moves) {
    if (d.finalized) balance += d.amount;
    d.balance = round2(balance);
    rows.push({
      id: d.id,
      type: d.type,
      date: d.date,
      ref: d.ref,
      description: d.description,
      amount: round2(d.amount),
      balance: d.balance,
    });
  }

  const verifiedSettlements = settlements.filter((s) => s.status === "VERIFIED");
  const paidSalaries = salaryRecords.filter((s) => s.isPaid);

  return {
    engineerId: engineer.id,
    engineerName: engineer.name,
    phone: engineer.phone,
    email: engineer.email,
    isActive: engineer.isActive,
    baseSalary: engineer.baseSalary,
    transportAllowance: engineer.transportAllowance,
    commissionRate: engineer.commissionRate,
    rows,
    openingBalance: 0,
    closingBalance: round2(balance),
    summary: {
      totalSales: round2(salesOrders.reduce((sum, o) => sum + o.total, 0)),
      salesCount: salesOrders.length,
      totalCollections: round2(
        verifiedSettlements.reduce(
          (sum, s) => sum + (s.direction === "ADDITION" ? s.amount : -s.amount),
          0,
        ),
      ),
      settlementCount: verifiedSettlements.length,
      totalCommission: round2(salaryRecords.reduce((sum, s) => sum + s.commissionAmount, 0)),
      totalPlannedSalary: round2(salaryRecords.reduce((sum, s) => sum + s.netPayable, 0)),
      totalSalaryPaid: round2(paidSalaries.reduce((sum, s) => sum + s.netPayable, 0)),
      serviceRequestCount: serviceRequests.length,
      openRequests: serviceRequests.filter((r) => OPEN_REQUEST_STATUSES.includes(r.status)).length,
      resolvedRequests: serviceRequests.filter((r) =>
        RESOLVED_REQUEST_STATUSES.includes(r.status),
      ).length,
      visitsCount: visits.length,
      resolvedVisits: visits.filter((v) => v.resolved).length,
      custodyItems: custodyItems.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build a full chronological statement for an engineer by merging every record
 * that touches them on the system: sales they closed, settlements they
 * collected, assigned service requests, field visits, issued spare-part
 * custody, and salary records.
 */
export async function buildEngineerStatement(
  engineerId: string,
): Promise<EngineerStatement | null> {
  const engineer = await prisma.engineer.findUnique({
    where: { id: engineerId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      isActive: true,
      baseSalary: true,
      transportAllowance: true,
      commissionRate: true,
    },
  });
  if (!engineer) return null;

  const [salesOrders, settlements, serviceRequests, visits, salaryRecords, custodyItems] =
    await Promise.all([
      prisma.salesOrder.findMany({
        where: { engineerId, status: { in: FINALIZED_SALE_STATUSES } },
        select: {
          id: true,
          total: true,
          orderDate: true,
          createdAt: true,
          status: true,
          notes: true,
          customer: { select: { name: true } },
        },
        orderBy: [{ createdAt: "asc" }],
      }),
      prisma.settlement.findMany({
        where: { engineerId },
        select: {
          id: true,
          amount: true,
          direction: true,
          reason: true,
          settlementNumber: true,
          status: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.serviceRequest.findMany({
        where: { engineerId },
        select: {
          id: true,
          requestNumber: true,
          status: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.visit.findMany({
        where: { engineerId },
        select: {
          id: true,
          visitedAt: true,
          resolved: true,
          resolutionNotes: true,
          createdAt: true,
          serviceRequest: { select: { requestNumber: true } },
        },
        orderBy: { visitedAt: "asc" },
      }),
      prisma.engineerSalary.findMany({
        where: { engineerId },
        select: {
          id: true,
          month: true,
          year: true,
          commissionAmount: true,
          netPayable: true,
          isPaid: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.sparePartCustody.findMany({
        where: { engineerId },
        select: { id: true, quantityIssued: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  return assembleEngineerStatement({
    engineer,
    salesOrders,
    settlements,
    serviceRequests,
    visits,
    salaryRecords,
    custodyItems,
  });
}