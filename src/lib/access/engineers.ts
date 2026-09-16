import { engineerKey } from "./normalize";

// Canonical engineer directory built from the Access database:
//  - 24 full records from [اسماء المهندسين] (with phone + national id)
//  - short-name-only technicians that appear in العملاء / الصيانة الدورية
//    (no master record in Access — seeded as name-only engineers)
// Email slug is ASCII so it is a valid login email:
//   eng-<slug>@alex-copier.com

export interface EngineerSeed {
  /** Display name (full name when known, otherwise the short name). */
  name: string;
  shortName: string;
  slug: string;
  phone: string | null;
  nationalId: string | null;
}

interface EngineerDef {
  name: string;
  slug: string;
  phone?: string;
  nationalId?: string;
  aliases?: string[];
}

function def(
  shortName: string,
  name: string,
  slug: string,
  phone?: string,
  nationalId?: string,
  aliases: string[] = [],
): [string, EngineerDef] {
  return [shortName, { name, slug, phone, nationalId, aliases }];
}

// NOTE: "يحيي" also matches يحيى عرفة (ID 13) and "عرفة" also matches
// يحيى عرفة — mapped to the first-name owners below; flagged in the
// migration report for the business to confirm.
const ENGINEERS: Record<string, EngineerDef> = Object.fromEntries([
  def("شعبان", "محمد شعبان خلف علام", "shaaban", "01206454561", "28811210201517"),
  def("مجدى", "عبد الرحمن مجدى يونس", "magdy", "01207621181", "29708130201531", ["مجدي"]),
  def("ايمن", "ايمن ابو زيد", "ayman", "01211667313", undefined),
  def("طارق", "محمد طارق محمد محمود", "tarek", "01206369330", "29312250202378"),
  def("كريم", "كريم نصر ابو الفتوح العوضي محمد", "karim"),
  def("اسامة", "اسامة عز العرب", "osama", "01280422990", undefined, ["احمد اسامه"]),
  def("رضا", "احمد رضا", "reda", "01273086919", "30305120200577", ["احمد رضا"]),
  def("السيد", "احمد السيد متولى محمد احمد", "elsayed", "01202672775", "30609300203719"),
  def("عادل", "عادل عبد الستار شعبان", "adel", "01204426315", "29712151802311"),
  def("رحيم", "احمد رحيم", "rahim", "01287136719", undefined, ["احمد رحيم"]),
  def("يحيي", "محمد يحيى", "yehia", "01013039705", undefined, ["يحى"]),
  def("يوسف", "يوسف", "youssef"),
  def("تمام", "محمد ابراهيم تمام", "tamam", "01024685065", "28612020200911"),
  def("وسام", "وسام", "wessam"),
  def("مصطفى", "مصطفى", "mostafa"),
  def("الزهري", "محمد الزهرى", "elzahry", "01220468621", "2881020201871", ["الزهرى"]),
  def("مصعب", "مصعب", "mosab"),
  def("مروان", "مروان ماجد محمد احمد", "marwan", undefined, "30508030201335", ["مروان العجمي"]),
  def("حسام", "حسام", "hossam"),
  def("ياسين", "ياسين", "yassin"),
  def("نوبى", "نوبى", "nouby"),
  def("سيف", "سيف الدين خالد على عبد الله", "seif", "01271742995", "29906010203811"),
  def("تامر", "تامر", "tamer"),
  def("اسماعيل", "اسماعيل", "ismail"),
  def("عرفة", "عبد الرحمن عرفة على درويش", "arafa", "01280519085", "30105290201595", ["عرفه"]),
  def("معتز", "معتز", "motaz"),
  def("الرومى", "الرومى", "elroumy"),
  def("محمد", "محمد", "mohamed"),
  def("ابو العباس", "ابو العباس", "abolabbas"),
  def("خالد", "خالد", "khaled"),
  def("وائل", "وائل", "wael"),
  def("عبدة", "عبدة", "abdo", undefined, undefined, ["محمد عبدة"]),
  def("رجب", "رجب", "ragab"),
  def("حسن", "حسن", "hassan"),
  def("علاء", "علاء", "alaa"),
  def("ياسر", "ياسر", "yasser"),
  def("طومان", "طومان", "tawman"),
  def("محمود", "محمود", "mahmoud"),
  def("المحاسب", "المحاسب عبد الرحمن محمد على عرفه", "mohaseb", "01207591150", "29210280200755"),
]);

const ALIAS_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [shortName, d] of Object.entries(ENGINEERS)) {
    m.set(engineerKey(shortName), shortName);
    for (const a of d.aliases ?? []) m.set(engineerKey(a), shortName);
  }
  return m;
})();

// Garbage/unknown tokens observed in the data — never create engineers for these.
const IGNORE = new Set(["ض", "l"]);

export function resolveEngineer(raw: string | null | undefined): EngineerSeed | null {
  const key = engineerKey(raw);
  if (!key || IGNORE.has(key)) return null;
  const shortName = ALIAS_INDEX.get(key);
  if (!shortName) return null;
  const d = ENGINEERS[shortName];
  return {
    name: d.name,
    shortName,
    slug: d.slug,
    phone: d.phone ?? null,
    nationalId: d.nationalId ?? null,
  };
}

export function engineerEmail(slug: string): string {
  return `eng-${slug}@alex-copier.com`;
}

export function allEngineerShortNames(): string[] {
  return Object.keys(ENGINEERS);
}
