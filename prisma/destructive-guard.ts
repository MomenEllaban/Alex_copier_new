/**
 * Guard for the destructive seed scripts.
 *
 * `prisma/seed.ts` runs 45 `TRUNCATE … CASCADE` statements, and the repo's
 * `.env` points at the production (Neon) database — so a `db seed` aimed at
 * the wrong environment wipes every ledger in the ERP irrecoverably. The
 * check lives in its own module so it can be unit-tested without executing
 * the seed itself.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * True when the connection string points at a database on this machine.
 *
 * The host is parsed rather than substring-matched: `localhost.evil.com` or
 * `mydb-localhost.net` must not slip through a `/localhost/` test, or the
 * guard would happily wipe a remote database.
 */
export function isLocalDatabaseUrl(url: string | undefined | null): boolean {
  if (!url) return false;

  let hostname = "";
  let socketHost: string | null = null;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    socketHost = parsed.searchParams.get("host");
  } catch {
    return false;
  }

  // A unix socket has no host — by definition it is local.
  if (socketHost) return true;
  if (!hostname) return false;

  return LOCAL_HOSTS.has(hostname);
}

/**
 * Throws unless the target database is local, or the operator has explicitly
 * opted in with `ALLOW_DESTRUCTIVE_SEED=1`.
 *
 * @returns a warning message when the run is allowed but unsafe.
 */
export function assertDestructiveSeedAllowed(
  env: { DATABASE_URL?: string; ALLOW_DESTRUCTIVE_SEED?: string } = process.env as {
    DATABASE_URL?: string;
    ALLOW_DESTRUCTIVE_SEED?: string;
  },
): string | null {
  const url = env.DATABASE_URL;

  if (!url) {
    throw new Error("رفض التشغيل: DATABASE_URL غير محدد.");
  }
  if (isLocalDatabaseUrl(url)) {
    return null;
  }
  if (env.ALLOW_DESTRUCTIVE_SEED === "1") {
    return "تحذير: ALLOW_DESTRUCTIVE_SEED=1 — سيتم مسح كل الجداول في قاعدة ليست محلية.";
  }

  throw new Error(
    "رفض التشغيل: هذا الـ seed يمسح كل الجداول (TRUNCATE … CASCADE). " +
      "DATABASE_URL ليس قاعدة بيانات محلية. " +
      "لو أنت متأكد، شغّله مع ALLOW_DESTRUCTIVE_SEED=1 — " +
      "لكن خد snapshot من القاعدة الأول.",
  );
}
