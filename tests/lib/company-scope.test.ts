import { describe, expect, it } from "vitest";

import {
  canActOnCompany,
  companyScopeFilter,
  isGroupLevelActor,
  resolveCompanyId,
} from "@/lib/company-scope";

/**
 * The shared company rules.
 *
 * A user is either tied to a company — the accountant of "شركة القطاعي" — or
 * is a group-level user who works across the group: the general manager, or an
 * HR manager with no home company. Both kinds have to work, and neither may
 * reach into a company that is not theirs.
 */

const companyUser = { id: "u1", role: "ACCOUNTANT", companyId: "c1" };
const groupUser = { id: "u2", role: "GENERAL_MANAGER", companyId: "c1" };
const companyLessUser = { id: "u3", role: "HR_MANAGER", companyId: null };

describe("company scope", () => {
  it("treats the general manager as a group-level user", () => {
    expect(isGroupLevelActor(groupUser)).toBe(true);
    expect(isGroupLevelActor(companyUser)).toBe(false);
    expect(isGroupLevelActor(companyLessUser)).toBe(true);
  });

  it("keeps a company-scoped user inside their company", () => {
    expect(canActOnCompany(companyUser, "c1")).toBe(true);
    expect(canActOnCompany(companyUser, "c2")).toBe(false);
  });

  it("lets a group-level user work on every company", () => {
    expect(canActOnCompany(groupUser, "c1")).toBe(true);
    expect(canActOnCompany(groupUser, "c2")).toBe(true);
    expect(canActOnCompany(companyLessUser, "c2")).toBe(true);
  });

  it("limits a list to the user's own company", () => {
    expect(companyScopeFilter(companyUser)).toBe("c1");
    // A company-scoped user cannot widen the list by asking for another one.
    expect(companyScopeFilter(companyUser, "c2")).toBe("c1");
  });

  it("lets a group-level user list every company or the one they name", () => {
    expect(companyScopeFilter(groupUser)).toBeNull();
    expect(companyScopeFilter(groupUser, "c2")).toBe("c2");
  });

  it("books a write in the user's own company", () => {
    expect(resolveCompanyId(companyUser, "c2")).toBe("c1");
    expect(resolveCompanyId(companyUser)).toBe("c1");
  });

  it("books a write in the company a group-level user names", () => {
    expect(resolveCompanyId(groupUser, "c2")).toBe("c2");
    // Without a company named, a group-level user falls back to their own.
    expect(resolveCompanyId(groupUser)).toBe("c1");
    expect(resolveCompanyId(companyLessUser)).toBeNull();
  });
});
