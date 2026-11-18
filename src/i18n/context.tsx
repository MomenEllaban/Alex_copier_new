"use client";

import { createContext, useContext, useState, useCallback, useSyncExternalStore, type ReactNode } from "react";
import ar from "@/i18n/ar.json";
import en from "@/i18n/en.json";
import { setErrorLocale } from "@/lib/client-errors";

type Locale = "ar" | "en";

const translations: Record<Locale, Record<string, unknown>> = { ar, en };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  dir: "rtl" | "ltr";
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getNestedValue(obj: unknown, path: string): string {
  if (!path || typeof path !== "string") return "";
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return path;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : path;
}

function readLocaleFromStorage(): Locale {
  if (typeof window === "undefined") return "ar";
  try {
    const stored = localStorage.getItem("locale");
    if (stored === "ar" || stored === "en") return stored;
  } catch {}
  return "ar";
}

let listeners: Array<() => void> = [];
function emitLocaleChange() {
  for (const l of listeners) l();
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [, setTick] = useState(0);

  const locale = useSyncExternalStore(
    (onStoreChange) => {
      listeners.push(onStoreChange);
      return () => {
        listeners = listeners.filter((l) => l !== onStoreChange);
      };
    },
    readLocaleFromStorage,
    () => "ar" as Locale,
  );

  const setLocale = useCallback((newLocale: Locale) => {
    try {
      localStorage.setItem("locale", newLocale);
    } catch {}
    document.documentElement.dir = newLocale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = newLocale;
    emitLocaleChange();
    setTick((t) => t + 1);
  }, []);

  const t = useCallback((key: string): string => {
    if (!key || typeof key !== "string") return "";
    return getNestedValue(translations[locale], key);
  }, [locale]);

  const dir = locale === "ar" ? "rtl" : "ltr";

  // Keep the error formatter in sync so failures are always shown in the
  // language the user is currently browsing in (Arabic by default).
  setErrorLocale(locale);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
