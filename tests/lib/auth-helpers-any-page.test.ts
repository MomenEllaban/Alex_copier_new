import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
  requireAnyPage: vi.fn(),
  hasPageAccess: vi.fn(),
  prisma: { user: { findUnique: vi.fn() } },
  auth: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/permissions")>("@/lib/permissions");
  return { ...actual, hasPageAccess: mocks.hasPageAccess };
});

import { requireAnyPage, requirePageAccess } from "@/lib/auth-helpers";

describe("requireAnyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "ACCOUNTANT" } });
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "u1", isActive: true });
    mocks.hasPageAccess.mockImplementation((role, page) => page === "reports" || page === "companies");
  });

  it("returns the user when any one of the pages is allowed", async () => {
    await expect(requireAnyPage("reports", "companies")).resolves.toMatchObject({ id: "u1" });
  });

  it("returns null when the role has none of the pages", async () => {
    mocks.hasPageAccess.mockReturnValue(false);

    await expect(requireAnyPage("reports", "companies")).resolves.toBeNull();
  });

  it("returns null when nobody is signed in", async () => {
    mocks.auth.mockResolvedValue(null);

    await expect(requireAnyPage("reports")).resolves.toBeNull();
  });

  it("returns null for a deactivated account, even with the right role", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "u1", isActive: false });

    await expect(requireAnyPage("reports")).resolves.toBeNull();
  });

  it("checks every page it was given, not just the first", async () => {
    mocks.hasPageAccess.mockImplementation((_role, page) => page === "inventory");

    await expect(requireAnyPage("reports", "warehouses", "inventory")).resolves.toMatchObject({
      id: "u1",
    });
    expect(mocks.hasPageAccess).toHaveBeenCalledTimes(3);
  });

  it("does not match a role the permission table does not know", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "GHOST" } });
    mocks.hasPageAccess.mockReturnValue(false);

    await expect(requireAnyPage("reports")).resolves.toBeNull();
  });

  it("agrees with requirePageAccess for a single page", async () => {
    await expect(requirePageAccess("reports")).resolves.toMatchObject({ id: "u1" });
    await expect(requirePageAccess("settlements")).resolves.toBeNull();
  });
});
