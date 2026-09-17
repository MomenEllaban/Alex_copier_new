"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/context";
import { useSession, signOut } from "next-auth/react";
import { Bell, User, ChevronDown, LogOut, Globe, CheckCheck, Volume2, VolumeX } from "lucide-react";
import { ROLE_LABELS_AR } from "@/lib/permissions";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string | null;
  priority?: string | null;
  sender?: { id?: string; name?: string } | null;
};

const SOUND_PREF_KEY = "notifications-sound-enabled";

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

export default function Header({ title }: { title: string }) {
  const { locale, setLocale, t } = useI18n();
  const { data: session } = useSession();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const hasInitialLoadRef = useRef(false);
  const previousUnreadCountRef = useRef(0);

  const userName = session?.user?.name || "المستخدم";
  const userRole = (session?.user as { role?: string })?.role as keyof typeof ROLE_LABELS_AR | undefined;
  const roleLabel = userRole ? ROLE_LABELS_AR[userRole] : "";

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      try {
        const stored = window.localStorage.getItem(SOUND_PREF_KEY);
        if (!cancelled && stored !== null) setSoundEnabled(stored === "true");
      } catch {
        // localStorage unavailable — keep default.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      window.localStorage.setItem(SOUND_PREF_KEY, String(next));
    } catch {
      // ignore storage failures
    }
  };

  const playNotificationTone = async () => {
    if (!soundEnabled || typeof window === "undefined") return;

    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    try {
      const audioContext = new AudioCtor();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.value = 880;
      gainNode.gain.value = 0.03;
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.12);
      await audioContext.resume();
    } catch {
      // Ignore browser autoplay restrictions gracefully.
    }
  };

  const fetchNotifications = async () => {
    if (!session?.user?.id) return;

    try {
      const response = await fetch("/api/notifications?limit=10");
      if (!response.ok) return;
      const payload = await response.json();
      const nextNotifications = Array.isArray(payload.items) ? payload.items : [];
      const nextUnreadCount = Number(payload.unreadCount ?? 0);

      setNotifications(nextNotifications);
      setUnreadCount(nextUnreadCount);

      if (hasInitialLoadRef.current && nextUnreadCount > previousUnreadCountRef.current) {
        void playNotificationTone();
      }

      previousUnreadCountRef.current = nextUnreadCount;
      hasInitialLoadRef.current = true;
    } catch {
      // Silent fallback when notifications API is unavailable.
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      setNotifications((current) => current.map((notification) =>
        notification.id === id ? { ...notification, isRead: true } : notification,
      ));
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch {
      // Ignore transient errors.
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllAsRead: true }),
      });
      if (!response.ok) return;
      setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Ignore transient errors.
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void fetchNotifications();
    });
    const intervalId = window.setInterval(() => {
      void fetchNotifications();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  return (
    <header className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white py-3 pr-16 pl-3 shadow-sm sm:py-4 sm:pl-6 lg:px-6">
      <h2 className="truncate text-[length:var(--text-subtitle)] font-semibold text-gray-800">{title}</h2>

      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        <button
          onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
          className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:px-3"
        >
          <Globe size={16} />
          {locale === "ar" ? "EN" : "AR"}
        </button>

        <div className="relative" ref={notificationRef}>
          <button
            aria-label={t("notifications.title")}
            onClick={() => setNotificationOpen((value) => !value)}
            className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -left-1 min-w-5 h-5 px-1.5 bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notificationOpen && (
            <div className="fixed inset-x-2 top-16 z-50 rounded-xl border border-gray-200 bg-white py-2 shadow-xl sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-96">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-800">
                  {t("notifications.title")}
                  {unreadCount > 0 && (
                    <span className="ms-2 text-xs font-normal text-red-500">{unreadCount}</span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleSound}
                    title={soundEnabled ? t("notifications.soundOff") : t("notifications.soundOn")}
                    aria-label={soundEnabled ? t("notifications.soundOff") : t("notifications.soundOn")}
                    className={`rounded-lg p-1.5 transition-colors ${soundEnabled ? "text-blue-600 hover:bg-blue-50" : "text-gray-400 hover:bg-gray-100"}`}
                  >
                    {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </button>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <CheckCheck size={14} />
                      {t("notifications.markAllRead")}
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500 text-center">{t("notifications.empty")}</div>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => {
                        if (!notification.isRead) {
                          void markAsRead(notification.id);
                        }
                        if (notification.actionUrl) {
                          setNotificationOpen(false);
                          router.push(notification.actionUrl);
                        }
                      }}
                      className={`w-full text-start px-4 py-3 border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                        notification.isRead ? "bg-white" : "bg-blue-50/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 inline-flex items-center gap-2">
                            {!notification.isRead && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0" aria-hidden />}
                            {notification.title}
                          </p>
                          <p className="mt-1 text-sm text-gray-600">{notification.message}</p>
                        </div>
                        {notification.priority && notification.priority !== "NORMAL" && (
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            notification.priority === "CRITICAL"
                              ? "text-red-700 bg-red-100"
                              : notification.priority === "HIGH"
                                ? "text-orange-700 bg-orange-100"
                                : "text-gray-500 bg-gray-100"
                          }`}>
                            {t(`notifications.priorities.${notification.priority}`)}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
                        <span>
                          {notification.sender?.name ?? t("notifications.systemSender")}
                        </span>
                        <span>{relativeTime(notification.createdAt, locale)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <Link
                href="/notifications"
                onClick={() => setNotificationOpen(false)}
                className="block px-4 py-3 text-sm text-center text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 border-t border-gray-100 font-medium"
              >
                {t("notifications.viewAll")}
              </Link>
            </div>
          )}
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-gray-100 sm:px-3"
          >
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
            <div className="text-start min-w-0">
              <p className="text-sm font-medium text-gray-700 leading-tight truncate max-w-[100px] sm:max-w-none">{userName}</p>
              {roleLabel && <p className="text-xs text-gray-400 leading-tight">{roleLabel}</p>}
            </div>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 w-[min(14rem,calc(100vw-1rem))] rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-800">{userName}</p>
                {roleLabel && <p className="text-xs text-gray-500 mt-0.5">{roleLabel}</p>}
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={16} />
                {t("navigation.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
