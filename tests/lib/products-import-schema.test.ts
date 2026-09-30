import { describe, it, expect } from "vitest";
import {
  parseCsvRecords,
  validateRecords,
  PRODUCT_COLUMNS,
} from "@/lib/import-schemas";

const COMPANY_ID = "company-machines";

function parseProductCsv(rows: string[], headers = "اسم المنتج,الشركة التابعة,النوع,سعر الشراء,سعر الجملة,سعر التجزئة") {
  return parseCsvRecords([headers, ...rows].join("\n"), "products");
}

describe("product import schema", () => {
  it("requires the product name and its owning company", () => {
    const keys = PRODUCT_COLUMNS.map((column) => column.key);
    expect(keys).toContain("companyName");
    expect(PRODUCT_COLUMNS.find((c) => c.key === "name")?.required).toBe(true);
    expect(PRODUCT_COLUMNS.find((c) => c.key === "companyName")?.required).toBe(true);
  });

  it("carries all three prices so an exported file round-trips", () => {
    const keys = PRODUCT_COLUMNS.map((column) => column.key);
    expect(keys).toEqual(expect.arrayContaining(["purchasePrice", "wholesalePrice", "retailPrice"]));
  });

  it("maps the Arabic type header to the machine enum value", () => {
    const { records, errors } = parseProductCsv(["كيوسيرا 406,شركة جملة آلات,آلة,0,0,0"]);
    expect(errors).toEqual([]);
    expect(records[0].productType).toBe("آلة");
  });

  it("defaults a bare model list to a machine priced at zero", () => {
    const { records, errors } = parseProductCsv(["MPC 3050,شركة جملة آلات,,,,"]);
    expect(errors).toEqual([]);
    const { valid, errors: validationErrors } = validateRecords("products", records, {
      passthroughKeys: ["companyId"],
    });
    expect(validationErrors).toEqual([]);
    expect(valid[0]).toMatchObject({
      name: "MPC 3050",
      productType: "MACHINE",
      purchasePrice: 0,
      wholesalePrice: 0,
      retailPrice: 0,
    });
  });

  it("reads a spare part type from the Arabic label", () => {
    const { records } = parseProductCsv(["رولر 046,شركة جملة قطع غيار,قطعة غيار,0,0,0"]);
    const { valid } = validateRecords("products", records, { passthroughKeys: ["companyId"] });
    expect(valid[0].productType).toBe("SPARE_PART");
  });

  it("rejects a negative price", () => {
    const { records } = parseProductCsv(["MPC 3050,شركة جملة آلات,آلة,-5,0,0"]);
    const { valid, errors } = validateRecords("products", records, { passthroughKeys: ["companyId"] });
    expect(valid).toHaveLength(0);
    expect(errors[0].field).toBe("purchasePrice");
  });

  it("treats the same name in two companies as two distinct products", () => {
    const { records } = parseProductCsv([
      "MPC 3050,شركة جملة آلات,آلة,0,0,0",
      "MPC 3050,شركة جملة قطع غيار,آلة,0,0,0",
    ]);
    const withCompany = records.map((record, index) => ({
      ...record,
      companyId: index === 0 ? "company-a" : "company-b",
    }));
    const { valid, errors } = validateRecords("products", withCompany, { passthroughKeys: ["companyId"] });
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(2);
  });

  it("flags a name already stored for the same company but allows it for another", () => {
    const { records } = parseProductCsv(["MPC 3050,شركة جملة آلات,آلة,0,0,0"]);
    const scoped = records.map((record) => ({ ...record, companyId: COMPANY_ID }));
    const existingKeys = new Set([`${COMPANY_ID}|mpc 3050`]);

    const blocked = validateRecords("products", scoped, { existingKeys, passthroughKeys: ["companyId"] });
    expect(blocked.valid).toHaveLength(0);
    expect(blocked.errors[0].message).toContain("موجود بالفعل");

    const otherCompany = validateRecords("products", scoped, {
      existingKeys: new Set(["company-other|mpc 3050"]),
      passthroughKeys: ["companyId"],
    });
    expect(otherCompany.errors).toEqual([]);
  });

  it("rejects a repeated name inside the same file", () => {
    const { records } = parseProductCsv([
      "MPC 3050,شركة جملة آلات,آلة,0,0,0",
      "MPC 3050,شركة جملة آلات,آلة,0,0,0",
    ]);
    const scoped = records.map((record) => ({ ...record, companyId: COMPANY_ID }));
    const { valid, errors } = validateRecords("products", scoped, { passthroughKeys: ["companyId"] });
    expect(valid).toHaveLength(1);
    expect(errors[0].message).toContain("مكرر");
  });

  it("reads the stock column the products export writes", () => {
    const { records, errors } = parseProductCsv(["MPC 3050,شركة جملة آلات,آلة,0,0,0,7"], "اسم المنتج,الشركة التابعة,النوع,سعر الشراء,سعر الجملة,سعر التجزئة,الكمية");
    expect(errors).toEqual([]);
    const { valid } = validateRecords("products", records, { passthroughKeys: ["companyId"] });
    expect(valid[0].stock).toBe(7);
  });

  it("defaults a missing stock column to zero", () => {
    const { records } = parseProductCsv(["MPC 3050,شركة جملة آلات,آلة,0,0,0"]);
    const { valid } = validateRecords("products", records, { passthroughKeys: ["companyId"] });
    expect(valid[0].stock).toBe(0);
  });

  it("rejects an unknown column so a mismatched export fails loudly", () => {
    const { errors } = parseProductCsv(["MPC 3050,شركة جملة آلات,آلة,0,0,0,1"], "اسم المنتج,الشركة التابعة,النوع,سعر الشراء,سعر الجملة,سعر التجزئة,عمود غريب");
    expect(errors.length).toBeGreaterThan(0);
  });

  // The products page writes these exact headers, in this order, so switching
  // language must not produce a file the importer rejects.
  it("accepts the full export header set in both languages", () => {
    const arabic =
      "اسم المنتج,الشركة التابعة,النوع,كود المنتج,الماركة,سعر الشراء,سعر الجملة,سعر التجزئة,الكمية";
    const english =
      "Product name,Company,Type,SKU,Brand,Purchase price,Wholesale price,Retail price,Quantity";

    for (const headers of [arabic, english]) {
      const { records, errors } = parseProductCsv(["MPC 3050,شركة جملة آلات,آلة,KY-1,Kyocera,10,20,30,4"], headers);
      expect(errors).toEqual([]);
      const { valid, errors: validationErrors } = validateRecords("products", records, {
        passthroughKeys: ["companyId"],
      });
      expect(validationErrors).toEqual([]);
      expect(valid[0]).toMatchObject({
        name: "MPC 3050",
        productType: "MACHINE",
        sku: "KY-1",
        brand: "Kyocera",
        purchasePrice: 10,
        wholesalePrice: 20,
        retailPrice: 30,
        stock: 4,
      });
    }
  });

  it("re-importing the same exported file reports the names as existing", () => {
    const { records } = parseProductCsv(["MPC 3050,شركة جملة آلات,آلة,0,0,0,0"]);
    const scoped = records.map((record) => ({ ...record, companyId: "company-a" }));
    const { valid } = validateRecords("products", scoped, { passthroughKeys: ["companyId"] });
    // After a successful import these names are stored, so a second run of the
    // same file is refused rather than silently duplicating the catalogue.
    const existingKeys = new Set(valid.map((r) => `company-a|${String(r.name).toLowerCase()}`));
    const again = validateRecords("products", scoped, { existingKeys, passthroughKeys: ["companyId"] });
    expect(again.valid).toHaveLength(0);
  });
});
