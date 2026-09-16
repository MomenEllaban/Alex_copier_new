// Extract collected-cash amounts from Access free-text columns.
// Money patterns observed in [قطع الغيار المطوبة] / [الحساب]:
//   "500 جنية" | "الزيارة 150 جنية" | "الحساب 250 جنية" | "250 زيارة" | "2000 جنية"
// Copy-limit patterns like "(10000) نسخة" are NOT money and never match.

const AR_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => AR_DIGITS[d]);
}

function parseNumber(raw: string): number | null {
  const n = Number(toLatinDigits(raw).replace(/[,،\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface ExtractedMoney {
  amount: number;
  /** Original text minus the money fragment (trimmed, "" when nothing remains). */
  rest: string;
}

export function extractMoney(raw: string | null | undefined): ExtractedMoney | null {
  if (raw == null) return null;
  const text = toLatinDigits(raw).trim();
  if (!text) return null;

  const patterns = [
    /(الزيارة|الحساب|زياره|حساب)\s+(\d[\d,]*)\s*(جنيه|جنية|ج\.?م?\.?)/,
    /(\d[\d,]*)\s*(جنيه|جنية|ج\.?م?\.?)/,
    /(\d[\d,]*)\s*(زيارة|زياره)/,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const numGroups = m.slice(1).filter((g) => /^[\d,]+$/.test(g.trim()));
    const amount = numGroups.length > 0 ? parseNumber(numGroups[numGroups.length - 1]) : null;
    if (amount == null) continue;
    const rest = text.replace(m[0], " ").replace(/\s+/g, " ").trim();
    return { amount, rest };
  }
  return null;
}
