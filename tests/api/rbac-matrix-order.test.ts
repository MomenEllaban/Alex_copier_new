import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..");

/**
 * The roles screen groups pages under sidebar section headings, so its order has
 * to follow the sidebar. It used to order by `group` name, which put "admin"
 * above "general" and moved every section away from the nav the user clicks.
 *
 * These two tests pin the contract that makes sidebar order reach the matrix:
 * the scanner writes `sortOrder` in Sidebar.tsx order, and the matrix API reads
 * the catalogue back on that column alone.
 */
describe("roles matrix follows sidebar order", () => {
  const matrixSource = fs.readFileSync(
    path.join(ROOT, "src", "app", "api", "roles", "[id]", "permissions", "route.ts"),
    "utf8"
  );

  it("the matrix API sorts by sortOrder, not by group name", () => {
    const orderBy = matrixSource.match(/orderBy:\s*\[([^\]]*)\]/)?.[1] ?? "";

    expect(orderBy).toMatch(/sortOrder/);
    // Alphabetical group ordering is the bug this guards against.
    expect(orderBy).not.toMatch(/group/);
  });

  it("the scanner assigns sortOrder in Sidebar.tsx order", () => {
    const scanner = fs.readFileSync(path.join(ROOT, "scripts", "scan-permissions.ts"), "utf8");

    // `nav` is collected by walking Sidebar.tsx top to bottom, and the index in
    // that array becomes sortOrder.
    expect(scanner).toMatch(/const ordered: Page\[\] = \[/);
    expect(scanner).toMatch(/sortOrder: entry \? index \* 10/);
  });

  it("every sidebar group has a label in both i18n files", () => {
    const sidebar = fs.readFileSync(path.join(ROOT, "src", "components", "Sidebar.tsx"), "utf8");
    const groups = [...sidebar.matchAll(/key:\s*"(navigation\.group\.[A-Za-z]+)"/g)].map((m) => m[1]);
    expect(groups.length).toBeGreaterThan(0);

    const ar = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "i18n", "ar.json"), "utf8"));
    const en = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "i18n", "en.json"), "utf8"));

    for (const group of groups) {
      const [, section] = /^navigation\.group\.([A-Za-z]+)$/.exec(group) ?? [];
      for (const [locale, file] of [["ar", ar], ["en", en]] as const) {
        const value = section ? file?.navigation?.group?.[section] : undefined;
        expect(value, `${group} missing from ${locale}.json`).toBeTruthy();
      }
    }
  });

  it("the reports section is its own group, separate from admin", () => {
    const sidebar = fs.readFileSync(path.join(ROOT, "src", "components", "Sidebar.tsx"), "utf8");
    const groups = [
      ...sidebar.matchAll(/key:\s*"(navigation\.group\.[A-Za-z]+)"/g),
    ].map((m) => ({ key: m[1], at: m.index ?? 0 }));

    const reports = groups.findIndex((g) => g.key === "navigation.group.reports");
    const admin = groups.findIndex((g) => g.key === "navigation.group.admin");
    expect(reports).toBeGreaterThanOrEqual(0);
    expect(admin).toBeGreaterThan(reports);

    // The reports section holds the report routes, and stops at the next group.
    const block = sidebar.slice(groups[reports].at, groups[reports + 1].at);
    expect(block).toContain('href: "/reports/contracts"');
    expect(block).toContain('href: "/reports/spare-parts"');
    // Reports must not be filed under the admin section any more.
    expect(block).not.toContain("navigation.group.admin");
  });
});
