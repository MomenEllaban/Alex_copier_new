import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    company: { findUnique: vi.fn() },
    salesOrder: { findMany: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
    expense: { findMany: vi.fn() },
    settlement: { findMany: vi.fn() },
    returnTransaction: { findMany: vi.fn() },
  };
  return { requireAuth: vi.fn(), db };
});

vi.mock("@/lib/auth-helpers", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));

import { GET } from "@/app/api/companies/[id]/report/route";

const company = { id: "c1", name: "alex-copier", nameAr: "اليكس كوبير" };

const creditOrder = (
  id: string,
  customerId: string,
  total: number,
  paidAmount: number,
  orderDate: string,
) => ({
  id,
  companyId: "c1",
  customerId,
  orderType: "SALE",
  status: "CONFIRMED",
  total,
  discount: 0,
  discountType: "FIXED",
  taxRate: 0,
  isTaxInvoice: false,
  paymentMethod: "CREDIT",
  paymentStatus: "PENDING",
  paidAmount,
  tradeInTotal: 0,
  notes: null,
  orderDate: new Date(orderDate),
  createdAt: new Date(orderDate),
  updatedAt: new Date(orderDate),
  items: [],
  customer: { id: customerId, name: "عميل " + customerId, phone: "0100000000" },
});

const emptyCollections = () => ({
  purchaseOrder: { findMany: vi.fn().mockResolvedValue([]) },
  expense: { findMany: vi.fn().mockResolvedValue([]) },
  settlement: { findMany: vi.fn().mockResolvedValue([]) },
  returnTransaction: { findMany: vi.fn().mockResolvedValue([]) },
});

const req = () => new Request("http://localhost/api/companies/c1/report");

describe("GET /api/companies/[id]/report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "u1", role: "GENERAL_MANAGER" });
    mocks.db.company.findUnique.mockResolvedValue(company);
  });

  it("drops a fully-paid credit customer from customerDebt and marks order PAID", async () => {
    mocks.db.salesOrder.findMany.mockResolvedValue([
      creditOrder("o1", "custA", 1000, 1000, "2026-08-10T10:00:00.000Z"),
    ]);
    Object.assign(mocks.db, {
      purchaseOrder: emptyCollections().purchaseOrder,
      expense: emptyCollections().expense,
      settlement: emptyCollections().settlement,
      returnTransaction: emptyCollections().returnTransaction,
    });

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.customerDebt.total).toBe(0);
    expect(body.customerDebt.details).toEqual([]);
    expect(body.sales.orders[0].paymentStatus).toBe("PAID");
    expect(body.sales.orders[0].paidAmount).toBe(1000);
    expect(body.cashPosition.cashFromSales).toBe(1000);
  });

  it("keeps a partially-paid credit customer in customerDebt with live PARTIAL status", async () => {
    mocks.db.salesOrder.findMany.mockResolvedValue([
      creditOrder("o1", "custA", 2800, 1900, "2026-08-10T10:00:00.000Z"),
    ]);
    Object.assign(mocks.db, {
      purchaseOrder: emptyCollections().purchaseOrder,
      expense: emptyCollections().expense,
      settlement: emptyCollections().settlement,
      returnTransaction: emptyCollections().returnTransaction,
    });

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    const body = await res.json();

    expect(body.customerDebt.total).toBe(900);
    expect(body.customerDebt.details).toEqual([
      expect.objectContaining({ customerId: "custA", balance: 900 }),
    ]);
    expect(body.sales.orders[0].paymentStatus).toBe("PARTIAL");
    expect(body.sales.orders[0].paidAmount).toBe(1900);
  });

  it("shows an unpaid credit order as PENDING with the full amount in customerDebt", async () => {
    mocks.db.salesOrder.findMany.mockResolvedValue([
      creditOrder("o1", "custA", 5000, 0, "2026-08-10T10:00:00.000Z"),
    ]);
    Object.assign(mocks.db, {
      purchaseOrder: emptyCollections().purchaseOrder,
      expense: emptyCollections().expense,
      settlement: emptyCollections().settlement,
      returnTransaction: emptyCollections().returnTransaction,
    });

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    const body = await res.json();

    expect(body.customerDebt.total).toBe(5000);
    expect(body.sales.orders[0].paymentStatus).toBe("PENDING");
    expect(body.cashPosition.cashFromSales).toBe(0);
  });

  it("counts all sales orders for a company regardless of their status (sales are saved immediately as the normal state of a sale)", async () => {
    mocks.db.salesOrder.findMany.mockResolvedValue([
      creditOrder("o1", "custA", 5000, 5000, "2026-08-10T10:00:00.000Z"),
    ]);
    Object.assign(mocks.db, {
      purchaseOrder: emptyCollections().purchaseOrder,
      expense: emptyCollections().expense,
      settlement: emptyCollections().settlement,
      returnTransaction: emptyCollections().returnTransaction,
    });

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    // The query must NOT filter by order status, otherwise newly created sales
    // (saved straight to CONFIRMED) would vanish from the report while still
    // counted on the company card.
    const where = mocks.db.salesOrder.findMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();

    expect(body.sales.total).toBe(5000);
    expect(body.customerDebt.total).toBe(0);
  });
});