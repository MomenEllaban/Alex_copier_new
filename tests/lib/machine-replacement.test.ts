import { describe, it, expect } from "vitest";
import {
  isMachineDeletable,
  describeMachineBlockers,
  type MachineBlockers,
} from "@/lib/machine-replacement";

/**
 * Deleting a machine cascades into most of its history, so the guard is the
 * only thing standing between a stray click and an audit trail with holes in
 * it. These tests pin every reason the guard refuses, because each one was a
 * way to lose a row that cannot be recovered.
 */
function blockers(overrides: Partial<MachineBlockers> = {}): MachineBlockers {
  return {
    contracts: [],
    serviceRequests: 0,
    meterReadings: 0,
    ownerHistory: 0,
    replacements: 0,
    copierTests: 0,
    scrapOrder: null,
    warranty: null,
    ...overrides,
  };
}

const contract = {
  id: "c1",
  contractNumber: "CT-1001",
  status: "ACTIVE",
  endDate: new Date("2026-12-31"),
};

describe("isMachineDeletable", () => {
  it("allows deleting a machine that has never been used or placed", () => {
    expect(isMachineDeletable(blockers())).toBe(true);
  });

  it("refuses a machine attached to a contract, pointing at replacement", () => {
    const b = blockers({ contracts: [contract] });
    expect(isMachineDeletable(b)).toBe(false);
    expect(describeMachineBlockers(b)).toContain("CT-1001");
    expect(describeMachineBlockers(b)).toContain("الاستبدال");
  });

  // The regression this guards: ownership rows cascade, so a machine that went
  // out to a customer and came back used to pass the check and lose its trail.
  it("refuses a machine with ownership history even with no contracts", () => {
    const b = blockers({ ownerHistory: 2 });
    expect(isMachineDeletable(b)).toBe(false);
    expect(describeMachineBlockers(b)).toContain("سجل ملكية");
  });

  it("refuses a machine that has been through a replacement", () => {
    expect(isMachineDeletable(blockers({ replacements: 1 }))).toBe(false);
  });

  it("refuses a machine with a service request, meter reading, or copier test", () => {
    expect(isMachineDeletable(blockers({ serviceRequests: 1 }))).toBe(false);
    expect(isMachineDeletable(blockers({ meterReadings: 5 }))).toBe(false);
    expect(isMachineDeletable(blockers({ copierTests: 1 }))).toBe(false);
  });

  it("refuses a machine held by a scrap order or a warranty", () => {
    expect(
      isMachineDeletable(blockers({ scrapOrder: { id: "s1", orderNumber: "SC-1", status: "OPEN" } }))
    ).toBe(false);
    expect(
      isMachineDeletable(
        blockers({
          warranty: {
            id: "w1",
            startDate: new Date("2026-01-01"),
            endDate: new Date("2027-01-01"),
            isExpired: false,
          },
        })
      )
    ).toBe(false);
  });

  it("names every blocking reason at once so the user is not sent round in circles", () => {
    const text = describeMachineBlockers(
      blockers({ contracts: [contract], serviceRequests: 2, ownerHistory: 1, replacements: 1 })
    );
    expect(text).toContain("CT-1001");
    expect(text).toContain("2 طلب صيانة");
    expect(text).toContain("1 سجل ملكية");
    expect(text).toContain("1 عملية استبدال");
  });

  it("gives no reason when nothing blocks it", () => {
    expect(describeMachineBlockers(blockers())).toBe("");
  });
});
