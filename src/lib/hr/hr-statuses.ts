import type { AdvanceStatus, EmploymentStatus, LeaveStatus } from "@/generated/prisma/client";

/**
 * The Prisma enum members, repeated here as `as const` so a query string can be
 * checked against them at runtime.
 *
 * These mirror `prisma/schema.prisma`. Prisma only exports the enums as types,
 * not as runtime objects, so the member lists are declared next to the types
 * they belong to and `enumFilter` proves an incoming string is one of them
 * before it is used as a filter.
 */
export const ADVANCE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "DEDUCTING",
  "COMPLETED",
] as const satisfies readonly AdvanceStatus[];

export const EMPLOYMENT_STATUSES = [
  "ACTIVE",
  "ON_LEAVE",
  "SUSPENDED",
  "TERMINATED",
  "RESIGNED",
] as const satisfies readonly EmploymentStatus[];

export const LEAVE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const satisfies readonly LeaveStatus[];
