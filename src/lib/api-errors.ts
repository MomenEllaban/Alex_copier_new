import { NextResponse } from "next/server";
import { getErrorDefinition } from "./error-catalog";
import { errorMessage } from "./prisma-errors";

/**
 * Server-side error envelope used by every API route.
 *
 * Rules:
 * - The browser never receives a stack trace, SQL, file paths or internal names.
 * - Every failure carries: a stable `code`, a bilingual detailed message, a
 *   `requestId` for support, and an actionable hint in both languages.
 * - `error` stays as the Arabic message for backward compatibility with older
 *   client code that only reads `data.error`.
 */
export interface ApiErrorBody {
  error: string;
  code: string;
  status: number;
  requestId: string;
  messageAr: string;
  messageEn: string;
  hintAr?: string;
  hintEn?: string;
  fieldErrors?: Record<string, string>;
}

export interface ApiErrorOptions {
  ar?: string;
  en?: string;
  status?: number;
  hintAr?: string;
  hintEn?: string;
  fieldErrors?: Record<string, string>;
}

export function createRequestId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  } catch {
    return `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function buildApiError(code: string, options: ApiErrorOptions = {}): ApiErrorBody {
  const definition = getErrorDefinition(code);
  const messageAr = options.ar?.trim() || definition.ar;
  const messageEn = options.en?.trim() || definition.en;
  return {
    error: messageAr,
    code,
    status: options.status ?? definition.status,
    requestId: createRequestId(),
    messageAr,
    messageEn,
    ...(options.hintAr || definition.hintAr ? { hintAr: options.hintAr || definition.hintAr } : {}),
    ...(options.hintEn || definition.hintEn ? { hintEn: options.hintEn || definition.hintEn } : {}),
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
  };
}

/** Return a standard JSON error response from any route. */
export function apiError(code: string, options?: ApiErrorOptions): NextResponse {
  const body = buildApiError(code, options);
  return NextResponse.json(body, { status: body.status });
}

function codeFromError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code.trim();
  }
  const message = errorMessage(error, "");
  const match = message.match(/\b(P\d{4}|[A-Z][A-Z0-9_]{4,})\b/);
  return match?.[1] || "INTERNAL_ERROR";
}

/** Convenience: turn a caught error into a ready HTTP response. */
export function errorResponse(error: unknown): NextResponse {
  const body = normalizeError(error);
  console.error(`[api-error] ${body.requestId} ${body.code}`, error);
  return NextResponse.json(body, { status: body.status });
}

/** Convert any thrown value into a safe, detailed, bilingual envelope. */
export function normalizeError(error: unknown): ApiErrorBody {
  const rawCode = codeFromError(error);
  const definition = getErrorDefinition(rawCode);
  // Never echo the raw thrown message: Prisma/driver text is English, can carry
  // SQL or file paths, and would break the Arabic-first promise. The catalogue
  // already has a detailed bilingual message for every code we understand.
  return {
    error: definition.ar,
    code: rawCode,
    status: definition.status,
    requestId: createRequestId(),
    messageAr: definition.ar,
    messageEn: definition.en,
    ...(definition.hintAr ? { hintAr: definition.hintAr } : {}),
    ...(definition.hintEn ? { hintEn: definition.hintEn } : {}),
  };
}

/**
 * Wrap a Next.js route handler so an unexpected exception becomes a clean
 * bilingual error instead of Next's generic HTML 500 page.
 */
export function withApiErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response> | Response,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      const body = normalizeError(error);
      const first = args[0] as { url?: string } | undefined;
      const path = first?.url ? new URL(first.url, "http://localhost").pathname : "unknown";
      console.error(`[api-error] ${body.requestId} ${body.code} ${path}`, error);
      return NextResponse.json(body, { status: body.status });
    }
  };
}
