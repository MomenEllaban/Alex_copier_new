// Manufacturer + color inference for legacy machine model strings. Heuristics
// tuned on the 483 observed Access variants — documented, not exact science.

const MANUFACTURERS: Array<{ test: RegExp; name: string }> = [
  { test: /^(KY|FS|ECOSYS|M\s?\d|P[-\s]?\d|TASKALFA)/i, name: "Kyocera" },
  { test: /^(MP|MPC|SP|DSM|SG|MPF)/i, name: "Ricoh" },
  { test: /^(WF-?C|C\d|EPSON)/i, name: "Epson" },
  { test: /^(HP|LASERJET)/i, name: "HP" },
  { test: /^LEX/i, name: "Lexmark" },
  { test: /^(OX|XEROX|VERSA|WORKCENTRE|ALTALINK)/i, name: "Xerox" },
  { test: /^(CANON|IR[-\s]|IMAGERUNNER)/i, name: "Canon" },
  { test: /^(KONICA|BIZHUB)/i, name: "Konica Minolta" },
  { test: /^(SHARP|MX[-\s])/i, name: "Sharp" },
  { test: /^(SAMSUNG|PROXPRESS|MULTIXPRESS)/i, name: "Samsung" },
  { test: /^(TOSHIBA|ESTUDIO)/i, name: "Toshiba" },
];

export function inferManufacturer(model: string | null | undefined): string | null {
  if (!model) return null;
  const m = model.trim();
  if (!m) return null;
  for (const { test, name } of MANUFACTURERS) {
    if (test.test(m)) return name;
  }
  return null;
}

const COLOR_HINT = /^(MPC|MFP|SP\s?C|WF-?C|C\d)|CI$/i;

/** True when there is any color-counter evidence or a color model hint. */
export function inferIsColor(
  model: string | null | undefined,
  hasColorCounter: boolean,
): boolean {
  if (hasColorCounter) return true;
  if (!model) return false;
  return COLOR_HINT.test(model.trim());
}
