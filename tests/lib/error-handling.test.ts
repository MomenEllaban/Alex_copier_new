import { describe, expect, it } from "vitest";
import { getErrorDefinition } from "@/lib/error-catalog";
import { buildApiError, normalizeError, withApiErrors } from "@/lib/api-errors";
import { apiErrorMessage } from "@/lib/api-client";

describe("bilingual error catalogue", () => {
  it("always returns Arabic and English text, even for unknown codes", () => {
    for (const code of ["P2002", "INSUFFICIENT_STOCK", "FORBIDDEN", "SOMETHING_NEW"]) {
      const definition = getErrorDefinition(code);
      expect(definition.ar.trim().length).toBeGreaterThan(5);
      expect(definition.en.trim().length).toBeGreaterThan(5);
    }
    expect(getErrorDefinition("P2002").status).toBe(409);
  });
});

describe("server error envelope", () => {
  it("includes request id, both languages and no stack trace", () => {
    const body = buildApiError("INSUFFICIENT_STOCK");
    expect(body.code).toBe("INSUFFICIENT_STOCK");
    expect(body.requestId).toMatch(/^err-|^[0-9a-f-]{36}$/);
    expect(body.messageAr).toContain("الكمية");
    expect(body.messageEn).toContain("quantity");
    expect(JSON.stringify(body)).not.toContain("at Object");
  });

  it("maps Prisma codes to friendly messages", () => {
    const body = normalizeError(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    expect(body.code).toBe("P2002");
    expect(body.status).toBe(409);
    expect(body.messageAr).toContain("مستخدمة بالفعل");
  });

  it("wraps a thrown exception instead of leaking it", async () => {
    const handler = withApiErrors(async () => {
      throw Object.assign(new Error("connect ECONNREFUSED /srv/app/schema.prisma:12"), { code: "P2024" });
    });
    const response = await handler();
    expect(response.status).toBe(504);
    const body = await response.json();
    expect(body.code).toBe("P2024");
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(body)).not.toContain("schema.prisma");
  });
});

describe("client formatting", () => {
  it("prefers the detailed Arabic message from the envelope", () => {
    const message = apiErrorMessage(
      {
        code: "ZERO",
        error: "old generic text",
        messageAr: "الكمية غير كافية",
        messageEn: "Not enough stock",
        requestId: "req-1",
      },
      (key) => key,
    );
    expect(message).toBe("الكمية غير كافية");
  });

  it("falls back gracefully when the body is empty", () => {
    const message = apiErrorMessage(null, (key) => (key === "common.error" ? "حدث خطأ" : key));
    expect(message).toBe("حدث خطأ");
  });
});
