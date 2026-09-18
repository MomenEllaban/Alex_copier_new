"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/context";
import {
  Bell,
  Wrench,
  Printer,
  Package,
  Wallet,
  FileText,
  CheckCheck,
  Check,
  RotateCcw,
} from "lucide-react";
import FilterSelect from "@/components/FilterSelect";
import Pagination from "@/components/Pagination";
import PrinterLoader from "@/components/PrinterLoader";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  category: string;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  isRead: boolean;
  priority: string;
  createdAt: string;
  sender?: { id?: string; name?: string } | null;
}

const PAGE_SIZE = 10;

const CATEGORY_ICON: Record<string, { icon: typeof Bell; classes: string }> = {
  SERVICE_REQUEST: { icon: Wrench, classes: "bg-amber-100 text-amber-700" },
  MACHINE: { icon: Printer, classes: "bg-blue-100 text-blue-700" },
  INVENTORY: { icon: Package, classes: "bg-orange-100 text-orange-700" },
  PAYMENT: { icon: Wallet, classes: "bg-green-100 text-green-700" },
  CONTRACT: { icon: FileText, classes: "bg-purple-100 text-purple-700" },
  GENERAL: { icon: Bell, classes: "bg-gray-100 text-gray-600" },
  SYSTEM: { icon: Bell, classes: "bg-gray-100 text-gray-600" },
};

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600",
  NORMAL: "bg-blue-50 text-blue-700",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

const NOTIFICATION_TYPES = [
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
];

const NOTIFICATION_CATEGORIES = [
  "SERVICE_REQUEST",
  "MACHINE",
  "INVENTORY",
  "PAYMENT",
  "CONTRACT",
  "GENERAL",
  "SYSTEM",
];

function formatTimestamp(value: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function relativeTime(value: string, locale: string) {
  try {
    const diffSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-EG" : "en", { numeric: "auto" });
    const abs = Math.abs(diffSeconds);
    if (abs < 60) return rtf.format(diffSeconds, "second");
    if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
    return rtf.format(Math.round(diffSeconds / 86400), "day");
  } catch {
    return formatTimestamp(value, locale);
  }
}

export default function NotificationsPage() {
  const { t, locale, dir } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
      if (statusFilter === "unread") params.set("unread", "true");
      if (typeFilter) params.set("type", typeFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      const res = await fetch(`/api/notifications?${params.toString()}`);
      if (!res.ok) return;
      const payload = await res.json();
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setUnreadCount(Number(payload.unreadCount ?? 0));
      setTotalPages(Number(payload.totalPages ?? 1));
      setTotalItems(Number(payload.totalCount ?? 0));
    } finally {
      setLoading(false);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchNotifications, ["notifications"]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      void fetchNotifications();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, typeFilter, categoryFilter]);

  const markAsRead = async (id: string, read: boolean) => {
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    });
    refresh();
    notifyDataChanged(["notifications"]);
  };

  const markAllAsRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllAsRead: true }),
    });
    refresh();
    notifyDataChanged(["notifications"]);
  };

  const openNotification = (notification: NotificationItem) => {
    if (!notification.isRead) {
      void markAsRead(notification.id, true);
    }
    router.push(notification.actionUrl || "/notifications");
  };

  const hasActiveFilters = statusFilter !== "" || typeFilter !== "" || categoryFilter !== "";

  return (
    <div dir={dir}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">{t("notifications.title")}</h1>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
              {unreadCount.toLocaleString()} {t("notifications.unreadCount")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={refresh} refreshing={refreshing} />
          <button
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-2 border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCheck size={16} className="shrink-0" />
            {t("notifications.markAllRead")}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col gap-2 md:flex-row md:items-center md:flex-wrap">
          <FilterSelect
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={[
              { value: "unread", label: t("notifications.filterUnread") },
              { value: "read", label: t("notifications.filterRead") },
            ]}
            allLabel={t("notifications.filterAll")}
            className="md:w-36"
          />
          <FilterSelect
            value={categoryFilter}
            onChange={(v) => { setCategoryFilter(v); setPage(1); }}
            options={NOTIFICATION_CATEGORIES.map((c) => ({ value: c, label: t(`notifications.categories.${c}`) }))}
            allLabel={t("notifications.categoryFilter")}
            className="md:w-44"
          />
          <FilterSelect
            value={typeFilter}
            onChange={(v) => { setTypeFilter(v); setPage(1); }}
            options={NOTIFICATION_TYPES.map((ty) => ({ value: ty, label: t(`notifications.types.${ty}`) }))}
            allLabel={t("notifications.typeFilter")}
            className="md:w-56"
          />
          {hasActiveFilters && (
            <button
              onClick={() => { setStatusFilter(""); setTypeFilter(""); setCategoryFilter(""); setPage(1); }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              {t("common.resetFilters")}
            </button>
          )}
          <div className="md:ms-auto text-sm text-gray-400 whitespace-nowrap">
            {totalItems.toLocaleString()}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Bell size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">{t("notifications.empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {items.map((notification) => {
              const meta = CATEGORY_ICON[notification.category] ?? CATEGORY_ICON.GENERAL;
              const Icon = meta.icon;
              const typeLabel = t(`notifications.types.${notification.type}`);
              return (
                <li key={notification.id} className={`transition-colors ${notification.isRead ? "" : "bg-blue-50/50"}`}>
                  <div className="flex items-start gap-3 px-4 py-4 hover:bg-gray-50">
                    <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${meta.classes}`}>
                      <Icon size={18} />
                    </div>

                    <button onClick={() => openNotification(notification)} className="flex-1 min-w-0 text-start">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
                          {!notification.isRead && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" aria-hidden />}
                          {notification.title}
                        </span>
                        <span className="text-[11px] text-gray-400 whitespace-nowrap" dir="ltr">
                          {relativeTime(notification.createdAt, locale)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{notification.message}</p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{typeLabel}</span>
                        {notification.priority !== "NORMAL" && (
                          <span className={`px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[notification.priority] ?? ""}`}>
                            {t(`notifications.priorities.${notification.priority}`)}
                          </span>
                        )}
                        <span className="text-gray-400">
                          {notification.sender?.name ?? t("notifications.systemSender")}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-400">{formatTimestamp(notification.createdAt, locale)}</span>
                      </div>
                    </button>

                    <button
                      onClick={() => markAsRead(notification.id, !notification.isRead)}
                      title={notification.isRead ? t("notifications.markUnread") : t("notifications.markRead")}
                      aria-label={notification.isRead ? t("notifications.markUnread") : t("notifications.markRead")}
                      className={`shrink-0 rounded-lg p-2 transition-colors ${
                        notification.isRead
                          ? "text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                          : "text-blue-500 hover:bg-blue-50 hover:text-blue-700"
                      }`}
                    >
                      {notification.isRead ? <RotateCcw size={16} /> : <Check size={16} />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && items.length > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
          />
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        <Link href="/" className="hover:text-blue-600">{t("navigation.dashboard")}</Link>
      </p>
    </div>
  );
}
