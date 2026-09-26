"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary for the whole dashboard group.
 *
 * Without this file, any client-side throw in any page bubbles all the way up
 * to Next's built-in global error page, which shows an English
 * "This page couldn't load" with no way to recover. This keeps the failure
 * inside the dashboard shell and gives the user a real Arabic message plus a
 * retry that does not lose their session.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center" dir="rtl">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-3xl text-red-600">
        !
      </div>
      <h2 className="text-lg font-bold text-gray-800">حصلت مشكلة في تحميل الصفحة</h2>
      <p className="max-w-md text-sm leading-6 text-gray-600">
        البيانات مالتهاش دلوقتي. جرّب تحميل الصفحة تاني، ولو المشكلة فضلت موجودة
        <span className="mx-1 font-medium text-gray-700">أبلغ الأدمن</span>
        واشملله رسالة الخطأ.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          إعادة المحاولة
        </button>
        <button
          onClick={() => window.location.assign("/")}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          الصفحة الرئيسية
        </button>
      </div>
      {error.digest && (
        <p className="pt-2 text-[11px] text-gray-400" dir="ltr">
          ERROR {error.digest}
        </p>
      )}
    </div>
  );
}
