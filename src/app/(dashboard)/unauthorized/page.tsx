"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/i18n/context";

export default function UnauthorizedPage() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center
          shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div
          className="mx-auto flex size-14 items-center justify-center rounded-full bg-red-50
            text-red-600 dark:bg-red-950 dark:text-red-400"
        >
          <ShieldAlert size={26} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-50">
          {t("roles.unauthorized")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {t("roles.unauthorizedBody")}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-slate-900 px-5
            py-2.5 text-sm font-medium text-white transition hover:bg-slate-700
            dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {t("common.backHome")}
        </Link>
      </div>
    </div>
  );
}
