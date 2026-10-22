import { prisma } from "@/lib/prisma";

export async function getWorkshopCompany() {
  const company = await prisma.company.findFirst({
    where: { name: { contains: "القطاعي" } },
    select: { id: true, name: true },
  });
  return company;
}

export interface WorkshopTotals {
  inTotal: number;
  outTotal: number;
  remaining: number;
  confirmedIn: number;
  confirmedOut: number;
  pendingCount: number;
  pendingAmount: number;
}

export function calcTotals(
  transactions: Array<{ direction: "IN" | "OUT"; amount: number; status: string }>,
): WorkshopTotals {
  let inTotal = 0;
  let outTotal = 0;
  let confirmedIn = 0;
  let confirmedOut = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  for (const t of transactions) {
    if (t.status === "REJECTED") continue;
    const amount = Number(t.amount) || 0;
    if (t.direction === "IN") inTotal += amount;
    else outTotal += amount;
    if (t.status === "CONFIRMED") {
      if (t.direction === "IN") confirmedIn += amount;
      else confirmedOut += amount;
    } else if (t.status === "PENDING") {
      pendingCount++;
      pendingAmount += amount;
    }
  }
  return { inTotal, outTotal, remaining: inTotal - outTotal, confirmedIn, confirmedOut, pendingCount, pendingAmount };
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Days in a week — the step the day log pages by. */
export const WEEK_DAYS = 7;

/**
 * The Saturday that opens the week the day belongs to.
 *
 * The workshop week runs Saturday → Thursday, so the log pages by that week
 * and not by the calendar one. Friday is the day off, so it closes the block
 * that opened on the Saturday before it.
 */
export function weekStart(date: Date): Date {
  const d = startOfDay(date);
  // getDay(): 0 = Sunday … 6 = Saturday. Counting back from the Saturday of
  // the same block puts Sunday on the previous week and Saturday on its own.
  const back = (d.getDay() + 1) % 7;
  d.setDate(d.getDate() - back);
  return d;
}

/** A date shifted by whole days, keeping the time of day. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Which week the day belongs to, counted back from the current week:
 * 1 is the week of today, 2 the one before it, and so on.
 *
 * The difference is measured in days rather than milliseconds so a daylight
 * saving change cannot shift a day into the neighbouring week.
 */
export function weekIndexOf(date: Date, currentWeekStart: Date): number {
  const days = Math.round((currentWeekStart.getTime() - weekStart(date).getTime()) / 86_400_000);
  return Math.floor(days / WEEK_DAYS) + 1;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The first instant of the next day — used as an exclusive upper bound in queries. */
export function endOfDay(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Parses the `YYYY-MM-DD` value an `<input type="date">` sends and returns the
 * local start of that day. Returns null for anything else so the caller can
 * answer with a validation error instead of silently booking the entry on
 * today — the loose `new Date(string)` fallback is not used on purpose: it
 * reads `05/01/2025` as May 1st in Node and as 5 January in the browser.
 */
export function parseDayInput(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : startOfDay(value);
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!iso) return null;

  const year = Number(iso[1]);
  const month = Number(iso[2]);
  const day = Number(iso[3]);
  const parsed = new Date(year, month - 1, day);
  // Rejects overflow like 2025-02-30, which JS would roll into March.
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return startOfDay(parsed);
}

/** The `YYYY-MM-DD` string the date input uses, in local time. */
export function toDateInputValue(date: Date): string {
  return dayKey(date);
}

/**
 * A transaction row with the display names resolved. `createdBy` / `confirmedBy`
 * are plain id columns, so the names have to be joined in by the caller.
 */
export interface WorkshopTxRow {
  createdBy: string;
  confirmedBy: string | null;
  customer?: { name: string } | null;
}

/** Adds the display names a transaction row needs before it reaches the UI. */
export function decorateTransactions<T extends WorkshopTxRow>(transactions: T[], userName: Map<string, string>) {
  return transactions.map((t) => ({
    ...t,
    createdByName: userName.get(t.createdBy) ?? null,
    confirmedByName: t.confirmedBy ? (userName.get(t.confirmedBy) ?? null) : null,
    customerName: t.customer?.name ?? null,
  }));
}

/**
 * The label used when an outgoing entry carries no category. It is a display
 * string on the expense row, not a category row: nothing is filed under a
 * placeholder category, so old entries stay untouched until the user files
 * them under a category of their own.
 */
export const WORKSHOP_UNCATEGORIZED = "غير مصنف";

/** Source label stamped on the expense an outgoing entry posts to. */
export const WORKSHOP_SOURCE_LABEL = "يومية الورشة";
