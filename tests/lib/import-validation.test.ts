import { describe, it, expect } from "vitest";
import {
  parseCsvRecords,
  validateRecords,
  CUSTOMER_COLUMNS,
  MACHINE_COLUMNS,
  SUPPLIER_COLUMNS,
  parseFlexibleDate,
} from "@/lib/import-schemas";
import { buildTemplateCsv } from "@/lib/csv";

describe("import parsing", () => {
  it("excludes customer companyName and whatsapp columns while retaining phone and supplier companyName", () => {
    const customerKeys = CUSTOMER_COLUMNS.map((column) => column.key);
    expect(customerKeys).not.toContain("companyName");
    expect(customerKeys).not.toContain("whatsapp");
    expect(customerKeys).toContain("phone");
    expect(SUPPLIER_COLUMNS.map((column) => column.key)).toContain("companyName");
  });

  it("maps Arabic header aliases to canonical keys", () => {
    const csv = "الاسم,الهاتف,المدينة\nمحمد أحمد,01001234567,الإسكندرية";
    const { records, errors } = parseCsvRecords(csv, "customers");
    expect(errors).toEqual([]);
    expect(records[0].name).toBe("محمد أحمد");
    expect(records[0].phone).toBe("01001234567");
    expect(records[0].city).toBe("الإسكندرية");
  });

  it("maps English keys case/space-insensitively", () => {
    const csv = "Name, Phone\nAli,0111";
    const { records, errors } = parseCsvRecords(csv, "customers");
    expect(errors).toEqual([]);
    expect(records[0].name).toBe("Ali");
  });

  it("reports unknown headers and missing required columns without crashing", () => {
    const csv = "name,bogus_col\nx,y";
    const { errors } = parseCsvRecords(csv, "customers");
    expect(errors.some((e) => e.field === "bogus_col")).toBe(true);
    // name column present; no required-missing error
    expect(errors.some((e) => e.message.includes("مطلوب مفقود"))).toBe(false);
  });

  it("reports a missing required column (serialNumber for machines)", () => {
    const csv = "manufacturer\nCanon";
    const { errors } = parseCsvRecords(csv, "machines");
    expect(errors.some((e) => e.field === "serialNumber")).toBe(true);
  });

  it("skips completely empty rows", () => {
    const csv = "name,phone\nمحمد,0100\n,\n";
    const { records } = parseCsvRecords(csv, "customers");
    expect(records.length).toBe(1);
  });
});

describe("import validation", () => {
  const baseCustomer = { name: "محمد أحمد", phone: "01001234567" };

  function customerRecords(rows: Record<string, string>[]) {
    return rows.map((r, i) => ({ ...r, __row: String(i + 2) }));
  }

  it("accepts valid rows with Arabic enum values and normalizes them", () => {
    const { valid, errors } = validateRecords(
      "customers",
      customerRecords([{ ...baseCustomer, customerType: "شركة" }])
    );
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({ customerType: "COMPANY" });
  });

  it("defaults customerType and creditLimit when omitted", () => {
    const { valid } = validateRecords("customers", customerRecords([{ ...baseCustomer }]));
    expect(valid[0]).toMatchObject({ customerType: "INDIVIDUAL", creditLimit: 0 });
  });

  it("rejects missing required fields in Arabic", () => {
    const { valid, errors } = validateRecords(
      "customers",
      customerRecords([{ phone: "0100" }, { name: "", phone: "0100" }])
    );
    expect(valid).toEqual([]);
    expect(errors.length).toBe(2);
    expect(errors[0].message).toContain("مطلوبة");
  });

  it("validates email format and rejects bad ones", () => {
    const ok = validateRecords("customers", customerRecords([{ ...baseCustomer, email: "a@b.co" }]));
    expect(ok.errors).toEqual([]);
    const bad = validateRecords("customers", customerRecords([{ ...baseCustomer, email: "not-an-email" }]));
    expect(bad.valid).toEqual([]);
    expect(bad.errors[0].message).toContain("بريد إلكتروني غير صالح");
  });

  it("coerces numbers with commas and Arabic decimal separator", () => {
    const { valid, errors } = validateRecords("machines", [
      { __row: "2", serialNumber: "SN-1", purchasePrice: "45,000" },
      { __row: "3", serialNumber: "SN-2", purchasePrice: "١٢٫٥" },
    ]);
    expect(errors.some((e) => e.field === "purchasePrice")).toBe(false);
    expect(valid[0].purchasePrice).toBe(45000);
  });

  it("rejects invalid numbers", () => {
    const { valid, errors } = validateRecords("machines", [
      { __row: "2", serialNumber: "SN-1", purchasePrice: "abc" },
    ]);
    expect(valid).toEqual([]);
    expect(errors[0].message).toContain("قيمة رقمية غير صالحة");
  });

  it("accepts ISO and dd/mm/yyyy dates, rejects garbage", () => {
    expect(parseFlexibleDate("2024-05-15")?.getUTCMonth()).toBe(4);
    expect(parseFlexibleDate("15/05/2024")?.getUTCDate()).toBe(15);
    expect(parseFlexibleDate("2024/5/5")).not.toBeNull();
    expect(parseFlexibleDate("غداً")).toBeNull();
    expect(parseFlexibleDate("05/20/2024")).toBeNull();

    const { valid, errors } = validateRecords("machines", [
      { __row: "2", serialNumber: "SN-1", purchaseDate: "15/05/2024" },
      { __row: "3", serialNumber: "SN-2", purchaseDate: "bad-date" },
    ]);
    expect((valid[0].purchaseDate as Date).getUTCFullYear()).toBe(2024);
    expect(errors.length).toBe(1);
    expect(errors[0].field).toBe("purchaseDate");
  });

  it("parses boolean نعم/لا variants for isColor", () => {
    const { valid, errors } = validateRecords("machines", [
      { __row: "2", serialNumber: "SN-1", isColor: "نعم" },
      { __row: "3", serialNumber: "SN-2", isColor: "no" },
      { __row: "4", serialNumber: "SN-3", isColor: "ربما" },
    ]);
    expect(valid[0].isColor).toBe(true);
    expect(valid[1].isColor).toBe(false);
    expect(errors[0].message).toContain("نعم أو لا");
  });

  it("defaults machine status/isColor and maps Arabic statuses", () => {
    const onlySerial = validateRecords("machines", [{ __row: "2", serialNumber: "SN-9" }]);
    expect(onlySerial.valid[0]).toMatchObject({ currentStatus: "IN_WAREHOUSE", isColor: false });

    const mapped = validateRecords("machines", [{ __row: "2", serialNumber: "SN-8", currentStatus: "مباع" }]);
    expect(mapped.valid[0].currentStatus).toBe("SOLD");

    const invalidEnum = validateRecords("machines", [{ __row: "2", serialNumber: "SN-7", currentStatus: "حالة وهمية" }]);
    expect(invalidEnum.errors[0].message).toContain("قيمة غير صالحة");
  });

  it("blocks duplicates within the same file", () => {
    const rows = customerRecords([
      { name: "محمد", phone: "0100" },
      { name: "محمد", phone: "0100" },
    ]);
    const { valid, errors } = validateRecords("customers", rows);
    expect(valid.length).toBe(1);
    expect(errors[0].message).toContain("صف مكرر داخل نفس الملف");
  });

  it("blocks rows already existing in the database key set", () => {
    const existingKeys = new Set(["محمد|0100"]);
    const { valid, errors } = validateRecords(
      "customers",
      customerRecords([{ name: "محمد", phone: "0100" }]),
      { existingKeys }
    );
    expect(valid).toEqual([]);
    expect(errors[0].message).toContain("موجود بالفعل");
  });

  it("blocks machine duplicate serials case-insensitively against DB", () => {
    const existingKeys = new Set(["sn-100"]);
    const { valid, errors } = validateRecords(
      "machines",
      [{ __row: "2", serialNumber: "SN-100" }],
      { existingKeys }
    );
    expect(valid).toEqual([]);
    expect(errors[0].field).toBe("serialNumber");
  });

  it("preserves long Arabic text and special characters verbatim", () => {
    const longText = "وصف طويل جداً ".repeat(10).trim();
    const special = 'نص بعلامات "اقتباس"، فاصلة، وسطر\nجديد';
    const { valid, errors } = validateRecords(
      "customers",
      customerRecords([{ ...baseCustomer, address: longText, paymentTerms: special }])
    );
    expect(errors).toEqual([]);
    expect(valid[0].address).toBe(longText);
    expect(valid[0].paymentTerms).toBe(special);
  });

  it("rejects values over 500 chars instead of silently truncating", () => {
    const huge = "خ".repeat(501);
    const { valid, errors } = validateRecords(
      "customers",
      customerRecords([{ ...baseCustomer, address: huge }])
    );
    expect(valid).toEqual([]);
    expect(errors[0].message).toContain("طويلة جداً");
  });

  it("suppliers import passes through resolved companyId", () => {
    const { valid, errors } = validateRecords(
      "suppliers",
      [{ __row: "2", name: "مورد جديد", companyName: "اليكس كوبير", companyId: "cmp_1" }],
      { passthroughKeys: ["companyId"] }
    );
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({ companyId: "cmp_1", name: "مورد جديد" });
  });
});

describe("template round trip (Template -> fill -> parse -> validate)", () => {
  it("customer template parses back to validatable records", () => {
    const headers = CUSTOMER_COLUMNS.map((c) => c.key);
    const template = buildTemplateCsv(headers, [CUSTOMER_COLUMNS.map((c) => c.sample)]);

    const filled = template.replace(
      CUSTOMER_COLUMNS.find((c) => c.key === "name")!.sample,
      "عميل من القالب"
    );

    const parsed = parseCsvRecords(filled, "customers");
    expect(parsed.records[0].name).toBe("عميل من القالب");
    expect(parsed.errors).toEqual([]);

    const { valid, errors } = validateRecords("customers", parsed.records);
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({
      name: "عميل من القالب",
      customerType: "INDIVIDUAL",
      creditLimit: 50000,
    });
  });

  it("machine template with Arabic sample values validates cleanly", () => {
    const headers = MACHINE_COLUMNS.map((c) => c.key);
    const template = buildTemplateCsv(headers, [MACHINE_COLUMNS.map((c) => c.sample)]);
    const parsed = parseCsvRecords(template, "machines");
    expect(parsed.errors).toEqual([]);
    const { valid, errors } = validateRecords("machines", parsed.records);
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({ currentStatus: "IN_WAREHOUSE", isColor: false });
  });
});
