import { describe, expect, it } from "vitest";

import {
  STATEMENT_TOKEN_TTL_DAYS,
  isStatementTokenExpired,
  issueStatementToken,
} from "@/lib/statement-token";

describe("issueStatementToken", () => {
  const now = new Date("2026-09-25T10:00:00.000Z");

  it("stamps a 30-day expiry", () => {
    const issued = issueStatementToken(now);

    expect(issued.statementTokenCreatedAt).toEqual(now);
    expect(issued.statementTokenExpiresAt.getTime()).toBe(
      now.getTime() + STATEMENT_TOKEN_TTL_DAYS * 864e5,
    );
  });

  it("mints a long unguessable token", () => {
    expect(issueStatementToken(now).statementToken).toMatch(/^[0-9a-f]{32}$/);
  });

  it("mints a different token every time — pressing re-issue revokes the old link", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => issueStatementToken(now).statementToken),
    );

    expect(tokens.size).toBe(50);
  });
});

describe("isStatementTokenExpired", () => {
  const now = new Date("2026-09-25T10:00:00.000Z");

  it("refuses a link with no expiry recorded", () => {
    // Rows written before the expiry column existed fall in here — they must
    // stop working rather than leak a statement forever.
    expect(isStatementTokenExpired(null, now)).toBe(true);
    expect(isStatementTokenExpired(undefined, now)).toBe(true);
  });

  it("accepts a link that is still inside its window", () => {
    const issued = issueStatementToken(now);

    expect(isStatementTokenExpired(issued.statementTokenExpiresAt, now)).toBe(false);
    expect(
      isStatementTokenExpired(new Date(now.getTime() + 29 * 864e5), now),
    ).toBe(false);
  });

  it("refuses a link once the window has passed", () => {
    const issued = issueStatementToken(now);
    const afterWindow = new Date(issued.statementTokenExpiresAt.getTime() + 1);

    expect(isStatementTokenExpired(issued.statementTokenExpiresAt, afterWindow)).toBe(true);
  });

  it("stays valid right up to the expiry instant, per the audit's `<` check", () => {
    const issued = issueStatementToken(now);

    expect(isStatementTokenExpired(issued.statementTokenExpiresAt, issued.statementTokenExpiresAt)).toBe(
      false,
    );
  });

  it("accepts a Date coming back as an ISO string from the database", () => {
    const issued = issueStatementToken(now);

    expect(
      isStatementTokenExpired(issued.statementTokenExpiresAt.toISOString(), now),
    ).toBe(false);
  });
});
