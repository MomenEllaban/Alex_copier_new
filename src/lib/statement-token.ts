import { randomBytes } from "crypto";

/** How long a shared statement link stays valid. */
export const STATEMENT_TOKEN_TTL_DAYS = 30;

const DAY_MS = 864e5;

export function generateStatementToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * A statement link is re-issued (and therefore revoked) on every press, so a
 * link can always be killed: send a new one and the old URL stops resolving.
 */
export function issueStatementToken(now: Date = new Date()): {
  statementToken: string;
  statementTokenCreatedAt: Date;
  statementTokenExpiresAt: Date;
} {
  return {
    statementToken: generateStatementToken(),
    statementTokenCreatedAt: now,
    statementTokenExpiresAt: new Date(now.getTime() + STATEMENT_TOKEN_TTL_DAYS * DAY_MS),
  };
}

/**
 * A link with no expiry is treated as expired: rows written before the expiry
 * column existed must not keep leaking a full account statement forever.
 */
export function isStatementTokenExpired(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < now.getTime();
}
