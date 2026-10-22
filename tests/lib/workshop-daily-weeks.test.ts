import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { addDays, weekIndexOf, weekStart, WEEK_DAYS } from "@/lib/workshop-daily";

/** A date at local midnight, the way the books are stored. */
const day = (year: number, month: number, date: number) => new Date(year, month - 1, date);

describe("workshop week", () => {
  it("opens the week on the Saturday", () => {
    // 2026-10-17 is a Saturday.
    expect(weekStart(day(2026, 10, 17)).getDay()).toBe(6);
    expect(weekStart(day(2026, 10, 17)).getDate()).toBe(17);
  });

  it("keeps Saturday, Sunday and Monday on the same week", () => {
    const saturday = weekStart(day(2026, 10, 17));
    expect(weekStart(day(2026, 10, 18)).getTime()).toBe(saturday.getTime());
    expect(weekStart(day(2026, 10, 19)).getTime()).toBe(saturday.getTime());
  });

  it("opens a new week on the Friday after Thursday", () => {
    // Friday 2026-10-23 closes the week that opened on Saturday the 17th.
    const friday = weekStart(day(2026, 10, 23));
    expect(friday.getDate()).toBe(17);
    // Saturday the 24th opens the next week.
    expect(weekStart(day(2026, 10, 24)).getDate()).toBe(24);
  });

  it("counts the weeks back from the current one", () => {
    const current = weekStart(day(2026, 10, 22));
    expect(weekIndexOf(day(2026, 10, 20), current)).toBe(1);
    expect(weekIndexOf(day(2026, 10, 17), current)).toBe(1);
    expect(weekIndexOf(day(2026, 10, 16), current)).toBe(2);
    expect(weekIndexOf(day(2026, 10, 3), current)).toBe(3);
  });

  it("counts a future day into the current week instead of a negative one", () => {
    const current = weekStart(day(2026, 10, 17));
    expect(weekIndexOf(day(2026, 10, 22), current)).toBe(1);
  });

  it("steps the week by whole days", () => {
    const saturday = weekStart(day(2026, 10, 17));
    const previous = addDays(saturday, -WEEK_DAYS);
    expect(previous.getDate()).toBe(10);
    expect(previous.getMonth()).toBe(9);
  });
});
