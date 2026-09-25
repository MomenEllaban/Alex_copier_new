import { describe, expect, it } from "vitest";

import { assertDestructiveSeedAllowed, isLocalDatabaseUrl } from "../../prisma/destructive-guard";

/** The production shape that lives in this repo's `.env` (Neon, pooled). */
const PRODUCTION_URL = "postgresql://user:pw@ep-cool-name.us-east-2.aws.neon.tech/alex?sslmode=require";

describe("isLocalDatabaseUrl", () => {
  it.each([
    "postgresql://postgres:postgres@localhost:5432/alex",
    "postgresql://postgres:postgres@127.0.0.1:5432/alex",
    "postgresql://postgres:postgres@[::1]:5432/alex",
    "postgres://LOCALHOST/alex",
  ])("treats %s as local", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it.each([
    PRODUCTION_URL,
    "postgresql://user:pw@db.supabase.co:5432/postgres",
    "postgresql://user:pw@10.0.0.5:5432/alex",
    // A substring match on "localhost" would wrongly allow these remote hosts.
    "postgresql://user:pw@localhost.evil.com/alex",
    "postgresql://user:pw@mydb-localhost.net/alex",
    // No host and no socket: refuse rather than guess.
    "postgresql:///alex",
  ])("treats %s as NOT local", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });

  it("treats a unix-socket connection as local", () => {
    expect(isLocalDatabaseUrl("postgresql:///alex?host=/var/run/postgresql")).toBe(true);
  });

  it("treats an unparsable url as not local", () => {
    expect(isLocalDatabaseUrl("not a url")).toBe(false);
  });

  it("treats a missing url as not local", () => {
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
    expect(isLocalDatabaseUrl("")).toBe(false);
  });
});

describe("assertDestructiveSeedAllowed", () => {
  it("throws when DATABASE_URL is missing instead of defaulting to something", () => {
    expect(() => assertDestructiveSeedAllowed({})).toThrow(/DATABASE_URL/);
  });

  it("throws against the production database — the case that wiped the ledgers", () => {
    expect(() => assertDestructiveSeedAllowed({ DATABASE_URL: PRODUCTION_URL })).toThrow(
      /TRUNCATE/,
    );
  });

  it("names the opt-in variable so the operator knows how to proceed", () => {
    expect(() => assertDestructiveSeedAllowed({ DATABASE_URL: PRODUCTION_URL })).toThrow(
      /ALLOW_DESTRUCTIVE_SEED/,
    );
  });

  it("allows a local database without any opt-in", () => {
    expect(
      assertDestructiveSeedAllowed({ DATABASE_URL: "postgresql://postgres@localhost:5432/alex" }),
    ).toBeNull();
  });

  it("allows a non-local database only with the explicit opt-in, and warns", () => {
    const warning = assertDestructiveSeedAllowed({
      DATABASE_URL: PRODUCTION_URL,
      ALLOW_DESTRUCTIVE_SEED: "1",
    });

    expect(warning).toMatch(/ALLOW_DESTRUCTIVE_SEED/);
  });

  it("does not accept a truthy-looking opt-in value", () => {
    for (const value of ["0", "true", "yes", "", " 1"]) {
      expect(() =>
        assertDestructiveSeedAllowed({ DATABASE_URL: PRODUCTION_URL, ALLOW_DESTRUCTIVE_SEED: value }),
      ).toThrow(/TRUNCATE/);
    }
  });
});
