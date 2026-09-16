// Access legacy seeder — migrates the real Alex Copier Access database
// (exported to access-export/*.csv) into the ERP: engineers + accounts,
// customers (+engineer link), machines (+delivery counters), contracts,
// maintenance history as copier tests, collected cash as settlements with
// accountant notifications.
//
// Rerun-safe: seeded rows use deterministic ids / numbers and are replaced
// on every run. Never truncates non-seeded data.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseCsv } from "../src/lib/csv";
import { generateStatementToken } from "../src/lib/statement-token";
import { normalizeCustomerName, normalizeSerial } from "../src/lib/access/normalize";
import { resolveEngineer, engineerEmail, allEngineerShortNames } from "../src/lib/access/engineers";
import { mapContractType, type AccessContractType } from "../src/lib/access/contracts";
import { extractMoney } from "../src/lib/access/money";
import { parseAccessDate, parseAccessInt } from "../src/lib/access/dates-phones";
import { inferManufacturer, inferIsColor } from "../src/lib/access/machines";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const EXPORT_DIR = path.join(__dirname, "..", "access-export");
const TODAY = new Date();
const ADD_YEAR_MS = 365 * 24 * 3600 * 1000;

type Row = Record<string, string>;

function loadCsv(file: string): Row[] {
  const text = fs.readFileSync(path.join(EXPORT_DIR, file), "utf8");
  const grid = parseCsv(text);
  const [header, ...lines] = grid;
  return lines
    .filter((l) => l.some((c) => c.trim() !== ""))
    .map((l) => Object.fromEntries(header.map((h, i) => [h, (l[i] ?? "").trim()])));
}

const val = (r: Row, k: string): string | null => {
  const v = (r[k] ?? "").trim();
  return v === "" ? null : v;
};

async function chunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<unknown>, label: string) {
  for (let i = 0; i < rows.length; i += size) {
    await fn(rows.slice(i, i + size));
    if ((i / size) % 10 === 0) console.log(`  ${label}: ${Math.min(i + size, rows.length)}/${rows.length}`);
  }
}

async function main() {
  console.log("Loading Access CSV exports...");
  const customersCsv = loadCsv("01-العملاء.csv");
  const maintenanceCsv = loadCsv("02-الصيانة-الدورية.csv");
  const printerCustomersCsv = loadCsv("04-عملاء-البرنترات.csv");
  const printerMaintenanceCsv = loadCsv("05-صيانة-البرنترات.csv");
  console.log(
    `  customers=${customersCsv.length} maintenance=${maintenanceCsv.length} ` +
      `printerCustomers=${printerCustomersCsv.length} printerMaintenance=${printerMaintenanceCsv.length}`,
  );

  // ── 0. Base records ──────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("password123", 10);
  let company = await prisma.company.findFirst({ where: { name: "اليكس كوبير" } });
  if (!company) {
    company = await prisma.company.create({
      data: { id: "company-alex", name: "اليكس كوبير", nameAr: "اليكس كوبير" },
    });
  }
  const gm = await prisma.user.upsert({
    where: { email: "reza@alex-copier.com" },
    update: { isActive: true },
    create: { id: "user-reza", name: "رضا", email: "reza@alex-copier.com", passwordHash, role: "GENERAL_MANAGER", companyId: company.id },
  });
  await prisma.user.upsert({
    where: { email: "accountant@alex-copier.com" },
    update: { isActive: true },
    create: { id: "user-accountant", name: "المحاسب", email: "accountant@alex-copier.com", passwordHash, role: "ACCOUNTANT", companyId: company.id },
  });
  console.log(`Base company=${company.id}`);

  // ── 1. Engineers + login accounts ────────────────────────────────
  console.log("Seeding engineers...");
  const engByShort = new Map<string, { id: string; userId: string; name: string }>();
  for (const shortName of allEngineerShortNames()) {
    const seed = resolveEngineer(shortName);
    if (!seed) continue;
    const email = engineerEmail(seed.slug);
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: seed.name, role: "ENGINEER", isActive: true },
      create: { name: seed.name, email, passwordHash, role: "ENGINEER" },
    });
    let eng = await prisma.engineer.findFirst({ where: { name: seed.name } });
    if (!eng) {
      eng = await prisma.engineer.create({
        data: { id: `eng-acc-${seed.slug}`, name: seed.name, phone: seed.phone, nationalId: seed.nationalId, email, userId: user.id },
      });
    } else if (!eng.userId) {
      eng = await prisma.engineer.update({ where: { id: eng.id }, data: { userId: user.id } });
    }
    engByShort.set(shortName, { id: eng.id, userId: user.id, name: eng.name });
  }
  console.log(`  engineers=${engByShort.size}`);

  // ── 2. Maintenance aggregates per chassis (first date, color) ────
  const firstMaintByChassis = new Map<string, Date>();
  const colorChassis = new Set<string>();
  let invalidMaintDates = 0;
  const unresolvedEngineers = new Set<string>();
  const trackMaintRow = (chassisRaw: string | null, dateRaw: string | null, colorRaw: string | null) => {
    const serial = chassisRaw ? normalizeSerial(chassisRaw) : "";
    if (!serial) return;
    const d = parseAccessDate(dateRaw);
    if (dateRaw && !d) invalidMaintDates++;
    if (d) {
      const prev = firstMaintByChassis.get(serial);
      if (!prev || d < prev) firstMaintByChassis.set(serial, d);
    }
    const c = parseAccessInt(colorRaw);
    if (c != null && c > 0) colorChassis.add(serial);
  };
  for (const r of maintenanceCsv) trackMaintRow(val(r, "رقم الشاسية"), val(r, "تاريخ الصيانة"), val(r, "عداد الوان"));
  for (const r of printerMaintenanceCsv) trackMaintRow(val(r, "رقم الشاسية"), val(r, "تاريخ الصيانة"), val(r, "عداد اللوان"));

  const resolveShort = (raw: string | null): string | null => {
    if (!raw) return null;
    const s = resolveEngineer(raw);
    if (!s) {
      if (raw.trim() !== "") unresolvedEngineers.add(raw.trim());
      return null;
    }
    return s.shortName;
  };

  // ── 3. Merge customers by name ───────────────────────────────────
  interface CustRow {
    chassis: string;
    model: string | null;
    engShort: string | null;
    type: AccessContractType;
    typeFlagged: boolean;
    endDate: Date | null;
    deliveryBlack: number | null;
    deliveryColor: number | null;
    isPrinter: boolean;
    deliveryDate: Date | null;
  }
  interface CustAgg {
    key: string;
    name: string;
    seq: number;
    phone: string | null;
    address: string | null;
    notes: string[];
    votes: Map<string, number>;
    rows: CustRow[];
    hasPrinter: boolean;
    hasCopier: boolean;
  }
  const aggs = new Map<string, CustAgg>();
  const getAgg = (rawName: string): CustAgg | null => {
    const key = normalizeCustomerName(rawName);
    if (!key) return null;
    let a = aggs.get(key);
    if (!a) {
      a = { key, name: rawName.trim(), seq: 0, phone: null, address: null, notes: [], votes: new Map(), rows: [], hasPrinter: false, hasCopier: false };
      aggs.set(key, a);
    }
    return a;
  };
  let halaCount = 0;
  for (const r of customersCsv) {
    const a = getAgg(r["اسم العميل"]);
    if (!a) continue;
    a.hasCopier = true;
    const mapped = mapContractType(val(r, "نوع العقد"));
    if (mapped.flagged && val(r, "نوع العقد")) halaCount++;
    const eng = resolveShort(val(r, "اسم المهندس"));
    if (eng) a.votes.set(eng, (a.votes.get(eng) ?? 0) + 1);
    if (!a.phone) a.phone = val(r, "التليفون");
    if (!a.address) a.address = val(r, "العنوان");
    const note = val(r, "ملاحظات");
    if (note && !a.notes.includes(note)) a.notes.push(note);
    const f1 = val(r, "Field1");
    if (f1 && !a.notes.includes(`[Field1: ${f1}]`)) a.notes.push(`[Field1: ${f1}]`);
    a.rows.push({
      chassis: normalizeSerial(val(r, "رقم الشاسية") ?? ""),
      model: val(r, "نوع الالة"),
      engShort: eng,
      type: mapped.type,
      typeFlagged: mapped.flagged,
      endDate: parseAccessDate(val(r, "تاريخ انتهاء العقد")),
      deliveryBlack: parseAccessInt(val(r, "عداد تسليم اسود")),
      deliveryColor: parseAccessInt(val(r, "عداد تسليم الوان")),
      isPrinter: false,
      deliveryDate: null,
    });
  }
  for (const r of printerCustomersCsv) {
    const a = getAgg(r["اسم العميل"]);
    if (!a) continue;
    a.hasPrinter = true;
    const eng = resolveShort(val(r, "اسم المهندس"));
    if (eng) a.votes.set(eng, (a.votes.get(eng) ?? 0) + 1);
    if (!a.phone) {
      const t = val(r, "التليفون");
      a.phone = t && /^\d+$/.test(t) ? `0${t}` : t;
    }
    if (!a.address) a.address = val(r, "العنوان");
    const note = val(r, "ملاحظات");
    if (note && !a.notes.includes(note)) a.notes.push(note);
    a.rows.push({
      chassis: normalizeSerial(val(r, "رقم الشاسية") ?? ""),
      model: val(r, "نوع الالة"),
      engShort: eng,
      type: "VISIT",
      typeFlagged: false,
      endDate: null,
      deliveryBlack: parseAccessInt(val(r, "عداد تسليم اسود")),
      deliveryColor: parseAccessInt(val(r, "عداد تسليم اللون")),
      isPrinter: true,
      deliveryDate: parseAccessDate(val(r, "التاريخ التسليم")),
    });
  }

  const sortedAggs = [...aggs.values()].sort((a, b) => a.key.localeCompare(b.key, "ar"));
  sortedAggs.forEach((a, i) => { a.seq = i + 1; });
  const mixedNames = sortedAggs.filter((a) => a.hasCopier && a.hasPrinter).length;
  console.log(`  merged customers=${sortedAggs.length} (copier+printer mixed names=${mixedNames}, هله rows=${halaCount})`);

  console.log("Creating customers...");
  const custIdByKey = new Map<string, string>();
  const custSeqByKey = new Map<string, number>();
  const custEngByKey = new Map<string, string | null>();
  for (const a of sortedAggs) {
    const id = `accc-${a.seq}`;
    let topEng: string | null = null;
    let topVotes = 0;
    for (const [sn, v] of a.votes) if (v > topVotes) { topVotes = v; topEng = sn; }
    const engineerId = topEng ? engByShort.get(topEng)?.id ?? null : null;
    const notes = a.notes.join(" | ").slice(0, 2000) || null;
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (existing) {
      await prisma.customer.update({ where: { id }, data: { name: a.name, phone: a.phone, address: a.address, notes, engineerId } });
    } else {
      await prisma.customer.create({
        data: { id, name: a.name, phone: a.phone, address: a.address, notes, engineerId, statementToken: generateStatementToken() },
      });
    }
    custIdByKey.set(a.key, id);
    custSeqByKey.set(a.key, a.seq);
    custEngByKey.set(a.key, engineerId);
  }

  // ── 4. Machines ──────────────────────────────────────────────────
  console.log("Seeding machines...");
  const copierSerials = new Set(customersCsv.map((r) => normalizeSerial(val(r, "رقم الشاسية") ?? "")).filter(Boolean));
  const machineIdBySerial = new Map<string, string>();
  const machineCustomerBySerial = new Map<string, string>();
  const machineFirstDate = new Map<string, Date>();
  const historyRows: Prisma.MachineOwnerHistoryCreateManyInput[] = [];
  let prnCount = 0;
  // Resume the deterministic counter past existing seeded machines (rerun-safe).
  const existingMachIds = await prisma.machine.findMany({ where: { id: { startsWith: "accm-" } }, select: { id: true } });
  let machSeq = existingMachIds.reduce((m, r) => {
    const n = Number(r.id.replace("accm-", ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  for (const a of sortedAggs) {
    const customerId = custIdByKey.get(a.key)!;
    for (const row of a.rows) {
      if (!row.chassis) continue;
      let serial = row.chassis;
      let notes: string | null = null;
      if (row.isPrinter) {
        if (copierSerials.has(row.chassis)) { serial = `PRN-${row.chassis}`; prnCount++; }
        notes = `برنتر — الشاسية الأصلي: ${row.chassis}`;
      }
      const firstDate = firstMaintByChassis.get(row.chassis) ?? row.deliveryDate ?? undefined;
      const isColor = inferIsColor(row.model, colorChassis.has(row.chassis));
      const status = row.type === "RENTAL" ? "RENTED" : "SOLD";
      const data = {
        serialNumber: serial,
        manufacturer: inferManufacturer(row.model),
        model: row.model,
        isColor,
        currentStatus: status as "RENTED" | "SOLD",
        currentOwnerId: customerId,
        deliveryBlack: row.deliveryBlack,
        deliveryColor: row.deliveryColor,
        isPrinter: row.isPrinter,
        notes,
      };
      let mach = await prisma.machine.findUnique({ where: { serialNumber: serial } });
      if (mach) {
        mach = await prisma.machine.update({ where: { id: mach.id }, data });
      } else {
        machSeq++;
        mach = await prisma.machine.create({ data: { id: `accm-${machSeq}`, ...data } });
      }
      machineIdBySerial.set(serial, mach.id);
      machineCustomerBySerial.set(serial, customerId);
      if (firstDate) machineFirstDate.set(serial, firstDate);
      historyRows.push({
        machineId: mach.id,
        transactionType: status === "RENTED" ? "RENTAL" : "SALE",
        customerId,
        companyId: company.id,
        date: firstDate ?? new Date("2022-01-01"),
        notes: "ترحيل تاريخي من الأكسس",
      });
    }
  }
  console.log(`  machines=${machineIdBySerial.size} (PRN-prefixed=${prnCount})`);
  await prisma.machineOwnerHistory.deleteMany({ where: { notes: "ترحيل تاريخي من الأكسس" } });
  await chunked(historyRows, 1000, (b) => prisma.machineOwnerHistory.createMany({ data: b }), "owner history");

  // ── 5. Contracts per (customer × type) ───────────────────────────
  console.log("Seeding contracts...");
  await prisma.contract.deleteMany({ where: { contractNumber: { startsWith: "ACC-" } } });
  interface CGroup { customerId: string; seq: number; type: AccessContractType; ends: Date[]; serials: string[]; }
  const groups = new Map<string, CGroup>();
  for (const a of sortedAggs) {
    const customerId = custIdByKey.get(a.key)!;
    for (const row of a.rows) {
      if (row.isPrinter || !row.chassis) continue;
      const serial = row.chassis;
      if (!machineIdBySerial.has(serial)) continue;
      const gkey = `${customerId}|${row.type}`;
      let g = groups.get(gkey);
      if (!g) { g = { customerId, seq: a.seq, type: row.type, ends: [], serials: [] }; groups.set(gkey, g); }
      if (row.endDate) g.ends.push(row.endDate);
      g.serials.push(serial);
    }
  }
  const contractRows: Prisma.ContractCreateManyInput[] = [];
  const linkRows: Prisma.ContractMachineCreateManyInput[] = [];
  for (const g of groups.values()) {
    const endMax = g.ends.length ? new Date(Math.max(...g.ends.map((d) => d.getTime()))) : null;
    const starts = g.serials.map((s) => machineFirstDate.get(s)).filter((d): d is Date => !!d);
    const startMin = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
    const start = startMin ?? (endMax ? new Date(endMax.getTime() - ADD_YEAR_MS) : new Date("2022-01-01"));
    const end = endMax ?? new Date(start.getTime() + ADD_YEAR_MS);
    const number = `ACC-${String(g.seq).padStart(4, "0")}-${g.type}`;
    const contractId = `acc-${number}`;
    contractRows.push({
      id: contractId,
      contractNumber: number,
      customerId: g.customerId,
      contractType: g.type,
      status: end >= TODAY ? "ACTIVE" : "EXPIRED",
      startDate: start,
      endDate: end,
      value: 0,
      billingCycle: "YEARLY",
      notes: "ترحيل تاريخي من الأكسس",
    });
    for (const s of new Set(g.serials)) linkRows.push({ contractId, machineId: machineIdBySerial.get(s)! });
  }
  await chunked(contractRows, 1000, (b) => prisma.contract.createMany({ data: b }), "contracts");
  await chunked(linkRows, 1000, (b) => prisma.contractMachine.createMany({ data: b }), "contract machines");
  console.log(`  contracts=${contractRows.length} links=${linkRows.length}`);

  // ── 6. Copier tests (maintenance history) ────────────────────────
  console.log("Seeding copier tests...");
  await prisma.copierTest.deleteMany({ where: { id: { startsWith: "acct-" } } });
  const testRows: Prisma.CopierTestCreateManyInput[] = [];
  let skippedNoChassis = 0;
  let moneyTests = 0;
  for (const r of maintenanceCsv) {
    const serial = normalizeSerial(val(r, "رقم الشاسية") ?? "");
    const machineId = machineIdBySerial.get(serial);
    if (!serial || !machineId) { skippedNoChassis++; continue; }
    const customerId = machineCustomerBySerial.get(serial)!;
    const engShort = resolveShort(val(r, "المهندس"));
    const engineerId = engShort ? engByShort.get(engShort)?.id ?? null : null;
    const black = parseAccessInt(val(r, "عداد اسود"));
    const color = parseAccessInt(val(r, "عداد الوان"));
    const partsRaw = val(r, "قطع الغيار المطوبة");
    const money = extractMoney(partsRaw);
    if (money) moneyTests++;
    const bayan = val(r, "بيان الاصلاح");
    const f1 = val(r, "Field1");
    const testDate = parseAccessDate(val(r, "تاريخ الصيانة"));
    testRows.push({
      id: `acct-${val(r, "IDكودالصيانة")}`,
      customerId,
      engineerId,
      machineId,
      pageCount: black ?? 0,
      blackCounter: black,
      colorCounter: color,
      repairStatement: bayan,
      spareParts: money ? money.rest || null : partsRaw,
      collectedAmount: money?.amount ?? null,
      collectionNote: money ? partsRaw : null,
      notes: f1,
      testDate,
      createdAt: testDate ?? new Date(),
    });
  }
  await chunked(testRows, 1000, (b) => prisma.copierTest.createMany({ data: b }), "copier tests");
  console.log(`  tests=${testRows.length} withMoney=${moneyTests} skippedNoChassis=${skippedNoChassis}`);

  // ── 7. Printer tests ─────────────────────────────────────────────
  console.log("Seeding printer tests...");
  await prisma.copierTest.deleteMany({ where: { id: { startsWith: "accp-" } } });
  const printerTestRows: Prisma.CopierTestCreateManyInput[] = [];
  let printerPaid = 0;
  for (const r of printerMaintenanceCsv) {
    const rawSerial = normalizeSerial(val(r, "رقم الشاسية") ?? "");
    const serial = copierSerials.has(rawSerial) ? `PRN-${rawSerial}` : rawSerial;
    const machineId = machineIdBySerial.get(serial);
    if (!serial || !machineId) { skippedNoChassis++; continue; }
    const customerId = machineCustomerBySerial.get(serial)!;
    const engShort = resolveShort(val(r, "المهندس"));
    const engineerId = engShort ? engByShort.get(engShort)?.id ?? null : null;
    const black = parseAccessInt(val(r, "عداد اسود"));
    const color = parseAccessInt(val(r, "عداد اللوان"));
    const paidRaw = val(r, "الحساب");
    const paid = paidRaw != null ? Number(paidRaw) : null;
    const amount = paid != null && Number.isFinite(paid) && paid > 0 ? paid : null;
    if (amount) printerPaid++;
    const testDate = parseAccessDate(val(r, "تاريخ الصيانة"));
    printerTestRows.push({
      id: `accp-${val(r, "ID")}`,
      customerId,
      engineerId,
      machineId,
      pageCount: black ?? 0,
      blackCounter: black,
      colorCounter: color,
      repairStatement: val(r, "بيان الاصلاح"),
      collectedAmount: amount,
      collectionNote: amount ? `حساب مسجل بالأكسس: ${paidRaw}` : null,
      notes: val(r, "ملاحظات"),
      testDate,
      createdAt: testDate ?? new Date(),
    });
  }
  await chunked(printerTestRows, 1000, (b) => prisma.copierTest.createMany({ data: b }), "printer tests");
  console.log(`  printer tests=${printerTestRows.length} paid=${printerPaid}`);

  // ── 8. Settlements + accountant notifications ────────────────────
  console.log("Seeding settlements...");
  await prisma.settlement.deleteMany({ where: { settlementNumber: { startsWith: "ACC-STL-" } } });
  await prisma.notification.deleteMany({ where: { metadata: { path: ["seed"], equals: "access" } } });
  const financeUsers = await prisma.user.findMany({
    where: { role: { in: ["ACCOUNTANT", "GENERAL_MANAGER"] }, isActive: true },
    select: { id: true },
  });
  const allMoneyTests = [...testRows, ...printerTestRows].filter((t) => t.collectedAmount != null && t.collectedAmount > 0);
  const engUserByEngId = new Map<string, string>();
  for (const e of engByShort.values()) engUserByEngId.set(e.id, e.userId);
  const customerNameById = new Map<string, string>();
  for (const a of sortedAggs) customerNameById.set(custIdByKey.get(a.key)!, a.name);
  const engNameById = new Map<string, string>();
  for (const e of engByShort.values()) engNameById.set(e.id, e.name);
  const settlementRows: Prisma.SettlementCreateManyInput[] = allMoneyTests.map((t) => {
    const collector = (t.engineerId && engUserByEngId.get(t.engineerId)) || gm.id;
    return {
      id: `s-acc-${t.id}`,
      settlementNumber: `ACC-STL-${t.id}`,
      companyId: company.id,
      customerId: t.customerId,
      engineerId: t.engineerId,
      amount: t.collectedAmount!,
      paymentMethod: "CASH" as const,
      reason: `تحصيل تاريخي من الأكسس — ${t.collectionNote ?? ""}`.slice(0, 500),
      direction: "ADDITION" as const,
      status: "INITIAL" as const,
      collectedBy: collector,
      createdAt: t.testDate ?? new Date(),
    };
  });
  await chunked(settlementRows, 1000, (b) => prisma.settlement.createMany({ data: b }), "settlements");
  const notifRows: Prisma.NotificationCreateManyInput[] = [];
  for (const s of settlementRows) {
    const custName = customerNameById.get(s.customerId!) ?? "";
    const engName = (s.engineerId && engNameById.get(s.engineerId)) || "غير محدد";
    for (const u of financeUsers) {
      if (u.id === s.collectedBy) continue;
      notifRows.push({
        userId: u.id,
        title: "تحصيل تاريخي بانتظار المراجعة",
        message: `المهندس ${engName} حصّل ${s.amount} جنيه من العميل ${custName} — ${s.reason}`.slice(0, 500),
        type: "PAYMENT_PENDING" as const,
        category: "PAYMENT" as const,
        entityType: "Settlement",
        entityId: s.id,
        actionUrl: `/settlements?focus=${s.id}`,
        priority: "HIGH" as const,
        metadata: { seed: "access" },
      });
    }
  }
  await chunked(notifRows, 1000, (b) => prisma.notification.createMany({ data: b }), "notifications");
  console.log(`  settlements=${settlementRows.length} notifications=${notifRows.length}`);

  // ── 9. Verify ────────────────────────────────────────────────────
  const [cCust, cMach, cTest, cCont, cStl, cUser, cEng] = await Promise.all([
    prisma.customer.count({ where: { id: { startsWith: "accc-" } } }),
    prisma.machine.count({ where: { id: { startsWith: "accm-" } } }),
    prisma.copierTest.count({ where: { OR: [{ id: { startsWith: "acct-" } }, { id: { startsWith: "accp-" } }] } }),
    prisma.contract.count({ where: { contractNumber: { startsWith: "ACC-" } } }),
    prisma.settlement.count({ where: { settlementNumber: { startsWith: "ACC-STL-" } } }),
    prisma.user.count({ where: { email: { startsWith: "eng-" } } }),
    prisma.engineer.count({ where: { id: { startsWith: "eng-acc-" } } }),
  ]);
  console.log("VERIFY:", JSON.stringify({ customers: cCust, machines: cMach, tests: cTest, contracts: cCont, settlements: cStl, engUsers: cUser, engineers: cEng }));
  console.log("Unresolved engineer tokens:", [...unresolvedEngineers].join(" | ") || "(none)");
  console.log(`Invalid maintenance dates skipped: ${invalidMaintDates}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
