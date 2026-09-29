import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireAuth: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireRole: mocks.requireRole,
  requireAuth: mocks.requireAuth,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { GET } from "@/app/api/data-reset/route";
import { POST } from "@/app/api/companies/[id]/reset-transactions/route";
import {
  isCompanyResetEnabled,
  isConfirmationValid,
  isDataResetEnabled,
} from "@/lib/data-reset";

/**
 * The two wipes carry different risk, so they carry different guards:
 *
 *   the whole-database wipe  -> dark in production unless ENABLE_DATA_RESET=1
 *   zeroing one company     -> on by default, but the request must echo the
 *                              company name back
 */

const params = { params: Promise.resolve({ id: "c1" }) };
const body = (payload: unknown) =>
  new Request("http://x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.requireRole.mockResolvedValue({ id: "u1", role: "GENERAL_MANAGER" });
  mocks.requireAuth.mockResolvedValue({ id: "u1", role: "GENERAL_MANAGER" });
  mocks.prisma.company.findUnique.mockResolvedValue({ id: "c1", name: "Acme" });
  mocks.prisma.$transaction.mockResolvedValue({
    returns: 0,
    settlements: 0,
    expenses: 0,
    purchaseInvoices: 0,
    purchases: 0,
    sales: 0,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the two switches", () => {
  it("keeps the whole-database wipe dark in production without the opt-in", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DATA_RESET", "");

    expect(isDataResetEnabled()).toBe(false);

    vi.stubEnv("ENABLE_DATA_RESET", "1");
    expect(isDataResetEnabled()).toBe(true);
  });

  it("leaves the per-company wipe on in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_COMPANY_RESET", "");

    expect(isCompanyResetEnabled()).toBe(true);
  });

  it("lets a deployment lock the per-company wipe out", () => {
    vi.stubEnv("ENABLE_COMPANY_RESET", "0");

    expect(isCompanyResetEnabled()).toBe(false);
  });
});

describe("GET /api/data-reset", () => {
  it("reports both switches", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DATA_RESET", "");
    vi.stubEnv("ENABLE_COMPANY_RESET", "");

    const res = await GET();
    const body = (await res.json()) as { enabled: boolean; companyEnabled: boolean };

    expect(res.status).toBe(200);
    // The system-wide wipe is locked, the company one is available: this is the
    // combination that used to leave the companies page showing a dead end.
    expect(body.enabled).toBe(false);
    expect(body.companyEnabled).toBe(true);
  });

  it("is closed to anyone who is not a general manager", async () => {
    mocks.requireRole.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue({ id: "u2" });
    expect((await GET()).status).toBe(403);

    mocks.requireAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});

describe("the confirmation contract", () => {
  it("accepts only the exact name", () => {
    expect(isConfirmationValid("Acme", "Acme")).toBe(true);
    expect(isConfirmationValid("  Acme  ", "Acme")).toBe(true);
    expect(isConfirmationValid("acme", "Acme")).toBe(false);
    expect(isConfirmationValid("Acme Ltd", "Acme")).toBe(false);
    expect(isConfirmationValid("", "Acme")).toBe(false);
    expect(isConfirmationValid(undefined, "Acme")).toBe(false);
    expect(isConfirmationValid(null, "Acme")).toBe(false);
    expect(isConfirmationValid(42, "Acme")).toBe(false);
  });
});

describe("POST /api/companies/[id]/reset-transactions", () => {
  it("refuses a request with no confirmation, without touching the data", async () => {
    const res = await POST(body({}), params);

    expect(res.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a confirmation that does not match the company name", async () => {
    const res = await POST(body({ confirm: "Wrong Name" }), params);

    expect(res.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("proceeds once the name is echoed back", async () => {
    const res = await POST(body({ confirm: "Acme" }), params);

    expect(res.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalled();
  });

  it("is still closed to anyone who is not a general manager", async () => {
    mocks.requireRole.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue({ id: "u2" });

    const res = await POST(body({ confirm: "Acme" }), params);

    expect(res.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("stays 404 when a deployment locks the wipe out", async () => {
    vi.stubEnv("ENABLE_COMPANY_RESET", "0");

    const res = await POST(body({ confirm: "Acme" }), params);

    expect(res.status).toBe(404);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
