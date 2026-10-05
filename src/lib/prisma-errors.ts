/**
 * The message of a thrown value, or `fallback` when it carries none.
 *
 * `catch` gives `unknown`, and reaching for `.message` on it is exactly the
 * kind of unguarded cast that hides real bugs. Thrown values are often not
 * Errors at all (a rejected string, a Prisma wrapper), so this checks before
 * reading instead of asserting.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export function traceError(prefix: string, error: unknown): number {
  console.error(prefix, error);
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: string }).code;
    switch (code) {
      case "P2003":
        return 400; // FK violation -> invalid/unknown reference
      case "P2002":
        return 409; // unique constraint -> duplicate
      case "P2025":
        return 404; // record not found
      case "P2024":
      case "P2034":
        return 409; // timeout / transaction conflict
      default:
        return 500;
    }
  }
  return 500;
}