/**
 * Shared datetime utilities for consistent Egypt timezone handling.
 * All dates are stored in UTC and displayed in Africa/Cairo timezone.
 */

const EGYPT_TIMEZONE = "Africa/Cairo";

/**
 * Get current date/time in Egypt timezone as a Date object.
 * Use this when you need to capture "now" in Egypt time.
 */
export function getEgyptNow(): Date {
  return new Date();
}

/**
 * The offset of Africa/Cairo from UTC, in minutes, at the given moment.
 * Egypt is UTC+2 in winter and UTC+3 in summer, so the offset is read from
 * the timezone itself instead of being hard-coded.
 */
function egyptOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EGYPT_TIMEZONE,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}

/**
 * Get current date/time formatted for datetime-local input (YYYY-MM-DDTHH:mm).
 * This is the local time in Egypt.
 */
export function getEgyptDateTimeLocal(): string {
  const now = new Date();
  const local = new Date(now.getTime() + egyptOffsetMinutes(now) * 60_000);
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  const day = String(local.getUTCDate()).padStart(2, "0");
  const hours = String(local.getUTCHours()).padStart(2, "0");
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format a date as a calendar date (YYYY-MM-DD) in Egypt timezone.
 *
 * The server and the browser must agree on "today": the server runs in UTC
 * while the office is in Egypt, so `toISOString()` — which is UTC — would
 * hand the browser a different day for a few hours every evening. Reading
 * the day from the Egypt timezone gives both sides the same answer.
 */
export function formatEgyptDateISO(date: Date | string | null | undefined): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (!d || Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() + egyptOffsetMinutes(d) * 60_000);
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  const day = String(local.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The month (1-12) in Egypt timezone.
 * Used for defaults that end up in a form field, where the server and the
 * browser must pick the same month.
 */
export function getEgyptMonth(date: Date = new Date()): number {
  const local = new Date(date.getTime() + egyptOffsetMinutes(date) * 60_000);
  return local.getUTCMonth() + 1;
}

/**
 * The year in Egypt timezone.
 */
export function getEgyptYear(date: Date = new Date()): number {
  const local = new Date(date.getTime() + egyptOffsetMinutes(date) * 60_000);
  return local.getUTCFullYear();
}

/**
 * Parse a datetime-local string (YYYY-MM-DDTHH:mm) as Egypt local time.
 * Returns a Date object that represents that moment in Egypt timezone.
 * Use this when receiving dates from datetime-local inputs.
 */
export function parseEgyptDateTimeLocal(value: string): Date {
  // datetime-local gives "YYYY-MM-DDTHH:mm" without timezone suffix. It is
  // read as a wall-clock time in Egypt, not in the timezone of whichever
  // machine happens to run this code.
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value.trim());
  if (!match) return new Date(value);
  const [, year, month, day, hour = "00", minute = "00"] = match;
  const wallClock = Date.UTC(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10)
  );
  // The offset depends on the moment, so it is read twice: once for the
  // guess, and once more for the instant it produces.
  const guessOffset = egyptOffsetMinutes(new Date(wallClock));
  const result = new Date(wallClock - guessOffset * 60_000);
  const realOffset = egyptOffsetMinutes(result);
  if (realOffset === guessOffset) return result;
  return new Date(wallClock - realOffset * 60_000);
}

/**
 * Format a Date object for display in Egypt timezone.
 * Returns formatted date and time strings.
 */
export function formatEgyptDateTime(date: Date | string | null | undefined): {
  dateStr: string;
  timeStr: string;
} {
  if (!date) {
    return { dateStr: "—", timeStr: "" };
  }
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    return { dateStr: "—", timeStr: "" };
  }
  const dateStr = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: EGYPT_TIMEZONE,
  });
  const timeStr = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: EGYPT_TIMEZONE,
  });
  return { dateStr, timeStr };
}

/**
 * Format a Date object as a full datetime string in Egypt timezone.
 * Format: DD/MM/YYYY HH:mm
 */
export function formatEgyptDateTimeFull(date: Date | string | null | undefined): string {
  const { dateStr, timeStr } = formatEgyptDateTime(date);
  if (dateStr === "—") return "—";
  return `${dateStr} ${timeStr}`;
}
