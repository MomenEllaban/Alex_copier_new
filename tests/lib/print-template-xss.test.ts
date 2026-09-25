import { describe, expect, it } from "vitest";

import { esc } from "@/lib/html-escape";
import { generateInvoiceHtml, generateReceiptHtml, type InvoiceData } from "@/lib/invoice-template";
import { buildSupplierStatementPrintHtml, type SupplierStatement } from "@/lib/supplier-statement";

/** Payloads that must never reach the browser as live markup. */
const PAYLOADS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "</td></tr><script>alert(1)</script>",
  "';alert(1);//",
  "<svg/onload=alert(1)>",
];

const baseInvoice: InvoiceData = {
  type: "sale",
  id: "inv_1234567890",
  date: "2026-03-01",
  companyName: "اليكس كوبير",
  counterpartyName: "عميل تجريبي",
  items: [{ name: "طابعة ليزر", quantity: 1, unitPrice: 100, discount: 0 }],
  subtotal: 100,
  discount: 0,
  taxRate: 0,
  taxAmount: 0,
  total: 100,
};

/**
 * If any user value were interpolated raw, one of these tag openers would
 * appear literally. Their absence is what proves the value was escaped —
 * the escaped form legitimately still contains substrings like
 * `onerror=alert(1)`, because `&lt;img src=x onerror=alert(1)&gt;` is inert.
 */
function expectNoLiveMarkup(html: string) {
  expect(html).not.toMatch(/<script>alert/);
  expect(html).not.toMatch(/<img src=x/);
  expect(html).not.toMatch(/<svg[\s/]/);
}

describe("esc", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(esc(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("escapes ampersands before the other entities so nothing double-escapes", () => {
    expect(esc("&lt;")).toBe("&amp;lt;");
  });

  it("renders nullish and non-string values as an empty string", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
    expect(esc(0)).toBe("0");
    expect(esc(1500)).toBe("1500");
  });

  it("leaves ordinary Arabic and Latin text untouched", () => {
    expect(esc("طابعة HP LaserJet")).toBe("طابعة HP LaserJet");
  });
});

describe("generateInvoiceHtml — stored XSS", () => {
  it("escapes a product name that carries a script tag", () => {
    const html = generateInvoiceHtml({
      ...baseInvoice,
      items: [{ name: PAYLOADS[0], quantity: 1, unitPrice: 100, discount: 0 }],
    });

    expectNoLiveMarkup(html);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // The escaping must be visible in the rendered table cell.
    expect(html).toContain(`<td class="item">&lt;script&gt;alert(1)&lt;/script&gt;</td>`);
  });

  it("escapes every counterparty field", () => {
    const html = generateInvoiceHtml({
      ...baseInvoice,
      companyName: PAYLOADS[1],
      companyAddress: PAYLOADS[1],
      companyPhone: PAYLOADS[1],
      counterpartyName: PAYLOADS[2],
      counterpartyAddress: PAYLOADS[2],
      counterpartyPhone: PAYLOADS[2],
      engineerName: PAYLOADS[4],
      warehouseName: PAYLOADS[4],
    });

    expectNoLiveMarkup(html);
    expect(html).toContain(`<p class="name">&lt;/td&gt;&lt;/tr&gt;&lt;script&gt;alert(1)&lt;/script&gt;</p>`);
  });

  it("escapes invoice notes", () => {
    const html = generateInvoiceHtml({ ...baseInvoice, notes: PAYLOADS[0] });

    expectNoLiveMarkup(html);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes extra fields", () => {
    const html = generateInvoiceHtml({
      ...baseInvoice,
      extraFields: [{ label: PAYLOADS[0], value: PAYLOADS[1] }],
    });

    expectNoLiveMarkup(html);
  });

  it("escapes an unknown payment method and status", () => {
    const html = generateInvoiceHtml({
      ...baseInvoice,
      paymentMethod: PAYLOADS[0],
      paymentStatus: PAYLOADS[1],
    });

    expectNoLiveMarkup(html);
  });

  it("escapes the document id used in the <title> and the header", () => {
    const html = generateInvoiceHtml({ ...baseInvoice, id: `${PAYLOADS[0]}abcdefgh` });

    expectNoLiveMarkup(html);
  });

  it("escapes an unparsable date instead of echoing it raw", () => {
    const html = generateInvoiceHtml({ ...baseInvoice, date: PAYLOADS[0] });

    expectNoLiveMarkup(html);
  });

  it("still prints legitimate values unchanged", () => {
    const html = generateInvoiceHtml({ ...baseInvoice, counterpartyName: "شركة النور <للتوريدات>" });

    expect(html).toContain("شركة النور &lt;للتوريدات&gt;");
    expect(html).toContain("طابعة ليزر");
  });
});

describe("generateReceiptHtml — stored XSS", () => {
  it.each([58, 80] as const)("escapes product names on the %imm receipt", (width) => {
    const html = generateReceiptHtml(
      { ...baseInvoice, items: [{ name: PAYLOADS[0], quantity: 1, unitPrice: 100, discount: 0 }] },
      width,
    );

    expectNoLiveMarkup(html);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes the receipt header, party and notes", () => {
    const html = generateReceiptHtml({
      ...baseInvoice,
      companyName: PAYLOADS[0],
      companyPhone: PAYLOADS[0],
      companyAddress: PAYLOADS[0],
      counterpartyName: PAYLOADS[1],
      counterpartyPhone: PAYLOADS[1],
      notes: PAYLOADS[0],
    });

    expectNoLiveMarkup(html);
  });

  it("escapes extra fields", () => {
    const html = generateReceiptHtml({
      ...baseInvoice,
      extraFields: [{ label: PAYLOADS[0], value: PAYLOADS[0] }],
    });

    expectNoLiveMarkup(html);
  });
});

describe("buildSupplierStatementPrintHtml — stored XSS", () => {
  const statement: SupplierStatement = {
    supplierId: "s1",
    orders: [],
    returns: [],
    entries: [
      { kind: "PURCHASE", id: "po1", date: "2026-02-01", label: PAYLOADS[0], amount: 1000, status: "RECEIVED" },
      { kind: "RETURN", id: "pr1", date: "2026-03-01", label: PAYLOADS[1], amount: -250, status: "APPROVED" },
    ],
    totalPurchases: 1000,
    returnsTotal: 250,
    ordersCount: 1,
    balance: 750,
    lastOrderDate: "2026-02-01",
  };

  it("escapes the entry label, the supplier and the company name", () => {
    const html = buildSupplierStatementPrintHtml(PAYLOADS[0], PAYLOADS[1], statement, "2026-04-01");

    expectNoLiveMarkup(html);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("escapes a generated-at value that carries markup", () => {
    const html = buildSupplierStatementPrintHtml("مورد", "شركة", statement, PAYLOADS[0]);

    expectNoLiveMarkup(html);
  });
});
