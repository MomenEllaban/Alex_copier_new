import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    contract: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    engineer: { findMany: vi.fn(), count: vi.fn() },
    settlement: { aggregate: vi.fn() },
    expense: { aggregate: vi.fn() },
    machine: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    investorDistributionCycle: { findMany: vi.fn() },
    serviceRequest: { aggregate: vi.fn(), count: vi.fn() },
  },
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
}));

import { GET as overview } from "@/app/api/reports/route";
import { GET as contracts } from "@/app/api/reports/contracts/route";
import { GET as engineers } from "@/app/api/reports/engineers/route";
import { GET as cash } from "@/app/api/reports/cash/route";
import { GET as inspection } from "@/app/api/reports/inspection/route";
import { GET as warranties } from "@/app/api/reports/warranties/route";
import { GET as satisfaction } from "@/app/api/reports/satisfaction/route";
import { GET as investors } from "@/app/api/reports/investors/route";
import { GET as spareParts } from "@/app/api/reports/spare-parts/route";
import { marginForContractType } from "@/lib/reports";

const ROUTES = {
  overview,
  contracts,
  engineers,
  cash,
  inspection,
  warranties,
  satisfaction,
  investors,
  "spare-parts": spareParts,
} as const;

const signedIn = { id: "gm_1", role: "GENERAL_MANAGER" };

/** Every prisma method the report loaders can reach. */
function allPrismaMocks() {
  return [
    ...Object.values(mocks.prisma.contract),
    ...Object.values(mocks.prisma.engineer),
    ...Object.values(mocks.prisma.settlement),
    ...Object.values(mocks.prisma.expense),
    ...Object.values(mocks.prisma.machine),
    ...Object.values(mocks.prisma.product),
    ...Object.values(mocks.prisma.investorDistributionCycle),
    ...Object.values(mocks.prisma.serviceRequest),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue(signedIn);
  mocks.requirePageAccess.mockResolvedValue(signedIn);
  mocks.prisma.contract.findMany.mockResolvedValue([]);
  mocks.prisma.contract.count.mockResolvedValue(0);
  mocks.prisma.contract.aggregate.mockResolvedValue({ _sum: { value: null } });
  mocks.prisma.engineer.findMany.mockResolvedValue([]);
  mocks.prisma.engineer.count.mockResolvedValue(0);
  mocks.prisma.settlement.aggregate.mockResolvedValue({ _sum: { amount: null } });
  mocks.prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: null } });
  mocks.prisma.machine.findMany.mockResolvedValue([]);
  mocks.prisma.product.findMany.mockResolvedValue([]);
  mocks.prisma.investorDistributionCycle.findMany.mockResolvedValue([]);
  mocks.prisma.serviceRequest.aggregate.mockResolvedValue({ _count: { _all: 0 }, _avg: { customerRating: null } });
  mocks.prisma.serviceRequest.count.mockResolvedValue(0);
});

describe("report routes — auth", () => {
  it.each(Object.keys(ROUTES))("%s answers 401 to an anonymous caller", async (name) => {
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(null);
    const res = await ROUTES[name as keyof typeof ROUTES]();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it.each(Object.keys(ROUTES))("%s answers 403 when the reports page is denied", async (name) => {
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(signedIn);
    const res = await ROUTES[name as keyof typeof ROUTES]();
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(Object.keys(ROUTES))("%s queries nothing when access is denied", async (name) => {
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue(signedIn);
    await ROUTES[name as keyof typeof ROUTES]();
    for (const mock of allPrismaMocks()) expect(mock).not.toHaveBeenCalled();
  });
});

describe("report routes — envelope", () => {
  it("wraps row reports in { rows }", async () => {
    const res = await contracts();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ rows: [] });
  });

  it("returns the cash figures as { summary }", async () => {
    mocks.prisma.settlement.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 500 } })
      .mockResolvedValueOnce({ _sum: { amount: 120 } });
    mocks.prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 300 } });

    const res = await cash();
    const body = await res.json();
    expect(body).toEqual({
      summary: { totalCollected: 500, totalPendingVerification: 120, totalExpenses: 300, netCash: 200 },
    });
  });

  it("sums settlements in the database instead of reading every row", async () => {
    await cash();
    expect(mocks.prisma.settlement.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "VERIFIED" } }),
    );
    expect(mocks.prisma.settlement.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "INITIAL" } }),
    );
  });
});

describe("report routes — each report only loads its own tables", () => {
  it("the contracts report never touches settlements, expenses, machines or products", async () => {
    await contracts();
    expect(mocks.prisma.contract.findMany).toHaveBeenCalled();
    for (const mock of [
      ...Object.values(mocks.prisma.settlement),
      ...Object.values(mocks.prisma.expense),
      ...Object.values(mocks.prisma.machine),
      ...Object.values(mocks.prisma.product),
    ]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it("the cash report never touches contracts, machines or products", async () => {
    await cash();
    expect(mocks.prisma.settlement.aggregate).toHaveBeenCalled();
    for (const mock of [
      ...Object.values(mocks.prisma.contract),
      ...Object.values(mocks.prisma.machine),
      ...Object.values(mocks.prisma.product),
    ]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it("the spare parts report never touches contracts or settlements", async () => {
    await spareParts();
    expect(mocks.prisma.product.findMany).toHaveBeenCalled();
    for (const mock of [
      ...Object.values(mocks.prisma.contract),
      ...Object.values(mocks.prisma.settlement),
      ...Object.values(mocks.prisma.serviceRequest),
    ]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it("the overview loads counts rather than full tables", async () => {
    await overview();
    expect(mocks.prisma.contract.count).toHaveBeenCalled();
    expect(mocks.prisma.contract.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.engineer.findMany).not.toHaveBeenCalled();
  });
});

describe("contract profitability", () => {
  it("applies the margin table per contract type and falls back to the default", () => {
    expect(marginForContractType("MAINTENANCE")).toBe(0.22);
    expect(marginForContractType("MAINTENANCE_AND_PARTS")).toBe(0.28);
    expect(marginForContractType("NOT_A_REAL_TYPE")).toBe(0.2);
  });

  it("derives the visit count from _count rather than loading visit rows", async () => {
    mocks.prisma.contract.findMany.mockResolvedValue([
      {
        id: "c1",
        contractNumber: "C-1",
        contractType: "RENTAL",
        value: 1000,
        status: "ACTIVE",
        customer: { name: "عميل" },
        _count: { visits: 3 },
      },
    ]);

    const body = await (await contracts()).json();
    expect(body.rows).toEqual([
      { id: "c1", contractNumber: "C-1", customer: "عميل", contractType: "RENTAL", value: 1000, status: "ACTIVE", visitsCount: 3, estimatedProfit: 180 },
    ]);
  });
});

describe("machines needing inspection", () => {
  it("de-duplicates a machine matched by both conditions", async () => {
    const machine = {
      id: "m1",
      serialNumber: "SN-1",
      currentStatus: "UNDER_INSPECTION",
      product: { name: "Ricoh" },
      customerLocation: { name: "الإسكندرية" },
    };
    mocks.prisma.machine.findMany.mockResolvedValue([machine, machine]);

    const body = await (await inspection()).json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].serialNumber).toBe("SN-1");
  });
});
