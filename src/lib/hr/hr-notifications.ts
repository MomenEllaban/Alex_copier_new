/**
 * HR-specific notification events.
 * Uses the existing notification infrastructure from src/lib/notifications.ts.
 */
import { createNotificationsForUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

/**
 * Get user IDs for HR managers and general managers.
 */
async function getHrRecipients(excludeUserId?: string | null): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["GENERAL_MANAGER", "COMPANY_MANAGER", "HR_MANAGER"] },
    },
    select: { id: true },
  });
  return users.map((u) => u.id).filter((id) => id !== excludeUserId);
}

/**
 * Get the manager's user ID for an employee.
 */
async function getManagerUserId(employeeId: string): Promise<string | null> {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      Department: {
        select: { managerId: true },
      },
    },
  });
  if (!emp?.Department?.managerId) return null;
  const managerEmp = await prisma.employee.findUnique({
    where: { id: emp.Department.managerId },
    select: { userId: true },
  });
  return managerEmp?.userId ?? null;
}

/** Leave request submitted → manager + HR */
export async function notifyLeaveRequested(event: {
  employeeId: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  actorId?: string | null;
}) {
  try {
    const managerId = await getManagerUserId(event.employeeId);
    const hrRecipients = await getHrRecipients(event.actorId);
    const recipients = [...new Set([...(managerId ? [managerId] : []), ...hrRecipients])];

    return createNotificationsForUsers(recipients, {
      title: "طلب إجازة جديد",
      message: `قدّم ${event.employeeName} طلب ${event.leaveType} من ${event.startDate} إلى ${event.endDate} (${event.totalDays} يوم).`,
      type: "LEAVE_REQUESTED",
      category: "LEAVE",
      entityType: "LeaveRequest",
      priority: "NORMAL",
      senderId: event.actorId ?? null,
    });
  } catch {
    return [];
  }
}

/** Leave approved/rejected → the employee */
export async function notifyLeaveReviewed(event: {
  employeeUserId: string;
  employeeName: string;
  approved: boolean;
  leaveType: string;
  reviewerId?: string | null;
}) {
  try {
    if (!event.employeeUserId) return [];
    return createNotificationsForUsers([event.employeeUserId], {
      title: event.approved ? "تمت الموافقة على طلب الإجازة" : "تم رفض طلب الإجازة",
      message: event.approved
        ? `تمت الموافقة على طلب ${event.leaveType} الخاص بك.`
        : `تم رفض طلب ${event.leaveType} الخاص بك.`,
      type: event.approved ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      category: "LEAVE",
      entityType: "LeaveRequest",
      priority: "NORMAL",
      senderId: event.reviewerId ?? null,
    });
  } catch {
    return [];
  }
}

/** Overtime request → manager + HR */
export async function notifyOvertimeRequested(event: {
  employeeId: string;
  employeeName: string;
  hours: number;
  date: string;
  actorId?: string | null;
}) {
  try {
    const managerId = await getManagerUserId(event.employeeId);
    const hrRecipients = await getHrRecipients(event.actorId);
    const recipients = [...new Set([...(managerId ? [managerId] : []), ...hrRecipients])];

    return createNotificationsForUsers(recipients, {
      title: "طلب عمل إضافي جديد",
      message: `قدّم ${event.employeeName} طلب عمل إضافي ${event.hours} ساعة ليوم ${event.date}.`,
      type: "OVERTIME_REQUESTED",
      category: "HR",
      entityType: "OvertimeRequest",
      priority: "NORMAL",
      senderId: event.actorId ?? null,
    });
  } catch {
    return [];
  }
}

/** Overtime approved → the employee */
export async function notifyOvertimeApproved(event: {
  employeeUserId: string;
  hours: number;
  date: string;
  reviewerId?: string | null;
}) {
  try {
    if (!event.employeeUserId) return [];
    return createNotificationsForUsers([event.employeeUserId], {
      title: "تمت الموافقة على طلب العمل الإضافي",
      message: `تمت الموافقة على طلب العمل الإضافي ${event.hours} ساعة ليوم ${event.date}.`,
      type: "OVERTIME_APPROVED",
      category: "HR",
      entityType: "OvertimeRequest",
      priority: "NORMAL",
      senderId: event.reviewerId ?? null,
    });
  } catch {
    return [];
  }
}

/** Advance approved → the employee */
export async function notifyAdvanceApproved(event: {
  employeeUserId: string;
  amount: number;
  reviewerId?: string | null;
}) {
  try {
    if (!event.employeeUserId) return [];
    return createNotificationsForUsers([event.employeeUserId], {
      title: "تمت الموافقة على طلب السلفة",
      message: `تمت الموافقة على سلفة بمبلغ ${event.amount.toLocaleString("en-US")} جنيه.`,
      type: "ADVANCE_APPROVED",
      category: "PAYROLL",
      entityType: "EmployeeAdvance",
      priority: "NORMAL",
      senderId: event.reviewerId ?? null,
    });
  } catch {
    return [];
  }
}

/** Payroll ready for review → HR managers */
export async function notifyPayrollReady(event: {
  month: number;
  year: number;
  actorId?: string | null;
}) {
  try {
    const recipients = await getHrRecipients(event.actorId);
    return createNotificationsForUsers(recipients, {
      title: "كشف الرواتب جاهز للمراجعة",
      message: `كشف رواتب شهر ${event.month}/${event.year} جاهز للمراجعة والاعتماد.`,
      type: "PAYROLL_READY",
      category: "PAYROLL",
      entityType: "PayrollRun",
      priority: "HIGH",
      senderId: event.actorId ?? null,
    });
  } catch {
    return [];
  }
}

/** Payroll approved → accountants + HR */
export async function notifyPayrollApproved(event: {
  month: number;
  year: number;
  actorId?: string | null;
}) {
  try {
    const accountants = await prisma.user.findMany({
      where: { isActive: true, role: "ACCOUNTANT" },
      select: { id: true },
    });
    const hrRecipients = await getHrRecipients(event.actorId);
    const recipients = [...new Set([...accountants.map((u) => u.id), ...hrRecipients])];

    return createNotificationsForUsers(recipients, {
      title: "تم اعتماد كشف الرواتب",
      message: `تم اعتماد كشف رواتب شهر ${event.month}/${event.year}.`,
      type: "PAYROLL_APPROVED",
      category: "PAYROLL",
      entityType: "PayrollRun",
      priority: "NORMAL",
      senderId: event.actorId ?? null,
    });
  } catch {
    return [];
  }
}
