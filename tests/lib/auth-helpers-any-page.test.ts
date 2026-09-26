import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercises the real resolution path: only Prisma is mocked, so
// resolvePermissions -> canViewPage runs for real. Controlling access through
// the role row the database returns is closer to production than stubbing the
// permission predicate.
const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    role: { findUnique: vi.fn() },
  },
  auth: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { requireAnyPage, requirePageAccess, requireAction } from "@/lib/auth-helpers";
import { invalidatePermissionCache } from "@/lib/permissions-server";

/** A Role row granting `canView` pages, with only a "view" action on each. */
function roleRow(pages: string[], roleKey = "ACCOUNTANT") {
  return {
    id: "r1",
    key: roleKey,
    isSystem: false,
    pages: pages.map((key) => ({ page: { key } })),
    actionPermissions: pages.map((key) => ({ action: { key: "view", page: { key } } })),
  };
}

describe("requireAnyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidatePermissionCache();
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "ACCOUNTANT" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      isActive: true,
      role: "ACCOUNTANT",
      roleId: "r1",
      companyId: null,
    });
    mocks.prisma.role.findUnique.mockResolvedValue(roleRow(["reports", "companies"]));
  });

  it("returns the user when any one of the pages is allowed", async () => {
    await expect(requireAnyPage("reports", "companies")).resolves.toMatchObject({ id: "u1" });
  });

  it("returns null when the role has none of the pages", async () => {
    mocks.prisma.role.findUnique.mockResolvedValue(roleRow([]));

    await expect(requireAnyPage("reports", "companies")).resolves.toBeNull();
  });

  it("returns null when nobody is signed in", async () => {
    mocks.auth.mockResolvedValue(null);

    await expect(requireAnyPage("reports")).resolves.toBeNull();
  });

  it("returns null for a deactivated account, even with the right role", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      isActive: false,
      role: "ACCOUNTANT",
      roleId: "r1",
    });

    await expect(requireAnyPage("reports")).resolves.toBeNull();
  });

  it("checks every page it was given, not just the first", async () => {
    // Only the third page is granted; the first two must not short-circuit it.
    mocks.prisma.role.findUnique.mockResolvedValue(roleRow(["inventory"]));

    await expect(requireAnyPage("reports", "warehouses", "inventory")).resolves.toMatchObject({
      id: "u1",
    });
  });

  it("does not match a role the permission table does not know", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "GHOST" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      isActive: true,
      role: "GHOST",
      roleId: null,
    });

    await expect(requireAnyPage("reports")).resolves.toBeNull();
  });

  it("agrees with requirePageAccess for a single page", async () => {
    await expect(requirePageAccess("reports")).resolves.toMatchObject({ id: "u1" });
    await expect(requirePageAccess("settlements")).resolves.toBeNull();
  });
});

describe("requireAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidatePermissionCache();
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "ACCOUNTANT" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      isActive: true,
      role: "ACCOUNTANT",
      roleId: "r1",
    });
    mocks.prisma.role.findUnique.mockResolvedValue({
      id: "r1",
      key: "ACCOUNTANT",
      isSystem: false,
      pages: [{ page: { key: "customers" } }],
      actionPermissions: [{ action: { key: "view", page: { key: "customers" } } }],
    });
  });

  it("allows an action the role holds", async () => {
    await expect(requireAction("customers", "view")).resolves.toMatchObject({ id: "u1" });
  });

  it("refuses an action the role does not hold, even on a page it can see", async () => {
    // This is the Postman case: the page is open, the button is not permitted.
    await expect(requireAction("customers", "delete")).resolves.toBeNull();
  });

  it("refuses an action on a page the role cannot see at all", async () => {
    await expect(requireAction("finance", "view")).resolves.toBeNull();
  });

  it("never locks the general manager out", async () => {
    mocks.prisma.role.findUnique.mockResolvedValue({
      id: "r2",
      key: "GENERAL_MANAGER",
      isSystem: true,
      pages: [],
      actionPermissions: [],
    });

    await expect(requireAction("finance", "delete")).resolves.toMatchObject({ id: "u1" });
  });
});
