/**
 * Leave Balance Engine
 *
 * Handles leave balance calculations, overlap detection,
 * and balance validation.
 */

export interface LeaveBalanceData {
  opening: number;
  used: number;
  pending: number;
  adjustment: number;
}

/**
 * Calculate remaining leave balance.
 */
export function calculateRemainingBalance(balance: LeaveBalanceData): number {
  return balance.opening + balance.adjustment - balance.used - balance.pending;
}

/**
 * Check if an employee has sufficient balance for a leave request.
 */
export function hasSufficientBalance(
  balance: LeaveBalanceData,
  requestedDays: number,
): { sufficient: boolean; remaining: number; shortage: number } {
  const remaining = calculateRemainingBalance(balance);
  const shortage = Math.max(0, requestedDays - remaining);
  return {
    sufficient: remaining >= requestedDays,
    remaining,
    shortage,
  };
}

/**
 * Check if a date range overlaps with existing leave requests.
 */
export function hasOverlappingLeave(
  startDate: Date,
  endDate: Date,
  existingLeaves: Array<{ startDate: Date; endDate: Date; id?: string }>,
  excludeId?: string,
): { overlaps: boolean; conflictingLeave?: { startDate: Date; endDate: Date } } {
  for (const leave of existingLeaves) {
    if (excludeId && leave.id === excludeId) continue;

    const lStart = new Date(leave.startDate);
    const lEnd = new Date(leave.endDate);
    const rStart = new Date(startDate);
    const rEnd = new Date(endDate);

    // Overlap: !(end1 < start2 || end2 < start1)
    if (!(rEnd < lStart || lEnd < rStart)) {
      return { overlaps: true, conflictingLeave: leave };
    }
  }
  return { overlaps: false };
}

/**
 * Calculate the number of business days between two dates (excluding weekends).
 */
export function calculateBusinessDays(
  startDate: Date,
  endDate: Date,
  weekendDays: number[] = [5, 6],
  holidays: Array<{ date: Date; endDate?: Date | null }> = [],
): number {
  let count = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    const day = current.getDay();
    if (!weekendDays.includes(day)) {
      // Check if it's not a holiday
      const isHol = holidays.some((h) => {
        const hStart = new Date(h.date);
        hStart.setHours(0, 0, 0, 0);
        const hEnd = h.endDate ? new Date(h.endDate) : new Date(h.date);
        hEnd.setHours(23, 59, 59, 999);
        return current.getTime() >= hStart.getTime() && current.getTime() <= hEnd.getTime();
      });
      if (!isHol) count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Calculate carry-over balance from previous year.
 */
export function calculateCarryOver(
  previousBalance: LeaveBalanceData,
  maxCarryOverDays: number,
): number {
  const remaining = calculateRemainingBalance(previousBalance);
  if (remaining <= 0 || maxCarryOverDays <= 0) return 0;
  return Math.min(remaining, maxCarryOverDays);
}
