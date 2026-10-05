import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "src", "components", "SearchableSelect.tsx"), "utf8");

/** The element that actually carries the popup markup. */
const popup = SRC.match(/const dropdown = [\s\S]*?document\.body/)?.[0] ?? "";
/** The combobox trigger, from its id up to the end of its opening tag. */
const combobox = SRC.match(/<div\s+id=\{inputId\}[\s\S]*?role="combobox"[\s\S]*?>/)?.[0] ?? "";
/** The scrollable option list. */
const listbox = SRC.match(/<div\s+ref=\{listRef\}[\s\S]*?role="listbox"[\s\S]*?>/)?.[0] ?? "";

/**
 * The custom select is used by FilterSelect (every filter toolbar) and by
 * SelectWithAdd (every quick-add field), so its popup is what most dropdowns in
 * the app actually look like.
 *
 * It used to be `w-full` — pinned to the trigger — while every option label was
 * `truncate`, so a popup holding long Arabic company/product names showed a
 * handful of clipped characters per row. Sizing is now done by Floating UI's
 * `size()` middleware rather than by Tailwind width classes, because the popup
 * is rendered in a portal: once it leaves the trigger's subtree, percentage
 * widths such as `w-full` or `min-w-full` resolve against the body instead of
 * the control and no longer mean anything useful.
 */
describe("SearchableSelect popup width", () => {
  it("escapes the trigger's subtree so ancestor overflow cannot clip it", () => {
    // The popup is portalled and positioned with `strategy: "fixed"`, which is
    // what makes it independent of any `overflow-hidden` ancestor (table cell,
    // modal body, filter bar) the trigger happens to sit inside.
    expect(SRC).toMatch(/createPortal\(/);
    expect(popup, "could not find the portalled popup").toContain("document.body");
    expect(SRC).toContain('strategy: "fixed"');
  });

  it("sizes the popup from the space available, not the trigger width", () => {
    // The width is the larger of the trigger and the room on screen, capped so
    // a single long label cannot stretch the popup across the page.
    const sizing = SRC.match(/size\(\{[\s\S]*?\}\),/)?.[0] ?? "";
    expect(sizing, "could not find the size() middleware").toBeTruthy();
    expect(sizing).toMatch(/availableWidth/);
    expect(sizing).toMatch(/Math\.max\(refWidth,\s*Math\.min\(availableWidth,\s*\d+\)\)/);
    // Padding keeps the popup off the viewport edge when it does hit the cap.
    expect(sizing).toMatch(/padding:\s*8/);
  });

  it("caps the height and leaves room for the scrollbar", () => {
    // A long option list must scroll rather than run off the bottom of the
    // viewport, so the height is bounded and the list carries its own overflow.
    expect(SRC).toMatch(/maxHeight: `\$\{Math\.min\(availableHeight,\s*\d+\)\}px`/);
    expect(listbox, "could not find the listbox").toContain("overflow-y-auto");
  });

  it("measures the room it has, in both text directions", () => {
    // The popup grows towards the end edge, which is the left in RTL, so the
    // measurement has to be direction aware or RTL dropdowns run off-screen.
    expect(SRC).toContain('dir === "rtl"');
    expect(SRC).toMatch(/placement: dir === "rtl" \? "bottom-end" : "bottom-start"/);
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

/**
 * A `role="combobox"` that is not linked to its listbox is announced by a screen
 * reader as an input with no popup attached, so the user never hears the options.
 * The association is aria-controls on the combobox pointing at the listbox id,
 * which is why both sides have to be checked together.
 */
describe("SearchableSelect accessibility", () => {
  it("has a combobox and a listbox to link", () => {
    expect(combobox, "could not find the combobox").toBeTruthy();
    expect(listbox, "could not find the listbox").toBeTruthy();
  });

  it("points the combobox at the listbox", () => {
    // aria-expanded alone does not associate the two; without aria-controls the
    // popup is orphaned from the control that opens it.
    expect(combobox).toMatch(/aria-expanded=\{open\}/);
    expect(combobox).toContain("aria-controls={`${inputId}-listbox`}");
    expect(listbox).toContain('id={`${inputId}-listbox`}');
  });

  it("labels the listbox from the control that opens it", () => {
    expect(listbox).toContain("aria-labelledby={inputId}");
  });

  it("announces the popup as a listbox of options", () => {
    // The portalled popup still has to expose the listbox semantics, otherwise
    // moving it out of the trigger's subtree silently drops it from the a11y tree.
    expect(popup).toContain('role="listbox"');
    expect(SRC).toContain('role="option"');
  });
});
