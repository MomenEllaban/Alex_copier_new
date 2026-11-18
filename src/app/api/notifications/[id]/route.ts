import { withApiErrors } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { markNotificationAsRead } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

async function PATCH__raw(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const shouldMarkRead = body?.read ?? true;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await markNotificationAsRead(id, user.id);
    if (shouldMarkRead && !updated) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    if (!shouldMarkRead) {
      await prisma.notification.update({
        where: { id },
        data: { isRead: false, readAt: null },
      });
    }

    return NextResponse.json({
      notification: updated ?? notification,
      unreadCount: await prisma.notification.count({
        where: { userId: user.id, isRead: false },
      }),
    });
  } catch {
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}

export const PATCH = withApiErrors(PATCH__raw);
