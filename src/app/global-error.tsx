"use client";

import { useEffect } from "react";

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
          <p style={{ fontSize: "0.875rem", lineHeight: "1.75", color: "#4b5563", margin: "0 0 1.25rem" }}>
            حصل خطأ غير متوقع في التطبيق. جرّب تحميل الصفحة تاني، ولو المشكلة فضلت موجودة سجّل خروج وادخل من جديد.
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
