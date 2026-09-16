import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getEngineerUserId,
  getFinanceVerificationRecipients,
  getInventoryRecipients,
  getServiceManagementRecipients,
  getContractRecipients,
} from "@/lib/notification-recipients";

export type NotificationPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
export type NotificationCategory =
  | "GENERAL"
  | "SYSTEM"
  | "SERVICE_REQUEST"
  | "MACHINE"
  | "INVENTORY"
  | "PAYMENT"
  | "CONTRACT"
  | "HR"
  | "PAYROLL"
  | "LEAVE";
export type NotificationType =
  | "SYSTEM"
  | "SERVICE_REQUEST_CREATED"
  | "SERVICE_REQUEST_ASSIGNED"
  | "SERVICE_REQUEST_UPDATED"
  | "MACHINE_STATUS_CHANGED"
  | "CONTRACT_EXPIRING"
  | "LOW_STOCK"
  | "PAYMENT_PENDING"
  | "PAYMENT_APPROVED"
  | "PAYMENT_REJECTED"
  | "LEAVE_REQUESTED"
  | "LEAVE_APPROVED"
  | "LEAVE_REJECTED"
  | "OVERTIME_REQUESTED"
  | "OVERTIME_APPROVED"
  | "ADVANCE_REQUESTED"
  | "ADVANCE_APPROVED"
  | "PAYROLL_READY"
  | "PAYROLL_APPROVED";

export type NotificationMetadata = {
  [key: string]: string | number | boolean | null | NotificationMetadata | (string | number | boolean | null)[];
};

export interface NotificationInput {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  category?: NotificationCategory;
  senderId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  priority?: NotificationPriority;
  metadata?: NotificationMetadata | null;
}

/** Threshold under which a spare part is considered low on stock. */
export const LOW_STOCK_THRESHOLD = 5;

function serialize<T extends { createdAt: Date; updatedAt: Date; readAt: Date | null }>(notification: T) {
  return {
    ...notification,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
  };
}

const notificationInclude = {
  sender: {
    select: { id: true, name: true, email: true },
  },
} as const;

export async function getUnreadNotificationsCount(userId: string) {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}

export async function getNotificationsForUser(
  userId: string,
  options: { unreadOnly?: boolean; take?: number; type?: string; category?: string; page?: number } = {},
) {
  const { unreadOnly = false, type, category } = options;
  const take = Math.max(1, Math.min(options.take ?? 20, 50));
  const page = Math.max(1, options.page ?? 1);

  const where = {
    userId,
    ...(unreadOnly ? { isRead: false } : {}),
    ...(type ? { type: { in: [type] as NotificationType[] } } : {}),
    ...(category ? { category: { in: [category] as NotificationCategory[] } } : {}),
  };

  const [totalCount, unreadCount, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      include: notificationInclude,
    }),
  ]);

  return {
    items: notifications.map(serialize),
    unreadCount,
    totalCount,
    page,
    pageSize: take,
    totalPages: Math.max(1, Math.ceil(totalCount / take)),
  };
}

export async function createNotification(input: NotificationInput) {
  if (!input.userId) {
    throw new Error("Notification userId is required");
  }

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      senderId: input.senderId ?? null,
      title: input.title,
      message: input.message,
      type: input.type ?? "SYSTEM",
      category: input.category ?? "GENERAL",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      actionUrl: input.actionUrl ?? null,
      priority: input.priority ?? "NORMAL",
      metadata: input.metadata ?? Prisma.JsonNull,
    },
    include: notificationInclude,
  });

  return serialize(notification);
}

/**
 * Creates the same notification for several users at once.
 * Failures are swallowed per user so one bad recipient never breaks the flow.
 */
export async function createNotificationsForUsers(
  userIds: string[],
  input: Omit<NotificationInput, "userId">,
) {
  if (!userIds.length) return [];
  const results = await Promise.allSettled(
    userIds.map((userId) => createNotification({ ...input, userId })),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof createNotification>>> => r.status === "fulfilled")
    .map((r) => r.value);
}

export async function markNotificationAsRead(notificationId: string, userId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification || notification.userId !== userId) {
    return null;
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return serialize(updated);
}

export async function markAllNotificationsAsRead(userId: string) {
  const updated = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return updated.count;
}

// ═══════════════════════════════════════════════════════════
// Business event notifications
//
// Who gets told what is derived from the real org structure:
// roles (src/lib/permissions.ts), engineer→user links, company
// membership — never "everybody".
// ═══════════════════════════════════════════════════════════

async function hasRecentDuplicate(userId: string, type: NotificationType, entityId: string, withinHours = 24 * 7) {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  const count = await prisma.notification.count({
    where: { userId, type, entityId, createdAt: { gte: since } },
  });
  return count > 0;
}

const priorityForServiceRequest = (priority: string): NotificationPriority =>
  priority === "EMERGENCY" ? "CRITICAL" : priority === "URGENT" ? "HIGH" : "NORMAL";

/** New service request → maintenance managers + GM (never the creator himself). */
export async function notifyServiceRequestCreated(event: {
  requestId: string;
  requestNumber: string;
  priority: string;
  customerName?: string | null;
  actorId?: string | null;
}) {
  try {
    const recipients = await getServiceManagementRecipients(event.actorId);
    const priority = priorityForServiceRequest(event.priority);
    const machinePart = event.customerName ? ` — ${event.customerName}` : "";
    return createNotificationsForUsers(recipients, {
      title: "تم إنشاء طلب صيانة جديد",
      message: `طلب الصيانة ${event.requestNumber}${machinePart} بانتظار التعيين.`,
      type: "SERVICE_REQUEST_CREATED",
      category: "SERVICE_REQUEST",
      entityType: "ServiceRequest",
      entityId: event.requestId,
      actionUrl: `/service-requests?focus=${event.requestId}`,
      priority,
      senderId: event.actorId ?? null,
      metadata: { requestNumber: event.requestNumber, priority: event.priority },
    });
  } catch {
    return [];
  }
}

/** Assignment/reassignment → the assigned technician's linked user account. */
export async function notifyServiceRequestAssigned(event: {
  requestId: string;
  requestNumber: string;
  engineerId: string | null;
  engineerName?: string | null;
  reassigned?: boolean;
  actorId?: string | null;
}) {
  try {
    const userId = await getEngineerUserId(event.engineerId);
    if (!userId || userId === event.actorId) return [];
    const prefix = event.reassigned ? "تم إعادة تعيين" : "تم تعيين";
    return createNotificationsForUsers([userId], {
      title: event.reassigned ? "تم إعادة تعيين طلب صيانة لك" : "تم تعيين طلب صيانة جديد لك",
      message: `${prefix} طلب الصيانة ${event.requestNumber} إليك${event.engineerName ? ` (${event.engineerName})` : ""}.`,
      type: "SERVICE_REQUEST_ASSIGNED",
      category: "SERVICE_REQUEST",
      entityType: "ServiceRequest",
      entityId: event.requestId,
      actionUrl: `/service-requests?focus=${event.requestId}`,
      priority: "HIGH",
      senderId: event.actorId ?? null,
      metadata: { requestNumber: event.requestNumber },
    });
  } catch {
    return [];
  }
}

/** Resolution outcome → maintenance managers + GM. NOT_RESOLVED escalates. */
export async function notifyServiceRequestStatusChanged(event: {
  requestId: string;
  requestNumber: string;
  status: string;
  actorId?: string | null;
}) {
  if (!["RESOLVED", "NOT_RESOLVED"].includes(event.status)) return [];
  try {
    const recipients = await getServiceManagementRecipients(event.actorId);
    const notResolved = event.status === "NOT_RESOLVED";
    return createNotificationsForUsers(recipients, {
      title: notResolved ? "طلب صيانة لم يتم حلّه" : "تم حل طلب صيانة",
      message: notResolved
        ? `تعذّر حل طلب الصيانة ${event.requestNumber} في الزيارة ويحتاج متابعة.`
        : `تم حل طلب الصيانة ${event.requestNumber} بنجاح.`,
      type: "SERVICE_REQUEST_UPDATED",
      category: "SERVICE_REQUEST",
      entityType: "ServiceRequest",
      entityId: event.requestId,
      actionUrl: `/service-requests?focus=${event.requestId}`,
      priority: notResolved ? "HIGH" : "NORMAL",
      senderId: event.actorId ?? null,
      metadata: { requestNumber: event.requestNumber, status: event.status },
    });
  } catch {
    return [];
  }
}

/** Field collection recorded → finance verifiers must review it. */
export async function notifySettlementPendingVerification(event: {
  settlementId: string;
  settlementNumber: string;
  amount: number;
  collectorName?: string | null;
  actorId?: string | null;
}) {
  try {
    const recipients = await getFinanceVerificationRecipients(event.actorId);
    return createNotificationsForUsers(recipients, {
      title: "يوجد تحصيل جديد بانتظار المراجعة",
      message: `التسوية ${event.settlementNumber} بمبلغ ${event.amount.toLocaleString("en-US")} جنيه أضافها ${event.collectorName ?? "أحد المستخدمين"} وتنتظر التحقق.`,
      type: "PAYMENT_PENDING",
      category: "PAYMENT",
      entityType: "Settlement",
      entityId: event.settlementId,
      actionUrl: `/settlements?focus=${event.settlementId}`,
      priority: "NORMAL",
      senderId: event.actorId ?? null,
      metadata: { settlementNumber: event.settlementNumber, amount: event.amount },
    });
  } catch {
    return [];
  }
}

/** Verification done → tell the person who collected the money. */
export async function notifySettlementVerified(event: {
  settlementId: string;
  settlementNumber: string;
  collectedByUserId?: string | null;
  verifierId?: string | null;
}) {
  try {
    if (!event.collectedByUserId || event.collectedByUserId === event.verifierId) return [];
    return createNotificationsForUsers([event.collectedByUserId], {
      title: "تم التحقق من التسوية",
      message: `تم اعتماد التسوية ${event.settlementNumber}.`,
      type: "PAYMENT_APPROVED",
      category: "PAYMENT",
      entityType: "Settlement",
      entityId: event.settlementId,
      actionUrl: `/settlements?focus=${event.settlementId}`,
      priority: "NORMAL",
      senderId: event.verifierId ?? null,
      metadata: { settlementNumber: event.settlementNumber },
    });
  } catch {
    return [];
  }
}

/** Stock dropped to/below threshold after an outgoing movement. */
export async function notifyLowStockAfterMovement(event: {
  productId: string;
  productName: string;
  warehouseName: string;
  remaining: number;
  actorId?: string | null;
}) {
  try {
    if (event.remaining > LOW_STOCK_THRESHOLD) return [];
    const recipients = await getInventoryRecipients(event.actorId);
    const priority: NotificationPriority =
      event.remaining === 0 ? "CRITICAL" : event.remaining <= Math.ceil(LOW_STOCK_THRESHOLD / 2) ? "HIGH" : "NORMAL";
    return createNotificationsForUsers(recipients, {
      title: event.remaining === 0 ? "نفد المخزون لقطعة غيار" : "المخزون منخفض لقطعة غيار",
      message: `${event.productName} في ${event.warehouseName}: المتبقي ${event.remaining} فقط.`,
      type: "LOW_STOCK",
      category: "INVENTORY",
      entityType: "Product",
      entityId: event.productId,
      actionUrl: `/inventory?q=${encodeURIComponent(event.productName)}`,
      priority,
      senderId: event.actorId ?? null,
      metadata: { productName: event.productName, remaining: event.remaining },
    });
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// Periodic sweep (contract expiry + low stock)
// Idempotent: dedupes per user/type/entity within a week, and is
// throttled in-memory so it runs at most once every 10 minutes
// regardless of how many clients poll.
// ═══════════════════════════════════════════════════════════

let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export async function runBusinessNotificationSweep(force = false) {
  const now = Date.now();
  if (!force && now - lastSweepAt < SWEEP_INTERVAL_MS) return { skipped: true };

  lastSweepAt = now;
  const summary = { contractsNotified: 0, lowStockNotified: 0 };

  try {
    const expiryLimit = new Date(now + 30 * 24 * 60 * 60 * 1000);
    const expiringContracts = await prisma.contract.findMany({
      where: { status: "ACTIVE", endDate: { lte: expiryLimit, gte: new Date(0) } },
      select: { id: true, contractNumber: true, endDate: true, customerId: true },
      take: 50,
    });

    for (const contract of expiringContracts) {
      const daysLeft = Math.max(0, Math.ceil((contract.endDate.getTime() - now) / (24 * 60 * 60 * 1000)));
      const recipients = await getContractRecipients(null);
      const priority: NotificationPriority = daysLeft <= 7 ? "HIGH" : "NORMAL";
      for (const userId of recipients) {
        if (await hasRecentDuplicate(userId, "CONTRACT_EXPIRING", contract.id)) continue;
        await createNotification({
          userId,
          title: "عقد صيانة يقترب من تاريخ الانتهاء",
          message: `العقد ${contract.contractNumber} ينتهي خلال ${daysLeft} يومًا.`,
          type: "CONTRACT_EXPIRING",
          category: "CONTRACT",
          entityType: "Contract",
          entityId: contract.id,
          actionUrl: `/contracts?focus=${contract.id}`,
          priority,
          metadata: { contractNumber: contract.contractNumber, daysLeft },
        });
        summary.contractsNotified += 1;
      }
    }

    const lowStockItems = await prisma.warehouseInventory.findMany({
      where: { quantity: { lte: LOW_STOCK_THRESHOLD }, product: { isActive: true, productType: "SPARE_PART" } },
      select: {
        quantity: true,
        product: { select: { id: true, name: true } },
        warehouse: { select: { name: true } },
      },
      take: 30,
    });

    for (const item of lowStockItems) {
      const recipients = await getInventoryRecipients();
      const priority: NotificationPriority =
        item.quantity === 0 ? "CRITICAL" : item.quantity <= Math.ceil(LOW_STOCK_THRESHOLD / 2) ? "HIGH" : "NORMAL";
      for (const userId of recipients) {
        // Dedupe key includes warehouse via metadata check — entity is the product,
        // so reuse per-product dedupe window to avoid spamming the same shortage.
        if (await hasRecentDuplicate(userId, "LOW_STOCK", item.product.id, 24 * 3)) continue;
        await createNotification({
          userId,
          title: item.quantity === 0 ? "نفد المخزون لقطعة غيار" : "المخزون منخفض لقطعة غيار",
          message: `${item.product.name} في ${item.warehouse.name}: المتبقي ${item.quantity} فقط.`,
          type: "LOW_STOCK",
          category: "INVENTORY",
          entityType: "Product",
          entityId: item.product.id,
          actionUrl: `/inventory?q=${encodeURIComponent(item.product.name)}`,
          priority,
          metadata: { productName: item.product.name, remaining: item.quantity },
        });
        summary.lowStockNotified += 1;
      }
    }
  } catch {
    // Sweep failures must never break the caller (dashboard/notifications polling).
  }

  return summary;
}
