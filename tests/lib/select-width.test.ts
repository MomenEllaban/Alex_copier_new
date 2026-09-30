import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "src", "components", "SearchableSelect.tsx"), "utf8");

/**
 * The custom select is used by FilterSelect (every filter toolbar) and by
 * SelectWithAdd (every quick-add field), so its popup is what most dropdowns in
 * the app actually look like.
 *
 * It used to be `w-full` — pinned to the trigger — while every option label was
 * `truncate`, so a popup holding long Arabic company/product names showed a
 * handful of clipped characters per row. The popup has to be allowed to grow to
 * its content instead, bounded so it cannot run off the screen.
 */
describe("SearchableSelect popup width", () => {
  it("sizes the popup to its content instead of the trigger width", () => {
    const popup = SRC.match(/<div\s+style=\{[\s\S]*?className=\{`absolute[\s\S]*?`\}/)?.[0] ?? "";
    expect(popup, "could not find the popup element in SearchableSelect.tsx").toBeTruthy();

    // w-max lets it grow to the widest option; min-w-full keeps it at least as
    // wide as the trigger, so it is never smaller than it used to be.
    expect(popup).toContain("w-max");
    expect(popup).toContain("min-w-full");
    expect(popup).not.toMatch(/(^|\s)w-full(\s|$)/);
  });

  it("caps the growth and leaves room for the scrollbar", () => {
    // An inline max-width is what keeps a very long label from spanning the
    // page; it combines a reading cap with the space actually available.
    expect(SRC).toMatch(/MAX_POPUP_WIDTH\s*=\s*\d+/);
    expect(SRC).toMatch(/maxWidth/);
    expect(SRC).toContain("92vw");
  });

  it("measures the room it has, in both text directions", () => {
    // The popup grows towards the end edge, which is the left in RTL, so the
    // measurement has to be direction aware or RTL dropdowns run off-screen.
    expect(SRC).toContain('dir === "rtl"');
    expect(SRC).toMatch(/useI18n/);
  });

  it("gives every native select an explicit width", () => {
    // Native <select> popups are sized by the browser, so the closed control is
    // all we control — left alone it falls back to the browser's ~100px default
    // and clips the selected value. Either a width or a minimum width is fine:
    // a select next to a search box wants a floor, one in a grid wants w-full.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".tsx")) {
          const s = fs.readFileSync(p, "utf8");
          let i = 0;
          while ((i = s.indexOf("<select", i)) !== -1) {
            let j = i;
            let depth = 0;
            for (; j < s.length; j++) {
              if (s[j] === "{") depth++;
              else if (s[j] === "}") depth--;
              else if (s[j] === ">" && depth === 0) break;
            }
            const tag = s.slice(i, j + 1);
            const raw = tag.match(/className=(\{[^}]*\}|"[^"]*")/)?.[1] ?? "";
            // `className={inputClass}` resolves against a constant in the same
            // file, so follow it there rather than assuming it is a literal.
            let cls = raw;
            const variable = /^\{(\w+)\}$/.exec(raw)?.[1];
            if (variable) {
              cls = s.match(new RegExp(`(?:const|let)\\s+${variable}\\s*=\\s*"([^"]*)"`))?.[1] ?? "";
            }
            if (!/\b(?:min-)?w-/.test(cls)) {
              const line = s.slice(0, i).split("\n").length;
              offenders.push(`${p.replace(/\\/g, "/")}:${line} ${cls || "(no class)"}`);
            }
            i = j + 1;
          }
        }
      }
    };
    walk(path.join(ROOT, "src"));

    expect(offenders, "native selects need an explicit width or min-width").toEqual([]);
  });
});
