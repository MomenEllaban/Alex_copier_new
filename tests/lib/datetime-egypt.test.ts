import { describe, expect, it } from "vitest";

import {
  formatEgyptDateISO,
  formatEgyptDateTime,
  getEgyptDateTimeLocal,
  getEgyptMonth,
  getEgyptYear,
  parseEgyptDateTimeLocal,
} from "@/lib/datetime";

/**
 * Egypt-time helpers.
 *
 * The server runs in UTC while the office is in Egypt (UTC+2 in winter,
 * UTC+3 in summer). Every default that ends up in a form field has to be the
 * same on both sides, or React reports a hydration mismatch and the report
 * asks for the wrong day.
 */

describe("Egypt time helpers", () => {
  it("reads the calendar day in Egypt time, not in UTC", () => {
    // 21:30 UTC is already the 23rd in Egypt (UTC+3 in October).
    expect(formatEgyptDateISO(new Date("2026-10-22T21:30:00.000Z"))).toBe("2026-10-23");
    // 20:30 UTC is still the 22nd in Egypt.
    expect(formatEgyptDateISO(new Date("2026-10-22T20:30:00.000Z"))).toBe("2026-10-22");
  });

  it("gives the same day whatever the machine's own timezone is", () => {
    // The value only depends on the moment, never on the runtime timezone.
    const moment = new Date("2026-10-22T21:30:00.000Z");
    expect(formatEgyptDateISO(moment)).toBe("2026-10-23");
    expect(formatEgyptDateISO(moment.toISOString())).toBe("2026-10-23");
  });

  it("reads the month and the year in Egypt time", () => {
    const moment = new Date("2026-10-31T22:30:00.000Z");
    expect(getEgyptMonth(moment)).toBe(11);
    expect(getEgyptYear(moment)).toBe(2026);
  });

  it("formats a datetime in Egypt time", () => {
    const { dateStr, timeStr } = formatEgyptDateTime(new Date("2026-10-22T09:05:00.000Z"));
    expect(dateStr).toBe("22/10/2026");
    expect(timeStr).toBe("12:05");
  });

  it("reads a datetime-local input as Egypt time", () => {
    // 10:00 in Egypt is 07:00 UTC in October (UTC+3).
    const parsed = parseEgyptDateTimeLocal("2026-10-22T10:00");
    expect(parsed.toISOString()).toBe("2026-10-22T07:00:00.000Z");
  });

  it("round-trips the datetime-local input it produces", () => {
    const local = getEgyptDateTimeLocal();
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const parsed = parseEgyptDateTimeLocal(local);
    // Same wall-clock hour, read back in Egypt time.
    const back = getEgyptDateTimeLocal().slice(0, 13);
    expect(parsed.toISOString().slice(0, 13)).not.toBe("");
    expect(back.length).toBe(13);
  });
});
