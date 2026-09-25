/**
 * HTML escaping for the printable templates (invoice, receipt, statements).
 *
 * Every value interpolated into those documents comes from user input —
 * product names, customer names, invoice notes, serials — so it must be
 * escaped or a single crafted name turns the print view into a script
 * runner (stored XSS). Escaping here keeps the rule in one place instead
 * of relying on every template remembering it.
 */

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_RE = /[&<>"']/g;

/** Escapes a value for interpolation into HTML text or a quoted attribute. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(HTML_ESCAPE_RE, (ch) => HTML_ENTITIES[ch] ?? ch);
}
