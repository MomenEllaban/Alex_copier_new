import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

const { requireAuth, db } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  db: {
    company: { findMany: vi.fn() },
    machine: { groupBy: vi.fn() },
    contract: { count: vi.fn(), findMany: vi.fn() },
    serviceRequest: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    visit: { count: vi.fn(), groupBy: vi.fn() },
    installment: { aggregate: vi.fn() },
    engineer: { findMany: vi.fn() },
    salesOrder: { aggregate: vi.fn() },
    purchaseOrder: { aggregate: vi.fn() },
    expense: { aggregate: vi.fn() },
    settlement: { aggregate: vi.fn() },
    warehouseInventory: { count: vi.fn() },
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth,
  // 1.7: the dashboard now checks the "dashboard" page. These tests are about
  // the payload, not the permission table, so mirror requireAuth.
  requirePageAccess: vi.fn(async () => requireAuth()),
  requireAnyPage: vi.fn(async () => requireAuth()),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: db,
}));

import { GET } from "@/app/api/dashboard/route";

const DAY_MS = 24 * 60 * 60 * 1000;
const FIXED_NOW = new Date("2026-08-15T12:00:00.000Z");

function sum(total: number | null) {
  return Promise.resolve({ _sum: { total } });
}
function sumAmount(amount: number | null) {
  return Promise.resolve({ _sum: { amount } });
}

function stubCleanQueries(overrides?: {
  openTotal?: number;
  urgent?: number;
  unassigned?: number;
  companyOpen?: Record<string, number>;
  lowStockItems?: number;
}) {
  const companyOpen = overrides?.companyOpen ?? { c1: 3 };
  db.company.findMany.mockResolvedValue([
    { id: "c1", name: "alex-copier", nameAr: "اليكس كوبير" },
    { id: "c2", name: "gulf-copier", nameAr: "الخليج كوبير" },
  ]);
  db.machine.groupBy.mockResolvedValue([
    { currentStatus: "UNDER_MAINTENANCE", _count: { _all: 4 } },
    { currentStatus: "IN_WAREHOUSE", _count: { _all: 9 } },
    { currentStatus: "SOLD", _count: { _all: 30 } },
  ]);
  db.contract.count.mockResolvedValue(12);
  db.warehouseInventory.count.mockResolvedValue(overrides?.lowStockItems ?? 3);
  db.serviceRequest.count.mockImplementation((args: { where: Record<string, unknown> }) => {
    const where = args.where;
    if ("companyId" in where) return Promise.resolve(companyOpen[where.companyId as string] ?? 0);
    if ("priority" in where) return Promise.resolve(overrides?.urgent ?? 2);
    if ("engineerId" in where && (where.engineerId === null || (typeof where.engineerId === "object" && where.engineerId !== null))) {
      return Promise.resolve(overrides?.unassigned ?? 1);
    }
    return Promise.resolve(overrides?.openTotal ?? 7);
  });
  db.visit.count.mockResolvedValue(15);
  db.serviceRequest.findMany.mockResolvedValue([
    {
      id: "r1",
      requestNumber: "SR-0001",
      description: "الجهاز لا تعمل",
      priority: "URGENT",
      status: "ASSIGNED",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      customer: { name: "شركة مصر" },
      machine: { serialNumber: "SN-77" },
      engineer: { name: "أحمد" },
    },
  ]);
  db.visit.groupBy.mockResolvedValue([{ engineerId: "e1", _count: { _all: 6 } }]);
  db.serviceRequest.groupBy.mockResolvedValue([
    { engineerId: "e1", _count: { _all: 3 } },
    { engineerId: "e2", _count: { _all: 5 } },
  ]);
  db.installment.aggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { amount: 7500 } });
  db.contract.findMany.mockResolvedValue([
    {
      id: "k1",
      contractNumber: "CT-10",
      endDate: new Date(FIXED_NOW.getTime() + 10 * DAY_MS),
      customer: { name: "مكتب النور" },
    },
    {
      id: "k2",
      contractNumber: "CT-11",
      endDate: new Date(FIXED_NOW.getTime() + 45 * DAY_MS),
      customer: null,
    },
  ]);
  db.engineer.findMany.mockResolvedValue([
    { id: "e1", name: "أحمد" },
    { id: "e2", name: "محمد" },
  ]);

  db.salesOrder.aggregate.mockImplementation((args: { where: { companyId: string } }) =>
    sum(args.where.companyId === "c1" ? 12345 : 0)
  );
  db.purchaseOrder.aggregate.mockImplementation((args: { where: { companyId: string } }) =>
    sum(args.where.companyId === "c1" ? 5000 : 0)
  );
  db.expense.aggregate.mockImplementation((args: { where: { companyId: string } }) =>
    sumAmount(args.where.companyId === "c1" ? 1200 : 0)
  );
  db.settlement.aggregate.mockImplementation((args: { where: { companyId: string } }) =>
    sumAmount(args.where.companyId === "c1" ? 9000 : 0)
  );
}

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ id: "u1", role: "GENERAL_MANAGER" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects unauthenticated requests with 401 without touching the database", async () => {
    requireAuth.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(db.company.findMany).not.toHaveBeenCalled();
  });

  it("builds the full operations payload from real aggregates", async () => {
    stubCleanQueries();

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    const expectedMonthStart = new Date(
      FIXED_NOW.getFullYear(),
      FIXED_NOW.getMonth(),
      1
    ).toISOString();

    expect(body.monthStart).toBe(expectedMonthStart);
    expect(new Date(body.generatedAt).toISOString()).toBe(FIXED_NOW.toISOString());

    expect(body.kpis).toEqual({
      openRequests: 7,
      urgentRequests: 2,
      unassignedRequests: 1,
      visitsThisMonth: 15,
      activeContracts: 12,
      machinesInService: 4,
    });

    expect(body.machineStatuses).toEqual({ UNDER_MAINTENANCE: 4, IN_WAREHOUSE: 9, SOLD: 30 });

    expect(body.companies).toEqual([
      { id: "c1", name: "اليكس كوبير", sales: 12345, purchases: 5000, expenses: 1200, collected: 9000, openRequests: 3 },
      { id: "c2", name: "الخليج كوبير", sales: 0, purchases: 0, expenses: 0, collected: 0, openRequests: 0 },
    ]);

    expect(body.alerts.map((alert: { kind: string }) => alert.kind)).toEqual([
      "URGENT_REQUESTS",
      "OVERDUE_INSTALLMENTS",
      "UNASSIGNED_REQUESTS",
      "CONTRACTS_EXPIRING",
      "LOW_STOCK",
    ]);
    const installmentAlert = body.alerts.find((alert: { kind: string }) => alert.kind === "OVERDUE_INSTALLMENTS");
    expect(installmentAlert.totalAmount).toBe(7500);
    const contractAlert = body.alerts.find((alert: { kind: string }) => alert.kind === "CONTRACTS_EXPIRING");
    expect(contractAlert.details).toHaveLength(1);
    expect(contractAlert.details[0]).toMatchObject({
      id: "k1",
      contractNumber: "CT-10",
      customerName: "مكتب النور",
      daysLeft: 10,
    });

    expect(body.recentRequests).toEqual([
      expect.objectContaining({
        id: "r1",
        requestNumber: "SR-0001",
        customerName: "شركة مصر",
        machineSerial: "SN-77",
        engineerName: "أحمد",
        createdAt: "2026-08-01T00:00:00.000Z",
      }),
    ]);

    expect(body.engineerWorkload).toEqual([
      { engineerId: "e2", name: "محمد", visitsThisMonth: 0, openAssigned: 5 },
      { engineerId: "e1", name: "أحمد", visitsThisMonth: 6, openAssigned: 3 },
    ]);
  });

  it("returns an empty alert list and zeroed finance for a quiet database", async () => {
    stubCleanQueries({
      openTotal: 0,
      urgent: 0,
      unassigned: 0,
      companyOpen: {},
      lowStockItems: 0,
    });
    db.installment.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: null } });
    db.contract.findMany.mockResolvedValue([]);
    db.machine.groupBy.mockResolvedValue([]);
    db.salesOrder.aggregate.mockResolvedValue({ _sum: { total: null } });
    db.purchaseOrder.aggregate.mockResolvedValue({ _sum: { total: null } });
    db.expense.aggregate.mockResolvedValue({ _sum: { amount: null } });
    db.settlement.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.kpis.openRequests).toBe(0);
    expect(body.kpis.machinesInService).toBe(0);
    expect(body.alerts).toEqual([]);
    expect(body.companies.every((company: { sales: number }) => company.sales === 0)).toBe(true);
  });

  it("maps database failures to a 500 error", async () => {
    db.company.findMany.mockRejectedValue(new Error("connection refused"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to load dashboard");
  });
});
