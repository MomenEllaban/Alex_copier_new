/**
 * Attendance Processing Engine
 *
 * Processes raw fingerprint punches into daily attendance records.
 * Calculates late minutes, early leave, overtime, and worked hours
 * based on configurable shift rules, grace periods, and holidays.
 */

interface ShiftConfig {
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  breakMinutes: number;
  graceMinutes: number;
  workingDays: number[]; // 0=Sun...6=Sat
  overtimeAfterMinutes: number;
}

interface AttendanceRuleConfig {
  workStartTime: string;
  workEndTime: string;
  graceMinutes: number;
  breakMinutes: number;
  overtimeStartAfter: number;
  overtimeMultiplier: number;
  weekendDays: number[];
  minWorkedMinutes: number;
  lateDeductionPerMin: number;
  absenceDeductionPct: number;
}

export interface RawPunch {
  punchTime: Date;
  punchType: "CHECK_IN" | "CHECK_OUT" | "UNKNOWN";
  deviceUserId: string;
  deviceId: string;
}

export interface ProcessedAttendance {
  checkIn: Date | null;
  checkOut: Date | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMin: number;
  overtimeMinutes: number;
  status: AttendanceStatusType;
}

export type AttendanceStatusType =
  | "PRESENT"
  | "ABSENT"
  | "LATE"
  | "EARLY_LEAVE"
  | "LEAVE"
  | "HOLIDAY"
  | "WEEKEND"
  | "MISSION"
  | "SICK_LEAVE"
  | "EXCUSED"
  | "INCOMPLETE";

/**
 * Parse "HH:mm" string into minutes from midnight.
 */
export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Get minutes from midnight for a Date object.
 */
export function getMinutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Default attendance rules used when no company-specific rules exist.
 */
export function getDefaultRules(): AttendanceRuleConfig {
  return {
    workStartTime: "08:00",
    workEndTime: "17:00",
    graceMinutes: 15,
    breakMinutes: 60,
    overtimeStartAfter: 0,
    overtimeMultiplier: 1.5,
    weekendDays: [5, 6], // Friday, Saturday
    minWorkedMinutes: 420,
    lateDeductionPerMin: 0,
    absenceDeductionPct: 100,
  };
}

/**
 * Build ShiftConfig from a shift record or default rules.
 */
export function buildShiftConfig(
  shift?: { startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; workingDays: string; overtimeAfterMinutes: number } | null,
  rules?: AttendanceRuleConfig | null,
): ShiftConfig {
  const r = rules || getDefaultRules();
  if (shift) {
    return {
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakMinutes: shift.breakMinutes,
      graceMinutes: shift.graceMinutes,
      workingDays: shift.workingDays.split(",").map(Number),
      overtimeAfterMinutes: shift.overtimeAfterMinutes,
    };
  }
  return {
    startTime: r.workStartTime,
    endTime: r.workEndTime,
    breakMinutes: r.breakMinutes,
    graceMinutes: r.graceMinutes,
    workingDays: [0, 1, 2, 3, 4], // Sun-Thu default
    overtimeAfterMinutes: r.overtimeStartAfter,
  };
}

/**
 * Check if a given date is a weekend day.
 */
export function isWeekend(date: Date, weekendDays: number[]): boolean {
  return weekendDays.includes(date.getDay());
}

/**
 * Check if a given date falls on a holiday.
 */
export function isHoliday(
  date: Date,
  holidays: Array<{ date: Date; endDate?: Date | null }>,
): boolean {
  const dateStart = new Date(date);
  dateStart.setHours(0, 0, 0, 0);
  const dateMs = dateStart.getTime();

  for (const h of holidays) {
    const hStart = new Date(h.date);
    hStart.setHours(0, 0, 0, 0);
    const hEnd = h.endDate ? new Date(h.endDate) : hStart;
    hEnd.setHours(23, 59, 59, 999);

    if (dateMs >= hStart.getTime() && dateMs <= hEnd.getTime()) {
      return true;
    }
  }
  return false;
}

/**
 * Sort punches chronologically and pair them into check-in/check-out.
 */
export function pairPunches(punches: RawPunch[]): { checkIn: Date | null; checkOut: Date | null } {
  if (punches.length === 0) return { checkIn: null, checkOut: null };

  // Sort by time
  const sorted = [...punches].sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());

  // If punches have explicit types, use them
  const checkIns = sorted.filter((p) => p.punchType === "CHECK_IN");
  const checkOuts = sorted.filter((p) => p.punchType === "CHECK_OUT");

  if (checkIns.length > 0 && checkOuts.length > 0) {
    return {
      checkIn: checkIns[0].punchTime,
      checkOut: checkOuts[checkOuts.length - 1].punchTime,
    };
  }

  // For UNKNOWN types: first punch = check-in, last punch = check-out
  if (sorted.length === 1) {
    return { checkIn: sorted[0].punchTime, checkOut: null };
  }

  return {
    checkIn: sorted[0].punchTime,
    checkOut: sorted[sorted.length - 1].punchTime,
  };
}

/**
 * Core attendance calculation engine.
 *
 * Given check-in/check-out times and a shift configuration,
 * calculate worked hours, lateness, early departure, and overtime.
 */
export function calculateAttendance(
  checkIn: Date | null,
  checkOut: Date | null,
  shift: ShiftConfig,
  date: Date,
  weekendDays: number[],
  holidays: Array<{ date: Date; endDate?: Date | null }>,
): ProcessedAttendance {
  // Weekend
  if (isWeekend(date, weekendDays)) {
    if (checkIn && checkOut) {
      // Worked on weekend = overtime
      const workedMinutes = Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000) - shift.breakMinutes);
      return {
        checkIn,
        checkOut,
        workedMinutes,
        lateMinutes: 0,
        earlyLeaveMin: 0,
        overtimeMinutes: workedMinutes,
        status: "PRESENT",
      };
    }
    return {
      checkIn: null,
      checkOut: null,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMin: 0,
      overtimeMinutes: 0,
      status: "WEEKEND",
    };
  }

  // Holiday
  if (isHoliday(date, holidays)) {
    if (checkIn && checkOut) {
      const workedMinutes = Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000) - shift.breakMinutes);
      return {
        checkIn,
        checkOut,
        workedMinutes,
        lateMinutes: 0,
        earlyLeaveMin: 0,
        overtimeMinutes: workedMinutes,
        status: "PRESENT",
      };
    }
    return {
      checkIn: null,
      checkOut: null,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMin: 0,
      overtimeMinutes: 0,
      status: "HOLIDAY",
    };
  }

  // No check-in at all
  if (!checkIn) {
    return {
      checkIn: null,
      checkOut: null,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMin: 0,
      overtimeMinutes: 0,
      status: "ABSENT",
    };
  }

  // Has check-in but no check-out
  if (!checkOut) {
    return {
      checkIn,
      checkOut: null,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMin: 0,
      overtimeMinutes: 0,
      status: "INCOMPLETE",
    };
  }

  // Normal work day with both check-in and check-out
  const shiftStart = parseTimeToMinutes(shift.startTime);
  const shiftEnd = parseTimeToMinutes(shift.endTime);
  const checkInMinutes = getMinutesFromMidnight(checkIn);
  const checkOutMinutes = getMinutesFromMidnight(checkOut);

  // Calculate worked time
  const rawWorkedMinutes = Math.max(0, checkOutMinutes - checkInMinutes);
  const workedMinutes = Math.max(0, rawWorkedMinutes - shift.breakMinutes);

  // Late calculation (after grace period)
  let lateMinutes = 0;
  if (checkInMinutes > shiftStart + shift.graceMinutes) {
    lateMinutes = checkInMinutes - shiftStart;
  }

  // Early leave calculation
  let earlyLeaveMin = 0;
  if (checkOutMinutes < shiftEnd) {
    earlyLeaveMin = shiftEnd - checkOutMinutes;
  }

  // Overtime calculation
  let overtimeMinutes = 0;
  const expectedWorkMinutes = shiftEnd - shiftStart - shift.breakMinutes;
  if (workedMinutes > expectedWorkMinutes + shift.overtimeAfterMinutes) {
    overtimeMinutes = workedMinutes - expectedWorkMinutes;
  }

  // Determine status
  let status: AttendanceStatusType = "PRESENT";
  if (lateMinutes > 0 && earlyLeaveMin > 0) {
    status = lateMinutes >= earlyLeaveMin ? "LATE" : "EARLY_LEAVE";
  } else if (lateMinutes > 0) {
    status = "LATE";
  } else if (earlyLeaveMin > 0) {
    status = "EARLY_LEAVE";
  }

  return {
    checkIn,
    checkOut,
    workedMinutes,
    lateMinutes,
    earlyLeaveMin,
    overtimeMinutes,
    status,
  };
}

/**
 * Process a batch of raw punches for a single employee on a single date.
 */
export function processEmployeeDayPunches(
  punches: RawPunch[],
  shift: ShiftConfig,
  date: Date,
  weekendDays: number[],
  holidays: Array<{ date: Date; endDate?: Date | null }>,
): ProcessedAttendance {
  const { checkIn, checkOut } = pairPunches(punches);
  return calculateAttendance(checkIn, checkOut, shift, date, weekendDays, holidays);
}

/**
 * Calculate daily salary from monthly basic salary.
 * Assumes 30-day month by default (configurable).
 */
export function calculateDailySalary(monthlySalary: number, workingDaysPerMonth: number = 30): number {
  if (workingDaysPerMonth <= 0) return 0;
  return monthlySalary / workingDaysPerMonth;
}

/**
 * Calculate hourly rate from daily salary.
 */
export function calculateHourlyRate(dailySalary: number, hoursPerDay: number = 8): number {
  if (hoursPerDay <= 0) return 0;
  return dailySalary / hoursPerDay;
}
