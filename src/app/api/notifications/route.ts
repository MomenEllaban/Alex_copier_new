import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import {
  createNotification,
  getNotificationsForUser,
  getUnreadNotificationsCount,
  markAllNotificationsAsRead,
  runBusinessNotificationSweep,
} from "@/lib/notifications";

const notificationSchema = z.object({
  userId: z.string().optional(),
  senderId: z.string().optional().nullable(),
  title: z.string().min(1),
  message: z.string().min(1),
  type: z.enum([
    "SYSTEM",
    "SERVICE_REQUEST_CREATED",
    "SERVICE_REQUEST_ASSIGNED",
    "SERVICE_REQUEST_UPDATED",
    "MACHINE_STATUS_CHANGED",
    "CONTRACT_EXPIRING",
    "LOW_STOCK",
    "PAYMENT_PENDING",
    "PAYMENT_APPROVED",
    "PAYMENT_REJECTED",
  ]).optional(),
  category: z.enum([
    "GENERAL",
    "SYSTEM",
    "SERVICE_REQUEST",
    "MACHINE",
    "INVENTORY",
    "PAYMENT",
    "CONTRACT",
  ]).optional(),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  actionUrl: z.string().optional().nullable(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const user = await requirePageAccess("dashboard");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    // Opportunistic business sweep (contract expiry / low stock), throttled internally.
    void runBusinessNotificationSweep().catch(() => undefined);

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const take = Number(searchParams.get("limit") ?? "20");
    const page = Number(searchParams.get("page") ?? "1");
    const type = searchParams.get("type") ?? undefined;
    const category = searchParams.get("category") ?? undefined;

    const result = await getNotificationsForUser(user.id, {
      unreadOnly,
      take: Number.isFinite(take) ? Math.max(1, Math.min(take, 50)) : 20,
      page: Number.isFinite(page) ? Math.max(1, page) : 1,
      type,
      category,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[notifications] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = notificationSchema.parse(body);

    const targetUserId = data.userId ?? user.id;
    const isAllowed =
      targetUserId === user.id ||
      ["GENERAL_MANAGER", "COMPANY_MANAGER", "MAINTENANCE_MANAGER", "WORKSHOP_MANAGER", "ACCOUNTANT"].includes(
        String((user as { role?: string }).role ?? ""),
      );

    if (!isAllowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const notification = await createNotification({
      userId: targetUserId,
      senderId: data.senderId ?? user.id,
      title: data.title,
      message: data.message,
      type: data.type ?? "SYSTEM",
      category: data.category ?? "GENERAL",
      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
      actionUrl: data.actionUrl ?? null,
      priority: data.priority ?? "NORMAL",
      metadata: data.metadata ?? null,
    });

    return NextResponse.json(
      {
        message: "Notification created",
        notification,
        unreadCount: await getUnreadNotificationsCount(targetUserId),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid notification payload" }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (body?.markAllAsRead) {
      const updatedCount = await markAllNotificationsAsRead(user.id);
      return NextResponse.json({
        message: "Notifications marked as read",
        updatedCount,
        unreadCount: 0,
      });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
