import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    customer: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    company: {
      findUnique: vi.fn(),
    },
    customerLedger: {
      upsert: vi.fn(),
    },
  },
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  // Action guards delegate to the page guard: these tests decide who is
  // allowed, not which action, and the page answer is what they mean.
  requireAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyAction: (page: string) => mocks.requirePageAccess(page),
}));

import { POST } from "@/app/api/customers/route";
import { PUT } from "@/app/api/customers/[id]/route";

const gm = { id: "gm_1", role: "GENERAL_MANAGER" };

const jsonRequest = (url: string, method: string, body: object) =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const baseCustomer = {
  id: "c1", name: "خالد", totalDebt: 500, remainingDebt: 500,
  companyName: null, contactPerson: null, phone: null, email: null, address: null,
  customerType: "INDIVIDUAL", taxNumber: null, creditLimit: 0,
  gpsLat: null, gpsLng: null, tradeRegister: null, paymentTerms: null,
  companyId: null, whatsapp: null, city: null, governorate: null,
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

describe("customers debt clamping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue(gm);
  });

  it("POST rejects negative debt by clamping it to zero", async () => {
    mocks.prisma.customer.create.mockResolvedValue({ ...baseCustomer });
    mocks.prisma.customer.findUnique.mockResolvedValue(baseCustomer);

    const res = await POST(jsonRequest("http://localhost/api/customers", "POST", {
      name: "سالب",
      totalDebt: -500,
      remainingDebt: -700,
    }));
    expect(res.status).toBe(201);
    const arg = mocks.prisma.customer.create.mock.calls[0][0];
    expect(arg.data.totalDebt).toBe(0);
    expect(arg.data.remainingDebt).toBe(0);
  });

  it("POST keeps the given remaining debt when both are positive", async () => {
    mocks.prisma.customer.create.mockResolvedValue({ ...baseCustomer });
    mocks.prisma.customer.findUnique.mockResolvedValue(baseCustomer);

    await POST(jsonRequest("http://localhost/api/customers", "POST", {
      name: "مدين",
      totalDebt: 700,
      remainingDebt: 350,
    }));
    const arg = mocks.prisma.customer.create.mock.calls[0][0];
    expect(arg.data.totalDebt).toBe(700);
    expect(arg.data.remainingDebt).toBe(350);
  });

  it("PUT clamps negative remainingDebt and totalDebt to zero", async () => {
    mocks.prisma.customer.update.mockResolvedValue({ ...baseCustomer });

    const res = await PUT(
      jsonRequest("http://localhost/api/customers/c1", "PUT", { totalDebt: -100, remainingDebt: -700 }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(200);
    const arg = mocks.prisma.customer.update.mock.calls[0][0];
    expect(arg.data.totalDebt).toBe(0);
    expect(arg.data.remainingDebt).toBe(0);
  });

  it("PUT keeps positive debts unchanged", async () => {
    mocks.prisma.customer.update.mockResolvedValue({ ...baseCustomer });

    await PUT(
      jsonRequest("http://localhost/api/customers/c1", "PUT", { totalDebt: 700, remainingDebt: 250 }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    const arg = mocks.prisma.customer.update.mock.calls[0][0];
    expect(arg.data.totalDebt).toBe(700);
    expect(arg.data.remainingDebt).toBe(250);
  });
});