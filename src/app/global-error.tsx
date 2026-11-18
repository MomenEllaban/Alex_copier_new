"use client";

import { useEffect, useMemo, useState } from "react";
import { clientExceptionInfo, reportClientError } from "@/lib/client-errors";

/**
 * Last-resort boundary. It replaces the whole document, so it must render its
 * own <html>/<body> and cannot rely on the root layout or on any provider
 * (i18n, session, UI) being available.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [sent, setSent] = useState(false);
  const info = useMemo(() => clientExceptionInfo(error, "global-error"), [error]);

  useEffect(() => {
    console.error("[global] unhandled error:", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          background: "#f9fafb",
          color: "#1f2937",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <div
            style={{
              width: "3.5rem",
              height: "3.5rem",
              margin: "0 auto 1rem",
              borderRadius: "9999px",
              background: "#fee2e2",
              color: "#dc2626",
              fontSize: "1.75rem",
              fontWeight: "700",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            !
          </div>
          <h1 style={{ fontSize: "1.125rem", fontWeight: "700", margin: "0 0 0.5rem" }}>
            حصل خطأ في التطبيق
          </h1>
          <p dir="rtl" style={{ fontSize: "0.875rem", lineHeight: "1.75", color: "#4b5563", margin: "0 0 0.75rem" }}>
            حصل خطأ غير متوقع في التطبيق. جرّب تحميل الصفحة تاني، ولو المشكلة فضلت موجودة اضغط «إرسال البلاغ».
          </p>
          <p dir="ltr" style={{ fontSize: "0.8125rem", lineHeight: "1.7", color: "#6b7280", margin: "0 0 1.25rem", textAlign: "center" }}>
            An unexpected error interrupted the app. Retry; if it persists, send us the report below.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => reset()}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: 0,
                borderRadius: "0.5rem",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: "500",
                cursor: "pointer",
              }}
            >
              إعادة المحاولة
            </button>
            <button
              onClick={() => window.location.assign("/login")}
              style={{
                background: "#fff",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: "0.5rem",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: "500",
                cursor: "pointer",
              }}
            >
              صفحة الدخول
            </button>
            <button
              onClick={async () => {
                if (await reportClientError(info)) setSent(true);
              }}
              disabled={sent}
              style={{
                background: "#eff6ff",
                color: "#1d4ed8",
                border: "1px solid #bfdbfe",
                borderRadius: "0.5rem",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              {sent ? "تم الإرسال ✓" : "إرسال البلاغ / Report"}
            </button>
          </div>
          {error.digest && (
            <p style={{ marginTop: "1.5rem", fontSize: "0.6875rem", color: "#9ca3af" }} dir="ltr">
              ERROR {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
