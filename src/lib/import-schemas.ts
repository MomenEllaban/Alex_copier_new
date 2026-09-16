import { parseCsv } from "@/lib/csv";

export type FieldType = "text" | "email" | "number" | "date" | "boolean" | "enum";

export interface ImportColumn {
  key: string;
  labelAr: string;
  labelEn: string;
  aliases: string[];
  required?: boolean;
  type: FieldType;
  enumMap?: Record<string, string>;
  sample: string;
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export type EntityKey = "customers" | "machines" | "suppliers";

export const CUSTOMER_COLUMNS: ImportColumn[] = [
  { key: "name", labelAr: "الاسم", labelEn: "Name", aliases: ["الاسم", "اسم العميل", "name"], required: true, type: "text", sample: "محمد أحمد علي" },
  { key: "contactPerson", labelAr: "جهة الاتصال", labelEn: "Contact person", aliases: ["جهة الاتصال", "contactperson"], type: "text", sample: "أ. سعيد" },
  { key: "phone", labelAr: "الهاتف", labelEn: "Phone", aliases: ["الهاتف", "التليفون", "الموبايل", "phone"], type: "text", sample: "01001234567" },
  { key: "email", labelAr: "البريد الإلكتروني", labelEn: "Email", aliases: ["البريد الإلكتروني", "الايميل", "email"], type: "email", sample: "client@example.com" },
  { key: "address", labelAr: "العنوان", labelEn: "Address", aliases: ["العنوان", "address"], type: "text", sample: "شارع الجمهورية، محطة الرمل" },
  { key: "city", labelAr: "المدينة", labelEn: "City", aliases: ["المدينة", "city"], type: "text", sample: "الإسكندرية" },
  { key: "governorate", labelAr: "المحافظة", labelEn: "Governorate", aliases: ["المحافظة", "governorate"], type: "text", sample: "الإسكندرية" },
  { key: "taxNumber", labelAr: "الرقم الضريبي", labelEn: "Tax number", aliases: ["الرقم الضريبي", "taxnumber"], type: "text", sample: "123-456-789" },
  { key: "creditLimit", labelAr: "حد الائتمان", labelEn: "Credit limit", aliases: ["حد الائتمان", "creditlimit"], type: "number", sample: "50000" },
  { key: "paymentTerms", labelAr: "شروط الدفع", labelEn: "Payment terms", aliases: ["شروط الدفع", "paymentterms"], type: "text", sample: "آجل 30 يوم" },
  {
    key: "customerType",
    labelAr: "نوع العميل",
    labelEn: "Customer type",
    aliases: ["نوع العميل", "النوع", "customertype"],
    type: "enum",
    enumMap: {
      فرد: "INDIVIDUAL",
      شركة: "COMPANY",
      individual: "INDIVIDUAL",
      company: "COMPANY",
    },
    sample: "فرد",
  },
];

export const MACHINE_COLUMNS: ImportColumn[] = [
  { key: "serialNumber", labelAr: "رقم التسلسل", labelEn: "Serial number", aliases: ["رقم التسلسل", "السيريال", "serialnumber", "serial"], required: true, type: "text", sample: "SN-2024-001" },
  { key: "manufacturer", labelAr: "الماركة", labelEn: "Manufacturer", aliases: ["الماركة", "المصنع", "manufacturer", "brand"], type: "text", sample: "Canon" },
  { key: "model", labelAr: "الموديل", labelEn: "Model", aliases: ["الموديل", "model"], type: "text", sample: "IR2525" },
  { key: "isColor", labelAr: "ملون؟", labelEn: "Color?", aliases: ["ملون", "ملون؟", "iscolor"], type: "boolean", sample: "لا" },
  { key: "purchasePrice", labelAr: "سعر الشراء", labelEn: "Purchase price", aliases: ["سعر الشراء", "purchaseprice"], type: "number", sample: "45000" },
  { key: "purchaseDate", labelAr: "تاريخ الشراء", labelEn: "Purchase date", aliases: ["تاريخ الشراء", "purchasedate"], type: "date", sample: "2024-05-15" },
  {
    key: "currentStatus",
    labelAr: "الحالة",
    labelEn: "Status",
    aliases: ["الحالة", "currentstatus", "status"],
    type: "enum",
    enumMap: {
      "في المستودع": "IN_WAREHOUSE",
      مستودع: "IN_WAREHOUSE",
      مباع: "SOLD",
      مؤجر: "RENTED",
      "تحت الصيانة": "UNDER_MAINTENANCE",
      "تحت الفحص": "UNDER_INSPECTION",
      مهمل: "SCRAPPED",
      scrapped: "SCRAPPED",
      in_warehouse: "IN_WAREHOUSE",
      sold: "SOLD",
      rented: "RENTED",
      under_maintenance: "UNDER_MAINTENANCE",
      under_inspection: "UNDER_INSPECTION",
    },
    sample: "في المستودع",
  },
];

export const SUPPLIER_COLUMNS: ImportColumn[] = [
  { key: "name", labelAr: "اسم المورد", labelEn: "Supplier name", aliases: ["اسم المورد", "الاسم", "name"], required: true, type: "text", sample: "شركة المستقبل للتوريدات" },
  { key: "companyName", labelAr: "الشركة التابعة", labelEn: "Belongs to company", aliases: ["الشركة التابعة", "الشركة", "companyname", "company"], required: true, type: "text", sample: "اليكس كوبير" },
  { key: "contactName", labelAr: "جهة الاتصال", labelEn: "Contact person", aliases: ["جهة الاتصال", "contactname"], type: "text", sample: "أ. كريم" },
  { key: "phone", labelAr: "الهاتف", labelEn: "Phone", aliases: ["الهاتف", "التليفون", "phone"], type: "text", sample: "01112223334" },
  { key: "email", labelAr: "البريد الإلكتروني", labelEn: "Email", aliases: ["البريد الإلكتروني", "الايميل", "email"], type: "email", sample: "supplier@example.com" },
  { key: "address", labelAr: "العنوان", labelEn: "Address", aliases: ["العنوان", "address"], type: "text", sample: "سموحة، الإسكندرية" },
  { key: "taxNumber", labelAr: "الرقم الضريبي", labelEn: "Tax number", aliases: ["الرقم الضريبي", "taxnumber"], type: "text", sample: "987-654-321" },
];

const ENTITY_COLUMNS: Record<EntityKey, ImportColumn[]> = {
  customers: CUSTOMER_COLUMNS,
  machines: MACHINE_COLUMNS,
  suppliers: SUPPLIER_COLUMNS,
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function getColumns(entity: EntityKey): ImportColumn[] {
  return ENTITY_COLUMNS[entity];
}

export interface ParsedTable {
  records: Record<string, string>[];
  errors: ImportError[];
}

export function parseCsvRecords(csv: string, entity: EntityKey): ParsedTable {
  const columns = getColumns(entity);
  const rows = parseCsv(csv);
  const errors: ImportError[] = [];

  if (rows.length === 0) {
    errors.push({ row: 0, field: "", message: "الملف فارغ أو لا يحتوي على بيانات" });
    return { records: [], errors };
  }

  const headerRow = rows[0];
  const colIndex = new Map<string, number>();
  const matched = new Set<number>();

  headerRow.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const column = columns.find(
      (c) => normalizeHeader(c.key) === normalized || c.aliases.some((a) => normalizeHeader(a) === normalized)
    );
    if (column) {
      if (!colIndex.has(column.key)) colIndex.set(column.key, index);
      matched.add(index);
    }
  });

  for (const column of columns) {
    if (column.required && !colIndex.has(column.key)) {
      errors.push({
        row: 0,
        field: column.key,
        message: `عمود مطلوب مفقود في الملف: ${column.labelAr} (${column.key})`,
      });
    }
  }

  headerRow.forEach((header, index) => {
    if (!matched.has(index) && header.trim() !== "") {
      errors.push({ row: 0, field: header.trim(), message: `عمود غير معروف وسيتم تجاهله: ${header.trim()}` });
    }
  });

  const records: Record<string, string>[] = [];
  rows.slice(1).forEach((row, rowIndex) => {
    const record: Record<string, string> = {};
    for (const column of columns) {
      const idx = colIndex.get(column.key);
      if (idx === undefined) continue;
      record[column.key] = (row[idx] ?? "").trim();
    }
    const isEmpty = Object.values(record).every((v) => v === "");
    if (!isEmpty) records.push({ ...record, __row: String(rowIndex + 2) });
  });

  if (records.length === 0 && errors.length === 0) {
    errors.push({ row: 0, field: "", message: "لا توجد صفوف بيانات في الملف" });
  }

  return { records, errors };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function parseFlexibleDate(value: string): Date | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (match) {
    const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return isNaN(d.getTime()) ? null : d;
  }
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(trimmed);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(Number(match[3]), month - 1, day));
  }
  return null;
}

function parseBooleanValue(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (["نعم", "true", "1", "y", "yes", "صح"].includes(v)) return true;
  if (["لا", "false", "0", "n", "no"].includes(v)) return false;
  return null;
}

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_INDIC_DIGITS[d] ?? d);
}

function parseNumberValue(value: string): number | null {
  const cleaned = normalizeDigits(value.replace(/[,\s]/g, "")).replace(/٫/g, ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export interface ValidateOptions {
  existingKeys?: Set<string>;
  passthroughKeys?: string[];
}

export interface ValidateResult {
  valid: Record<string, unknown>[];
  errors: ImportError[];
}

function duplicateKey(entity: EntityKey, rec: Record<string, string>): string | null {
  switch (entity) {
    case "customers":
      return rec.name ? `${rec.name.trim().toLowerCase()}|${(rec.phone || "").replace(/\s/g, "")}` : null;
    case "machines":
      return rec.serialNumber ? rec.serialNumber.trim().toLowerCase() : null;
    case "suppliers":
      return rec.name ? rec.name.trim().toLowerCase() : null;
  }
}

export function validateRecords(
  entity: EntityKey,
  records: Record<string, string>[],
  options: ValidateOptions = {}
): ValidateResult {
  const columns = getColumns(entity);
  const valid: Record<string, unknown>[] = [];
  const errors: ImportError[] = [];
  const seenInFile = new Set<string>();
  const existingKeys = options.existingKeys ?? new Set<string>();

  for (const record of records) {
    const rowNum = Number(record.__row ?? "0");
    let rowValid = true;
    const fail = (field: string, message: string) => {
      errors.push({ row: rowNum, field, message });
      rowValid = false;
    };

    const data: Record<string, unknown> = {};
    for (const key of options.passthroughKeys ?? []) {
      if (record[key] !== undefined) data[key] = record[key];
    }

    for (const column of columns) {
      const raw = record[column.key] ?? "";

      if (raw === "") {
        if (column.required) {
          fail(column.key, `${column.labelAr}: قيمة مطلوبة`);
        }
        continue;
      }

      if (raw.length > 500) {
        fail(column.key, `${column.labelAr}: القيمة طويلة جداً (الحد 500 حرف)`);
        continue;
      }

      switch (column.type) {
        case "email":
          if (!isValidEmail(raw)) {
            fail(column.key, `${column.labelAr}: بريد إلكتروني غير صالح (${raw})`);
          } else {
            data[column.key] = raw;
          }
          break;
        case "number": {
          const n = parseNumberValue(raw);
          if (n === null || n < 0) {
            fail(column.key, `${column.labelAr}: قيمة رقمية غير صالحة (${raw})`);
          } else {
            data[column.key] = n;
          }
          break;
        }
        case "date": {
          const d = parseFlexibleDate(raw);
          if (!d) {
            fail(column.key, `${column.labelAr}: تاريخ غير صالح (${raw}) — استخدم YYYY-MM-DD أو DD/MM/YYYY`);
          } else {
            data[column.key] = d;
          }
          break;
        }
        case "boolean": {
          const b = parseBooleanValue(raw);
          if (b === null) {
            fail(column.key, `${column.labelAr}: قيمة غير صالحة (${raw}) — استخدم نعم أو لا`);
          } else {
            data[column.key] = b;
          }
          break;
        }
        case "enum": {
          const canonical = column.enumMap?.[raw.toLowerCase()] ?? column.enumMap?.[raw];
          if (!canonical) {
            fail(column.key, `${column.labelAr}: قيمة غير صالحة (${raw}) — القيم المقبولة: ${Object.keys(column.enumMap || {}).filter((k) => !k.includes("_")).join("، ")}`);
          } else {
            data[column.key] = canonical;
          }
          break;
        }
        default:
          data[column.key] = raw;
      }
    }

    if (!rowValid) continue;

    if (entity === "customers") data.customerType = data.customerType ?? "INDIVIDUAL";
    if (entity === "customers") data.creditLimit = data.creditLimit ?? 0;
    if (entity === "machines") {
      data.currentStatus = data.currentStatus ?? "IN_WAREHOUSE";
      data.isColor = data.isColor ?? false;
    }

    const dupKey = duplicateKey(entity, record);
    if (dupKey) {
      if (seenInFile.has(dupKey)) {
        fail(duplicateField(entity), "صف مكرر داخل نفس الملف");
        continue;
      }
      if (existingKeys.has(dupKey)) {
        fail(duplicateField(entity), "هذا السجل موجود بالفعل في قاعدة البيانات");
        continue;
      }
      seenInFile.add(dupKey);
    }

    delete data.__row;
    valid.push(data);
  }

  return { valid, errors };
}

function duplicateField(entity: EntityKey): string {
  switch (entity) {
    case "customers":
      return "name";
    case "machines":
      return "serialNumber";
    case "suppliers":
      return "name";
  }
}
