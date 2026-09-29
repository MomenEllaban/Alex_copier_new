/**
 * Creates the Prisma tables inside the `demo` schema without touching the
 * production `public` schema.
 *
 * Runs `prisma db push` with DATABASE_URL pointed at .env.demo, so the URL
 * always carries `&schema=demo` and never the production one.
 *
 * NOTE: Prisma Client itself still resolves models to `public` (see TASKS.md),
 * so this only prepares the schema. Seeding is blocked until that is resolved.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const url = readFileSync(".env.demo", "utf8")
  .split("\n")
  .find((line) => line.startsWith("DATABASE_URL="))
  ?.slice("DATABASE_URL=".length)
  .trim();

if (!url) {
  console.error(".env.demo has no DATABASE_URL");
  process.exit(1);
}
if (!url.includes("schema=demo")) {
  console.error(".env.demo must point at the demo schema (missing schema=demo)");
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", "db", "push"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: url },
});

process.exit(result.status ?? 1);
