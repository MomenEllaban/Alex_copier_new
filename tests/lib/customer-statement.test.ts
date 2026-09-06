import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    customer: { findUnique: vi.fn() },
    salesOrder: { findMany: vi.fn() },
    customerPayment: { findMany: vi.fn() },
    returnTransaction: { findMany: vi.fn() },
    settlement: { findMany: vi.fn() },
  };
  return { db };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));

import { buildCustomerStatement } from "@/lib/customer-statement";

const D = (iso: string) => new Date(iso);

const customer = (overrides: Record<string, unknown> = {}) => ({
  id: "cust-1",
  name: "أحمد رجب",
  companyName: "شركة النور",
  phone: "01000000000",
  totalDebt: 0,
  remainingDebt: 0,
  ...overrides,
});

const sale = (id: string, total: number, overrides: Record<string, unknown> = {}) => ({
  id,
  total,
  paymentMethod: "CREDIT",
  orderDate: D("2026-01-01"),
  createdAt: D("2026-01-01"),
  status: "CONFIRMED",
  notes: null,
  ...overrides,
});

const payment = (id: string, amount: number) => ({
  id,
  amount,
  paymentDate: D("2026-01-10"),
  createdAt: D("2026-01-10"),
  notes: null,
});

const ret = (id: string, total: number) => ({
  id,
  total,
  createdAt: D("2026-01-11"),
  reason: null,
  status: "APPROVED",
});

const settlement = (id: string, amount: number, direction: string, overrides: Record<string, unknown> = {}) => ({
  id,
  amount,
  direction,
  reason: null,
  settlementNumber: `S-${id}`,
  createdAt: D("2026-01-12"),
  status: "VERIFIED",
  ...overrides,
});

function reset() {
  mocks.db.customer.findUnique.mockReset();
  mocks.db.salesOrder.findMany.mockReset();
  mocks.db.customerPayment.findMany.mockReset();
  mocks.db.returnTransaction.findMany.mockReset();
  mocks.db.settlement.findMany.mockReset();
}

function seed(s: {
  findUnique?: ReturnType<typeof customer>;
  sales?: ReturnType<typeof sale>[];
  payments?: ReturnType<typeof payment>[];
  returns?: ReturnType<typeof ret>[];
  settlements?: ReturnType<typeof settlement>[];
}) {
  mocks.db.customer.findUnique.mockResolvedValue(s.findUnique ?? null);
  mocks.db.salesOrder.findMany.mockResolvedValue(s.sales ?? []);
  mocks.db.customerPayment.findMany.mockResolvedValue(s.payments ?? []);
  mocks.db.returnTransaction.findMany.mockResolvedValue(s.returns ?? []);
  mocks.db.settlement.findMany.mockResolvedValue(s.settlements ?? []);
}

describe("customer-statement", () => {
  beforeEach(reset);

  it("counts CASH sales as debit = credit (no effect on the balance)", async () => {
    seed({
      findUnique: customer(),
      sales: [sale("so-1", 5000, { paymentMethod: "CASH" })],
    });

    const s = await buildCustomerStatement("cust-1");
    expect(s?.rows).toHaveLength(1);
    expect(s?.rows[0].debit).toBe(5000);
    expect(s?.rows[0].credit).toBe(5000);
    expect(s?.rows[0].amount).toBe(0);
    expect(s?.rows[0].balance).toBe(0);
    expect(s?.openingBalance).toBe(0);
    expect(s?.closingBalance).toBe(0);
  });

  it("counts CREDIT sales as debit and no credit", async () => {
    seed({
      findUnique: customer({ totalDebt: 8000, remainingDebt: 8000 }),
      sales: [sale("so-1", 8000)],
    });

    const s = await buildCustomerStatement("cust-1");
    expect(s?.rows[0].debit).toBe(8000);
    expect(s?.rows[0].credit).toBe(0);
    expect(s?.rows[0].amount).toBe(8000);
    expect(s?.openingBalance).toBe(0);
    expect(s?.closingBalance).toBe(8000);
  });

  it("pushes payments, approved returns, and collected settlements to credit", async () => {
    seed({
      findUnique: customer({ totalDebt: 14000, remainingDebt: 9000 }),
      sales: [sale("so-1", 10000), sale("so-2", 4000, { createdAt: D("2026-01-14") })],
      payments: [payment("p-1", 3000)],
      returns: [ret("r-1", 1000)],
      settlements: [settlement("st-1", 1000, "ADDITION")],
    });

    const s = await buildCustomerStatement("cust-1");
    const paymentRow = s?.rows.find((r) => r.type === "PAYMENT");
    const returnRow = s?.rows.find((r) => r.type === "RETURN");
    const additionRow = s?.rows.find((r) => r.type === "SETTLEMENT");
    expect(paymentRow?.debit).toBe(0);
    expect(paymentRow?.credit).toBe(3000);
    expect(returnRow?.debit).toBe(0);
    expect(returnRow?.credit).toBe(1000);
    expect(additionRow?.debit).toBe(0);
    expect(additionRow?.credit).toBe(1000);
    // remaining = 14000 - 3000 - 1000 - 1000 = 9000
    expect(s?.closingBalance).toBe(9000);
  });

  it("counts SUBTRACTION settlements as debit (money paid to the customer)", async () => {
    seed({
      findUnique: customer({ totalDebt: 10000, remainingDebt: 10500 }),
      sales: [sale("so-1", 10000)],
      settlements: [settlement("st-1", 500, "SUBTRACTION")],
    });

    const s = await buildCustomerStatement("cust-1");
    const row = s?.rows.find((r) => r.type === "SETTLEMENT");
    expect(row?.debit).toBe(500);
    expect(row?.credit).toBe(0);
    expect(s?.closingBalance).toBe(10500);
  });

  it("reconciles CASH sales that consumed under-account credit", async () => {
    // Customer had 1000 under account (-1000), then a 1500 cash sale used the
    // credit and 500 was paid cash. remainingDebt returns to 0; the statement
    // shows the 1000 consumption as a credit payment.
    seed({
      findUnique: customer(),
      sales: [sale("so-1", 1500, { paymentMethod: "CASH" })],
      payments: [payment("p-1", 1000)],
    });

    const s = await buildCustomerStatement("cust-1");
    expect(s?.openingBalance).toBe(1000);
    const saleRow = s?.rows.find((r) => r.type === "SALE");
    const paymentRow = s?.rows.find((r) => r.type === "PAYMENT");
    expect(saleRow?.debit).toBe(1500);
    expect(saleRow?.credit).toBe(1500);
    expect(paymentRow?.credit).toBe(1000);
    expect(s?.closingBalance).toBe(0);
  });

  it("exposes under-account money via creditBalance when closing is negative", async () => {
    seed({
      findUnique: customer({ totalDebt: 10000, remainingDebt: -500 }),
      sales: [sale("so-1", 10000)],
      payments: [payment("p-1", 10500)],
    });

    const s = await buildCustomerStatement("cust-1");
    expect(s?.closingBalance).toBe(-500);
    expect(s?.creditBalance).toBe(500);
  });
});