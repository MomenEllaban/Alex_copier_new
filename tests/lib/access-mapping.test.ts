import { describe, it, expect } from "vitest";
import { normalizeArabicName, normalizeModel, normalizeCustomerName } from "@/lib/access/normalize";
import { resolveEngineer, engineerEmail } from "@/lib/access/engineers";
import { mapContractType } from "@/lib/access/contracts";
import { extractMoney } from "@/lib/access/money";
import { parseAccessDate, parseAccessInt, normalizeAccessPhone } from "@/lib/access/dates-phones";
import { inferManufacturer, inferIsColor } from "@/lib/access/machines";

describe("access normalize", () => {
  it("unifies alef/hamza, teh-marbuta and alef-maqsura", () => {
    expect(normalizeArabicName("أحمد")).toBe("احمد");
    expect(normalizeArabicName("عرفة")).toBe("عرفه");
    expect(normalizeArabicName("مجدى")).toBe("مجدي");
    expect(normalizeArabicName("  شركة  النور  ")).toBe("شركه النور");
  });
  it("normalizes machine models for grouping", () => {
    expect(normalizeModel("MP 301")).toBe("MP301");
    expect(normalizeModel("mpc305")).toBe("MPC305");
    expect(normalizeModel("KY3252 ci")).toBe("KY3252CI");
  });
  it("trims customer names without touching inner letters", () => {
    expect(normalizeCustomerName(" شركة النور للشحن والتفريغ ")).toBe("شركة النور للشحن والتفريغ");
  });
});

describe("access engineers", () => {
  it("resolves full-record nicknames", () => {
    expect(resolveEngineer("شعبان")?.name).toBe("محمد شعبان خلف علام");
    expect(resolveEngineer("السيد")?.phone).toBe("01202672775");
    expect(resolveEngineer("رضا")?.nationalId).toBe("30305120200577");
  });
  it("resolves aliases and spelling variants", () => {
    expect(resolveEngineer("مجدي")?.shortName).toBe("مجدى");
    expect(resolveEngineer("عرفه")?.shortName).toBe("عرفة");
    expect(resolveEngineer("الزهرى")?.shortName).toBe("الزهري");
    expect(resolveEngineer("احمد اسامه")?.shortName).toBe("اسامة");
    expect(resolveEngineer("مروان العجمي")?.shortName).toBe("مروان");
    expect(resolveEngineer(" حسام ")?.shortName).toBe("حسام");
  });
  it("resolves name-only technicians", () => {
    expect(resolveEngineer("وائل")?.name).toBe("وائل");
    expect(resolveEngineer("عبدة")?.phone).toBeNull();
  });
  it("rejects garbage tokens and unknowns", () => {
    expect(resolveEngineer("ض")).toBeNull();
    expect(resolveEngineer("l")).toBeNull();
    expect(resolveEngineer("رحمة")).toBeNull();
    expect(resolveEngineer(null)).toBeNull();
    expect(resolveEngineer("")).toBeNull();
  });
  it("builds login emails", () => {
    expect(engineerEmail("shaaban")).toBe("eng-shaaban@alex-copier.com");
  });
});

describe("access contracts", () => {
  it("maps the six Access contract kinds", () => {
    expect(mapContractType("زيارة").type).toBe("VISIT");
    expect(mapContractType("ايجار").type).toBe("RENTAL");
    expect(mapContractType("ارشيف").type).toBe("ARCHIVE");
    expect(mapContractType("صيانة").type).toBe("MAINTENANCE");
    expect(mapContractType("ضمان").type).toBe("WARRANTY");
    expect(mapContractType("مطلوب عقد").type).toBe("CONTRACT_REQUIRED");
  });
  it("flags the هله typo and empty values", () => {
    const typo = mapContractType("هله");
    expect(typo.type).toBe("VISIT");
    expect(typo.flagged).toBe(true);
    expect(mapContractType(null).type).toBe("CONTRACT_REQUIRED");
  });
});

describe("access money", () => {
  it("extracts visit-fee and account amounts", () => {
    expect(extractMoney("الزيارة 150 جنية")).toEqual({ amount: 150, rest: "" });
    expect(extractMoney("500 جنية")).toEqual({ amount: 500, rest: "" });
    expect(extractMoney("الحساب 250 جنية")).toEqual({ amount: 250, rest: "" });
    expect(extractMoney("250 زيارة")).toEqual({ amount: 250, rest: "" });
    expect(extractMoney("2000 جنية")).toEqual({ amount: 2000, rest: "" });
  });
  it("keeps non-money spare-part text untouched", () => {
    expect(extractMoney("الالة تحتاج حبر")).toBeNull();
    expect(extractMoney("الورشة")).toBeNull();
    expect(extractMoney("كريم")).toBeNull();
    expect(extractMoney("(10000) نسخة")).toBeNull();
    expect(extractMoney(null)).toBeNull();
  });
});

describe("access dates and phones", () => {
  it("parses Access datetime strings", () => {
    const d = parseAccessDate("12/30/2026 12:00:00 AM");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(11);
  });
  it("rejects typos and out-of-range years", () => {
    expect(parseAccessDate("12/16/0223 12:00:00 AM")).toBeNull();
    expect(parseAccessDate("8/25/1025 12:00:00 AM")).toBeNull();
    expect(parseAccessDate(null)).toBeNull();
    expect(parseAccessDate("")).toBeNull();
  });
  it("parses ints and restores leading zero on phones", () => {
    expect(parseAccessInt("285152")).toBe(285152);
    expect(parseAccessInt("")).toBeNull();
    expect(normalizeAccessPhone(1202672775)).toBe("01202672775");
    expect(normalizeAccessPhone("01204344446")).toBe("01204344446");
    expect(normalizeAccessPhone(null)).toBeNull();
  });
});

describe("access machines", () => {
  it("infers manufacturers from model prefixes", () => {
    expect(inferManufacturer("KY3253CI")).toBe("Kyocera");
    expect(inferManufacturer("MP301")).toBe("Ricoh");
    expect(inferManufacturer("SP4310")).toBe("Ricoh");
    expect(inferManufacturer("WFC5790")).toBe("Epson");
    expect(inferManufacturer("HP2035")).toBe("HP");
    expect(inferManufacturer("LEXMARK")).toBe("Lexmark");
    expect(inferManufacturer("NoT DEFINED")).toBeNull();
  });
  it("infers color from counters or model hints", () => {
    expect(inferIsColor("MP301", false)).toBe(false);
    expect(inferIsColor("MP301", true)).toBe(true);
    expect(inferIsColor("MPC300", false)).toBe(true);
    expect(inferIsColor("KY3253CI", false)).toBe(true);
    expect(inferIsColor(null, false)).toBe(false);
  });
});
