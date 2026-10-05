export const OPEN_REQUEST_STATUSES = ["NEW", "ASSIGNED", "VISITED", "NOT_RESOLVED", "REASSIGNED"] as const;

export const CONTRACT_EXPIRY_WINDOW_DAYS = 30;

export interface CompanyRecord {
  id: string;
  name: string;
  nameAr?: string | null;
}

export interface SumAggregate {
  _sum: { total: number | null };
}

export interface AmountAggregate {
  _sum: { amount: number | null };
}

export interface CompanyFinanceRaw {
  sales: SumAggregate;
  purchases: SumAggregate;
  expenses: AmountAggregate;
  settlements: AmountAggregate;
  openRequests: number;
}

export interface CompanyPerformance {
  id: string;
  name: string;
  sales: number;
  purchases: number;
  expenses: number;
  collected: number;
  openRequests: number;
}

export function buildCompanyPerformance(
  companies: CompanyRecord[],
  financeByCompany: Record<string, CompanyFinanceRaw | undefined>
): CompanyPerformance[] {
  return companies.map((company) => {
    const finance = financeByCompany[company.id];
    return {
      id: company.id,
      name: company.nameAr || company.name,
      sales: finance?.sales._sum.total ?? 0,
      purchases: finance?.purchases._sum.total ?? 0,
      expenses: finance?.expenses._sum.amount ?? 0,
      collected: finance?.settlements._sum.amount ?? 0,
      openRequests: finance?.openRequests ?? 0,
    };
  });
}

export type MachineStatusCounts = Record<string, number>;

export function machinesInService(statuses: MachineStatusCounts): number {
  return (statuses.UNDER_MAINTENANCE ?? 0) + (statuses.UNDER_INSPECTION ?? 0);
}

export interface EngineerRef {
  id: string;
  name: string;
}

interface EngineerCountGroup {
  engineerId: string;
  _count: { _all: number };
}

export interface EngineerWorkloadRow {
  engineerId: string;
  name: string;
  visitsThisMonth: number;
  openAssigned: number;
}

function countsByEngineer(groups: EngineerCountGroup[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const group of groups) {
    map.set(group.engineerId, group._count._all);
  }
  return map;
}

export function buildEngineerWorkload(
  engineerVisits: EngineerCountGroup[],
  engineerAssigned: EngineerCountGroup[],
  engineers: EngineerRef[]
): EngineerWorkloadRow[] {
  const visits = countsByEngineer(engineerVisits);
  const assigned = countsByEngineer(engineerAssigned);
  const names = new Map(engineers.map((engineer) => [engineer.id, engineer.name]));

  const ids = new Set<string>([...visits.keys(), ...assigned.keys()]);
  const rows = [...ids].map((id) => ({
    engineerId: id,
    name: names.get(id) ?? "—",
    visitsThisMonth: visits.get(id) ?? 0,
    openAssigned: assigned.get(id) ?? 0,
  }));

  rows.sort((a, b) =>
    b.openAssigned - a.openAssigned ||
    b.visitsThisMonth - a.visitsThisMonth ||
    a.name.localeCompare(b.name)
  );
  return rows;
}

export type AlertKind =
  | "URGENT_REQUESTS"
  | "UNASSIGNED_REQUESTS"
  | "OVERDUE_INSTALLMENTS"
  | "CONTRACTS_EXPIRING"
  | "LOW_STOCK"
  | "NEGATIVE_STOCK";

export type AlertSeverity = "HIGH" | "MEDIUM";

export interface ExpiringContract {
  id: string;
  contractNumber: string;
  customerName: string | null;
  endDate: string;
  daysLeft: number;
}

export interface DashboardAlert {
  kind: AlertKind;
  severity: AlertSeverity;
  href: string;
  count: number;
  totalAmount?: number;
  details?: ExpiringContract[];
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { HIGH: 0, MEDIUM: 1 };

export function buildExpiringContracts(
  contracts: {
    id: string;
    contractNumber: string;
    endDate: Date | string;
    customer?: { name: string } | null;
  }[],
  now: Date
): ExpiringContract[] {
  const dayMs = 24 * 60 * 60 * 1000;
  return contracts
    .map((contract) => {
      const end = new Date(contract.endDate);
      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / dayMs);
      return {
        id: contract.id,
        contractNumber: contract.contractNumber,
        customerName: contract.customer?.name ?? null,
        endDate: end.toISOString(),
        daysLeft,
      };
    })
    .filter((contract) => contract.daysLeft >= 0 && contract.daysLeft <= CONTRACT_EXPIRY_WINDOW_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function buildAlerts(input: {
  urgentRequests: number;
  unassignedRequests: number;
  overdueInstallments: { count: number; totalAmount: number };
  expiringContracts: ExpiringContract[];
  lowStockItems?: number;
  negativeStockItems?: number;
}): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  if (input.urgentRequests > 0) {
    alerts.push({ kind: "URGENT_REQUESTS", severity: "HIGH", href: "/service-requests", count: input.urgentRequests });
  }
  // HIGH, and above low stock: a negative balance means stock was sold that was
  // never there. It is an accounting hole to close, not a reorder reminder.
  if ((input.negativeStockItems ?? 0) > 0) {
    alerts.push({
      kind: "NEGATIVE_STOCK",
      severity: "HIGH",
      href: "/reports/negative-stock",
      count: input.negativeStockItems ?? 0,
    });
  }
  if (input.overdueInstallments.count > 0) {
    alerts.push({
      kind: "OVERDUE_INSTALLMENTS",
      severity: "HIGH",
      href: "/sales",
      count: input.overdueInstallments.count,
      totalAmount: input.overdueInstallments.totalAmount,
    });
  }
  if (input.unassignedRequests > 0) {
    alerts.push({ kind: "UNASSIGNED_REQUESTS", severity: "MEDIUM", href: "/service-requests", count: input.unassignedRequests });
  }
  if (input.expiringContracts.length > 0) {
    alerts.push({
      kind: "CONTRACTS_EXPIRING",
      severity: "MEDIUM",
      href: "/contracts",
      count: input.expiringContracts.length,
      details: input.expiringContracts.slice(0, 5),
    });
  }
  if ((input.lowStockItems ?? 0) > 0) {
    alerts.push({ kind: "LOW_STOCK", severity: "MEDIUM", href: "/inventory", count: input.lowStockItems ?? 0 });
  }

  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return alerts;
}

export interface RecentRequestRow {
  id: string;
  requestNumber: string;
  description: string;
  priority: string;
  status: string;
  createdAt: Date | string;
  customerName: string;
  machineSerial: string | null;
  engineerName: string | null;
}

export interface RecentRequestView {
  id: string;
  requestNumber: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  customerName: string;
  machineSerial: string | null;
  engineerName: string | null;
}

export function toRecentRequestViews(rows: {
  id: string;
  requestNumber: string;
  description: string;
  priority: string;
  status: string;
  createdAt: Date | string;
  customer?: { name: string } | null;
  machine?: { serialNumber: string } | null;
  engineer?: { name: string } | null;
}[]): RecentRequestView[] {
  return rows.map((row) => ({
    id: row.id,
    requestNumber: row.requestNumber,
    description: row.description,
    priority: row.priority,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString(),
    customerName: row.customer?.name ?? "—",
    machineSerial: row.machine?.serialNumber ?? null,
    engineerName: row.engineer?.name ?? null,
  }));
}

export interface DashboardPayload {
  role?: string;
  view?: "MANAGEMENT" | "ENGINEER";
  monthStart: string;
  generatedAt: string;
  kpis: {
    openRequests: number;
    urgentRequests: number;
    unassignedRequests: number;
    visitsThisMonth: number;
    activeContracts: number;
    machinesInService: number;
  };
  machineStatuses: MachineStatusCounts;
  companies: CompanyPerformance[];
  alerts: DashboardAlert[];
  recentRequests: RecentRequestView[];
  engineerWorkload: EngineerWorkloadRow[];
}
