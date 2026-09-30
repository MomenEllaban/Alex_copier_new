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
 * Get current date/time formatted for datetime-local input (YYYY-MM-DDTHH:mm).
 * This is the local time in Egypt.
 */
export function getEgyptDateTimeLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Parse a datetime-local string (YYYY-MM-DDTHH:mm) as Egypt local time.
 * Returns a Date object that represents that moment in Egypt timezone.
 * Use this when receiving dates from datetime-local inputs.
 */
export function parseEgyptDateTimeLocal(value: string): Date {
  // datetime-local gives "YYYY-MM-DDTHH:mm" without timezone suffix
  // We need to interpret this as Egypt local time, not browser local time
  // Create a date object and adjust for the timezone offset
  const date = new Date(value);
  // Get the timezone offset in minutes (positive for west of UTC, negative for east)
  const offsetMinutes = date.getTimezoneOffset();
  // Adjust the date to represent the same wall-clock time in Egypt
  // Egypt is UTC+2 or UTC+3, so we need to add the offset to get UTC
  return new Date(date.getTime() - offsetMinutes * 60 * 1000);
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
