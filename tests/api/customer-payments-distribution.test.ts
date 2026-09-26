import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    customer: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    customerLedger: {
      upsert: vi.fn(),
    },
    customerPayment: {
      create: vi.fn(),
    },
    salesOrder: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  return {
    prisma: {
      customer: { findUnique: vi.fn() },
      company: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
    requireAuth: vi.fn(),
    requirePageAccess: vi.fn(),
    recalculatePaymentStatus: vi.fn(),
    getEffectiveTotal: vi.fn(),
    tx,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  // Action guards delegate to the page guard: these tests decide who is
  // allowed, not which action, and the page answer is what they mean.
  requireAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyAction: (page: string) => mocks.requirePageAccess(page),
}));
vi.mock("@/lib/payment-status", () => ({
  recalculatePaymentStatus: mocks.recalculatePaymentStatus,
  getEffectiveTotal: mocks.getEffectiveTotal,
}));

import { POST } from "@/app/api/customers/[id]/payments/route";

const gm = { id: "gm_1", role: "GENERAL_MANAGER" };

const jsonRequest = (url: string, method: string, body: object) =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const customer = {
  id: "c1", name: "خالد", totalDebt: 1000, remainingDebt: 1000,
  companyName: null, contactPerson: null, phone: null, email: null, address: null,
  customerType: "INDIVIDUAL", taxNumber: null, creditLimit: 0,
  gpsLat: null, gpsLng: null, tradeRegister: null, paymentTerms: null,
  companyId: null, whatsapp: null, city: null, governorate: null,
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

describe("customer payment auto-distribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
    mocks.prisma.customer.findUnique.mockResolvedValue(customer);
    mocks.prisma.company.findUnique.mockResolvedValue({ id: "co1" });

    mocks.prisma.$transaction.mockImplementation(async (cb: (tx: typeof mocks.tx) => Promise<unknown>) => {
      return cb(mocks.tx);
    });

    mocks.recalculatePaymentStatus.mockResolvedValue("PARTIAL");
    mocks.getEffectiveTotal.mockImplementation(async (_tx: unknown, _id: string, total: number) => total);
    mocks.tx.salesOrder.findMany.mockResolvedValue([
      { id: "o1", total: 800, paidAmount: 0 },
      { id: "o2", total: 200, paidAmount: 0 },
    ]);
    mocks.tx.customerPayment.create.mockImplementation(async (args: { data: { amount: number } }) => ({
      id: "pay1", ...args.data,
    }));
    mocks.tx.customer.update.mockResolvedValue({});
    mocks.tx.salesOrder.update.mockResolvedValue({});
    mocks.tx.customerLedger.upsert.mockResolvedValue({});
  });

  it("distributes payment FIFO across unpaid orders and updates paidAmount", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/customers/c1/payments", "POST", {
        amount: 600, companyId: "co1",
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );

    expect(res.status).toBe(201);
    // First order fully paid (800 updated by 600)
    expect(mocks.tx.salesOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paidAmount: { increment: 600 } } })
    );
    // remaining 200 from second order untouched since only 600 applied
    expect(mocks.tx.salesOrder.update).toHaveBeenCalledTimes(1);
    // ledger decremented by full payment
    const ledgerCall = mocks.tx.customerLedger.upsert.mock.calls[0][0];
    expect(ledgerCall.update.balance.decrement).toBe(600);
  });

  it("distributes across all customer orders regardless of selected company", async () => {
    mocks.tx.salesOrder.findMany.mockResolvedValue([
      { id: "o1", total: 800, paidAmount: 0, companyId: "co1" },
      { id: "o2", total: 200, paidAmount: 0, companyId: "co1" },
    ]);
    const res = await POST(
      jsonRequest("http://localhost/api/customers/c1/payments", "POST", {
        amount: 300, companyId: "co2",
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(201);
    // Even though a different company was selected, the payment still hits the
    // customer's outstanding orders so the owning company's report stays live.
    expect(mocks.tx.salesOrder.update).toHaveBeenCalledTimes(1);
  });

  it("attributes the payment to the first order's company when none selected", async () => {
    mocks.tx.salesOrder.findMany.mockResolvedValue([
      { id: "o1", total: 800, paidAmount: 0, companyId: "co9" },
    ]);
    const res = await POST(
      jsonRequest("http://localhost/api/customers/c1/payments", "POST", {
        amount: 300,
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(201);
    const createCall = mocks.tx.customerPayment.create.mock.calls[0][0];
    expect(createCall.data.companyId).toBe("co9");
  });

  it("turns an overpayment into credit under the customer's account", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/customers/c1/payments", "POST", {
        amount: 2000, companyId: "co1",
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(201);
    const updateCall = mocks.tx.customer.update.mock.calls[0][0];
    expect(updateCall.data.remainingDebt).toBe(-1000);
  });
});
