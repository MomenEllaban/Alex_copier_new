import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireRole: mocks.requireRole,
  requireAuth: mocks.requireAuth,
}));

import { GET } from "@/app/api/data-reset/route";

describe("GET /api/data-reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.requireRole.mockResolvedValue({ id: "u1", role: "GENERAL_MANAGER" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports enabled outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).enabled).toBe(true);
  });

  it("reports disabled in production without the opt-in", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DATA_RESET", "");

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).enabled).toBe(false);
  });

  it("reports enabled in production only with ENABLE_DATA_RESET=1", async () => {
    vi.stubEnv("NODE_ENV", "production");

    for (const value of ["", "0", "true", "yes", " 1"]) {
      vi.stubEnv("ENABLE_DATA_RESET", value);
      expect((await GET()).status).toBe(200);
      expect((await (await GET()).json()).enabled).toBe(false);
    }

    vi.stubEnv("ENABLE_DATA_RESET", "1");
    expect((await (await GET()).json()).enabled).toBe(true);
  });

  it("is closed to anyone who is not a general manager", async () => {
    mocks.requireRole.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue({ id: "u2" });

    expect((await GET()).status).toBe(403);

    mocks.requireAuth.mockResolvedValue(null);

    expect((await GET()).status).toBe(401);
  });
});
