export interface InvoiceItem {
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
}

export type InvoiceLang = "ar" | "en";
export type InvoiceDir = "rtl" | "ltr";
export type ReceiptWidth = 58 | 80;

export interface InvoiceData {
  type: "sale" | "purchase" | "contract" | "return";
  subType?: string;
  id: string;
  date: string;
  lang?: InvoiceLang;
  dir?: InvoiceDir;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxNumber?: string;
  counterpartyName: string;
  counterpartyAddress?: string;
  counterpartyPhone?: string;
  counterpartyTaxNumber?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  discountType?: string;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod?: string;
  paymentStatus?: string;
  paidAmount?: number;
  dueAmount?: number;
  engineerName?: string;
  warehouseName?: string;
  customerDebt?: number;
  customerLastPayment?: { amount: number; date: string };
  invoiceAddedDebt?: number;
  notes?: string;
  extraFields?: { label: string; value: string }[];
}

interface InvoiceTheme {
  labelAr: string;
  labelEn: string;
  accent: string;
  dark: string;
  soft: string;
}

const SALE_SUBTHEMES: Record<string, InvoiceTheme> = {
  MACHINE_SALE: { labelAr: "فاتورة بيع جهاز", labelEn: "Machine Sales Invoice", accent: "#0284c7", dark: "#0369a1", soft: "#e0f2fe" },
  SPARE_PART_SALE: { labelAr: "فاتورة بيع قطع غيار", labelEn: "Spare Parts Invoice", accent: "#059669", dark: "#047857", soft: "#d1fae5" },
  TRADE_IN: { labelAr: "فاتورة استبدال", labelEn: "Trade-In Invoice", accent: "#d97706", dark: "#b45309", soft: "#fef3c7" },
};

const BASE_THEMES: Record<string, InvoiceTheme> = {
  sale: { labelAr: "فاتورة بيع", labelEn: "Sales Invoice", accent: "#0284c7", dark: "#0369a1", soft: "#e0f2fe" },
  purchase: { labelAr: "فاتورة شراء", labelEn: "Purchase Invoice", accent: "#7c3aed", dark: "#6d28d9", soft: "#ede9fe" },
  contract: { labelAr: "عقد صيانة", labelEn: "Maintenance Contract", accent: "#0d9488", dark: "#0f766e", soft: "#ccfbf1" },
  return: { labelAr: "مرتجع", labelEn: "Return", accent: "#dc2626", dark: "#b91c1c", soft: "#fee2e2" },
};

function getTheme(data: InvoiceData): InvoiceTheme {
  if (data.type === "sale" && data.subType && SALE_SUBTHEMES[data.subType]) {
    return SALE_SUBTHEMES[data.subType];
  }
  return BASE_THEMES[data.type] || BASE_THEMES.sale;
}

interface Labels {
  customer: string; supplier: string; party: string;
  details: string; date: string; payMethod: string; payStatus: string;
  engineer: string; warehouse: string;
  product: string; qty: string; price: string; discount: string; total: string;
  subtotal: string; tax: string; notes: string;
  printInvoice: string; printReceipt: string; printDate: string; thanks: string;
  items: string; number: string;
  paySummary: string; invTotal: string; paidCash: string; dueCredit: string;
  settled: string; settledState: string;
  account: string; totalOwed: string; lastPayment: string; noPayments: string; addedDebt: string;
  currency: string;
  payCash: string; payCredit: string; payPartial: string; payOverdue: string;
}

const STR: Record<InvoiceLang, Labels> = {
  ar: {
    customer: "العميل", supplier: "المورد", party: "الطرف",
    details: "التفاصيل", date: "التاريخ", payMethod: "طريقة الدفع", payStatus: "حالة الدفع",
    engineer: "المهندس", warehouse: "المخزن",
    product: "المنتج", qty: "الكمية", price: "السعر", discount: "الخصم", total: "الإجمالي",
    subtotal: "المجموع الفرعي", tax: "الضريبة", notes: "ملاحظات",
    printInvoice: "🖨️ طباعة الفاتورة", printReceipt: "🖨️ طباعة الريسيت",
    printDate: "تاريخ الطباعة", thanks: "شكراً لتعاملكم معنا",
    items: "الأصناف", number: "رقم",
    paySummary: "ملخص الدفع", invTotal: "إجمالي الفاتورة", paidCash: "تم دفع نقداً",
    dueCredit: "المتبقي أجل", settled: "الحالة", settledState: "خالص",
    account: "حساب العميل", totalOwed: "المستحق عليه", lastPayment: "آخر دفعة",
    noPayments: "لا توجد دفعات", addedDebt: "أضافت للمديونية",
    currency: "ج.م",
    payCash: "كاش", payCredit: "أجل", payPartial: "جزئي", payOverdue: "متأخر",
  },
  en: {
    customer: "Customer", supplier: "Supplier", party: "Party",
    details: "Details", date: "Date", payMethod: "Payment", payStatus: "Status",
    engineer: "Engineer", warehouse: "Warehouse",
    product: "Item", qty: "Qty", price: "Price", discount: "Disc.", total: "Total",
    subtotal: "Subtotal", tax: "Tax", notes: "Notes",
    printInvoice: "🖨️ Print Invoice", printReceipt: "🖨️ Print Receipt",
    printDate: "Print date", thanks: "Thank you for your business",
    items: "Items", number: "No.",
    paySummary: "Payment", invTotal: "Invoice total", paidCash: "Paid cash",
    dueCredit: "Balance due", settled: "Status", settledState: "Settled",
    account: "Customer account", totalOwed: "Balance owed", lastPayment: "Last payment",
    noPayments: "No payments", addedDebt: "Added to debt",
    currency: "EGP",
    payCash: "Cash", payCredit: "Credit", payPartial: "Partial", payOverdue: "Overdue",
  },
};

const PAYMENT_METHOD_KEY: Record<string, "payCash" | "payCredit"> = {
  CASH: "payCash",
  CREDIT: "payCredit",
  INSTALLMENT: "payCredit",
  MIXED: "payCredit",
};

const PAYMENT_STATUS_KEY: Record<string, "payCash" | "payCredit" | "payPartial" | "payOverdue"> = {
  PENDING: "payCredit",
  PARTIAL: "payPartial",
  PAID: "payCash",
  OVERDUE: "payOverdue",
};

function ctx(data: InvoiceData) {
  const lang: InvoiceLang = data.lang === "en" ? "en" : "ar";
  const dir: InvoiceDir = data.dir || (lang === "en" ? "ltr" : "rtl");
  const L = STR[lang];
  const locale = lang === "en" ? "en-US" : "ar-EG";
  const theme = getTheme(data);
  const title = lang === "en" ? theme.labelEn : theme.labelAr;
  return { lang, dir, L, locale, theme, title };
}

function num(n: number, locale: string): string {
  return Number(n || 0).toLocaleString(locale);
}

function money(n: number, c: ReturnType<typeof ctx>): string {
  return `${num(n, c.locale)} ${c.L.currency}`;
}

function fdate(iso: string, c: ReturnType<typeof ctx>): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return c.lang === "en"
    ? d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" })
    : d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}

function discountDisplay(data: InvoiceData): { label: string; amount: number } | null {
  const c = ctx(data);
  if (!data.discount || data.discount <= 0) return null;
  if (data.discountType === "PERCENTAGE") {
    const pct = Math.min(data.discount, 100);
    return {
      label: c.lang === "en" ? `Discount (${data.discount}%)` : `الخصم (${data.discount}%)`,
      amount: (data.subtotal * pct) / 100,
    };
  }
  return { label: c.L.discount, amount: Math.min(data.discount, data.subtotal) };
}

function payMethodLabel(data: InvoiceData, c: ReturnType<typeof ctx>): string {
  if (!data.paymentMethod) return "";
  const key = PAYMENT_METHOD_KEY[data.paymentMethod];
  return key ? c.L[key] : data.paymentMethod;
}

function payStatusLabel(data: InvoiceData, c: ReturnType<typeof ctx>): string {
  if (!data.paymentStatus) return "";
  const key = PAYMENT_STATUS_KEY[data.paymentStatus];
  return key ? c.L[key] : data.paymentStatus;
}

// ─── shared info fragments ──────────────────────────────────────────

function hasPayment(data: InvoiceData): boolean {
  return data.paidAmount !== undefined && data.paidAmount !== null;
}

function dueOf(data: InvoiceData): number {
  if (data.dueAmount !== undefined && data.dueAmount !== null) return Number(data.dueAmount);
  return Math.max(0, Number(data.total) - (Number(data.paidAmount) || 0));
}

function hasDebt(data: InvoiceData): boolean {
  if (data.customerDebt === undefined || data.customerDebt === null) return false;
  const debt = Number(data.customerDebt) || 0;
  const added = Number(data.invoiceAddedDebt) || 0;
  return debt > 0 || !!data.customerLastPayment || added > 0;
}

// ═══════════════════════════════════════════════════════════════════
// A4 — compact professional invoice
// ═══════════════════════════════════════════════════════════════════

export function generateInvoiceHtml(data: InvoiceData): string {
  const c = ctx(data);
  const { L, locale, theme, title, dir, lang } = c;
  const pm = payMethodLabel(data, c);
  const ps = payStatusLabel(data, c);
  const disc = discountDisplay(data);
  const paid = Number(data.paidAmount) || 0;
  const due = dueOf(data);
  const showPay = hasPayment(data);
  const showDebt = hasDebt(data);
  const debt = Number(data.customerDebt) || 0;
  const added = Number(data.invoiceAddedDebt) || 0;
  const lastPay = data.customerLastPayment
    ? `${money(data.customerLastPayment.amount, c)} — ${fdate(data.customerLastPayment.date, c)}`
    : L.noPayments;

  const partyTitle = data.type === "purchase" ? L.supplier : data.type === "contract" ? L.party : L.customer;
  const companyLine = [data.companyAddress, data.companyPhone, data.companyTaxNumber].filter(Boolean).join(" · ");
  const partyLine = [data.counterpartyAddress, data.counterpartyPhone, data.counterpartyTaxNumber].filter(Boolean).join(" · ");

  // payment column only when there is something to show — avoids an empty section
  const payCol = showPay
    ? `<div><h3>${L.paySummary}</h3>
      <div class="kv"><span>${L.invTotal}</span><b>${money(data.total, c)}</b></div>
      <div class="kv"><span>${L.paidCash}</span><b>${money(paid, c)}</b></div>
      <div class="kv"><span>${L.dueCredit}</span><b class="${due > 0 ? "due" : "ok"}">${due > 0 ? money(due, c) : L.settledState}</b></div></div>`
    : pm || ps
      ? `<div><h3>${L.paySummary}</h3><p>${[pm, ps].filter(Boolean).join(" · ")}</p></div>`
      : "";

  const itemRows = data.items
    .map(
      (it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="item">${it.name}</td>
        <td class="c">${num(it.quantity, locale)}</td>
        <td class="c">${num(it.unitPrice, locale)}</td>
        <td class="c">${it.discount > 0 ? num(it.discount, locale) : "–"}</td>
        <td class="c b">${num(it.quantity * it.unitPrice - it.discount, locale)}</td>
      </tr>`
    )
    .join("");

  const extra = (data.extraFields || [])
    .map((f) => `<div class="kv"><span>${f.label}</span><b>${f.value}</b></div>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — ${data.id.slice(0, 8)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { size:A4; margin:9mm 8mm 10mm; }
  body { font-family:'Cairo',sans-serif; font-size:12.5px; color:#111827; background:#e5e7eb; }
  .inv { max-width:190mm; margin:0 auto; background:#fff; }
  .screen-pad { padding:14px; }
  /* header: one compact band */
  .head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:12px 16px 10px; border-bottom:3px solid ${theme.accent}; }
  .co h1 { font-size:17px; font-weight:700; line-height:1.3; }
  .co p { font-size:10.5px; color:#6b7280; margin-top:2px; }
  .doc { text-align:end; }
  .doc .t { font-size:15px; font-weight:700; color:${theme.accent}; }
  .doc .n { font-size:12px; font-weight:600; margin-top:2px; }
  .doc .d { font-size:11px; color:#6b7280; }
  /* info: 3 compact columns */
  .info { display:grid; grid-template-columns:1.2fr 1fr 1fr; gap:12px; padding:10px 16px; border-bottom:1px solid #e5e7eb; }
  .info.cols2 { grid-template-columns:1.2fr 1fr; }
  .info h3 { font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:.04em; margin-bottom:3px; }
  .info .name { font-size:13px; font-weight:700; }
  .info p { font-size:11.5px; line-height:1.65; color:#374151; }
  .info p b { color:#111827; }
  .kv { display:flex; justify-content:space-between; gap:8px; font-size:11.5px; padding:1px 0; }
  .kv span { color:#6b7280; } .kv b { font-weight:600; }
  /* table: compact but readable */
  table { width:100%; border-collapse:collapse; }
  thead { display:table-header-group; }
  thead th { font-size:10.5px; font-weight:700; color:${theme.accent}; text-align:center; padding:5px 6px; border-bottom:2px solid ${theme.accent}; white-space:nowrap; }
  thead th.item-h { text-align:start; }
  tbody td { font-size:12px; padding:4px 6px; border-bottom:1px solid #f0f0f0; vertical-align:top; }
  tbody td.c { text-align:center; white-space:nowrap; }
  tbody td.item { text-align:start; }
  tbody td.b { font-weight:700; }
  tr { break-inside:avoid; }
  .tbl-wrap { padding:6px 16px 0; }
  /* bottom: summary side-by-side */
  .bottom { display:flex; gap:14px; padding:10px 16px 12px; align-items:flex-start; }
  .side { flex:1; min-width:0; display:flex; flex-direction:column; gap:8px; }
  .totals { width:245px; flex:none; }
  .trow { display:flex; justify-content:space-between; font-size:12px; padding:2px 0; }
  .trow.grand { border-top:2px solid ${theme.accent}; margin-top:5px; padding-top:6px; font-size:16px; font-weight:700; color:${theme.accent}; }
  .disc { color:#dc2626; }
  .box { border:1px solid #e5e7eb; border-radius:6px; padding:7px 10px; font-size:11.5px; break-inside:avoid; }
  .box h4 { font-size:10.5px; font-weight:700; margin-bottom:4px; }
  .box.pay { background:#fffbeb; border-color:#fcd34d; } .box.pay h4 { color:#92400e; }
  .box.debt { background:#eff6ff; border-color:#93c5fd; } .box.debt h4 { color:#1d4ed8; }
  .box .r { display:flex; justify-content:space-between; gap:8px; padding:1px 0; }
  .box .r span:first-child { color:#57534e; }
  .due { font-weight:700; color:#dc2626; } .ok { font-weight:700; color:#059669; }
  .notes { font-size:11.5px; color:#4b5563; background:#f8fafc; border-radius:6px; padding:7px 10px; }
  .notes b { color:#6b7280; font-size:10.5px; }
  .foot { display:flex; justify-content:space-between; font-size:10.5px; color:#9ca3af; padding:8px 16px; border-top:1px solid #e5e7eb; }
  .print-btn { position:fixed; bottom:20px; inset-inline-start:20px; background:${theme.accent}; color:#fff; border:none; padding:10px 20px; border-radius:8px; font-family:inherit; font-size:13px; font-weight:600; cursor:pointer; z-index:100; }
  @media print {
    body { background:#fff; } .screen-pad { padding:0; } .inv { max-width:none; }
    .print-btn { display:none; }
  }
</style>
</head>
<body>
<div class="screen-pad"><div class="inv">
  <div class="head">
    <div class="co"><h1>${data.companyName}</h1>${companyLine ? `<p>${companyLine}</p>` : ""}</div>
    <div class="doc"><div class="t">${title}</div><div class="n">#${data.id.slice(0, 8)}</div><div class="d">${fdate(data.date, c)}</div></div>
  </div>

  <div class="info${payCol ? "" : " cols2"}">
    <div><h3>${partyTitle}</h3><p class="name">${data.counterpartyName}</p>${partyLine ? `<p>${partyLine}</p>` : ""}</div>
    <div><h3>${L.details}</h3>
      ${pm ? `<div class="kv"><span>${L.payMethod}</span><b>${pm}</b></div>` : ""}
      ${ps ? `<div class="kv"><span>${L.payStatus}</span><b>${ps}</b></div>` : ""}
      ${data.engineerName ? `<div class="kv"><span>${L.engineer}</span><b>${data.engineerName}</b></div>` : ""}
      ${data.warehouseName ? `<div class="kv"><span>${L.warehouse}</span><b>${data.warehouseName}</b></div>` : ""}
      ${extra}
    </div>
    ${payCol}
  </div>

  <div class="tbl-wrap"><table>
    <thead><tr><th>#</th><th class="item-h">${L.product}</th><th>${L.qty}</th><th>${L.price}</th><th>${L.discount}</th><th>${L.total}</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table></div>

  <div class="bottom">
    <div class="side">
      ${showDebt ? `<div class="box debt"><h4>${L.account}</h4>
        <div class="r"><span>${L.totalOwed}</span><b>${money(debt, c)}</b></div>
        <div class="r"><span>${L.lastPayment}</span><b>${lastPay}</b></div>
        ${added > 0 ? `<div class="r"><span>${L.addedDebt}</span><b class="due">+${money(added, c)}</b></div>` : ""}
      </div>` : ""}
      ${showPay && due > 0 ? `<div class="box pay"><h4>${L.paySummary}</h4>
        <div class="r"><span>${L.paidCash}</span><b>${money(paid, c)}</b></div>
        <div class="r"><span>${L.dueCredit}</span><b class="due">${money(due, c)}</b></div>
      </div>` : ""}
      ${data.notes ? `<div class="notes"><b>${L.notes}:</b> ${data.notes}</div>` : ""}
    </div>
    <div class="totals">
      <div class="trow"><span>${L.subtotal}</span><span>${money(data.subtotal, c)}</span></div>
      ${disc ? `<div class="trow disc"><span>${disc.label}</span><span>−${money(disc.amount, c)}</span></div>` : ""}
      ${data.taxRate > 0 ? `<div class="trow"><span>${L.tax} (${data.taxRate}%)</span><span>${money(data.taxAmount, c)}</span></div>` : ""}
      <div class="trow grand"><span>${L.total}</span><span>${money(data.total, c)}</span></div>
    </div>
  </div>

  <div class="foot"><span>${L.thanks}</span><span>${L.printDate}: ${fdate(new Date().toISOString(), c)}</span></div>
</div></div>
<button class="print-btn" onclick="window.print()">${L.printInvoice}</button>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════
// Receipt — dedicated thermal layout (58mm / 80mm)
// ═══════════════════════════════════════════════════════════════════

export function generateReceiptHtml(data: InvoiceData, width: ReceiptWidth = 80): string {
  const c = ctx(data);
  const { L, locale, theme, title, dir, lang } = c;
  const pm = payMethodLabel(data, c);
  const ps = payStatusLabel(data, c);
  const disc = discountDisplay(data);
  const paid = Number(data.paidAmount) || 0;
  const due = dueOf(data);
  const showPay = hasPayment(data);
  const showDebt = hasDebt(data);
  const debt = Number(data.customerDebt) || 0;
  const added = Number(data.invoiceAddedDebt) || 0;
  const mm = width === 58 ? 58 : 80;
  const lastPay = data.customerLastPayment
    ? `${money(data.customerLastPayment.amount, c)} ${fdate(data.customerLastPayment.date, c)}`
    : L.noPayments;

  // stacked two-line rows: readable on both 58mm and 80mm
  const itemRows = data.items
    .map((it, i) => {
      const lineTotal = it.quantity * it.unitPrice - it.discount;
      return `<div class="it">
        <div class="nm">${i + 1}. ${it.name}</div>
        <div class="ln"><span>${num(it.quantity, locale)} × ${num(it.unitPrice, locale)}${it.discount > 0 ? ` (−${num(it.discount, locale)})` : ""}</span><b>${num(lineTotal, locale)}</b></div>
      </div>`;
    })
    .join("");

  const extra = (data.extraFields || [])
    .map((f) => `<div class="m"><span>${f.label}</span><b>${f.value}</b></div>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — ${data.id.slice(0, 8)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { size:${mm}mm auto; margin:2mm; }
  body { font-family:'Cairo',sans-serif; font-size:11px; color:#000; background:#e5e7eb; display:flex; justify-content:center; }
  .rc { width:${mm}mm; max-width:100%; background:#fff; padding:2mm 2.5mm 3mm; }
  .ch { text-align:center; padding-bottom:2mm; }
  .ch h1 { font-size:13px; font-weight:700; }
  .ch p { font-size:10px; color:#333; }
  .ch .t { font-size:11.5px; font-weight:700; margin-top:1mm; }
  hr.d { border:none; border-top:1px dashed #000; margin:2mm 0; }
  .m { display:flex; justify-content:space-between; gap:2mm; font-size:10.5px; padding:.4mm 0; }
  .m span { color:#333; } .m b { font-weight:600; text-align:end; }
  .sec { font-size:9.5px; font-weight:700; color:#333; margin-bottom:1mm; }
  .it { padding:1mm 0; border-bottom:1px dotted #999; break-inside:avoid; }
  .it:last-child { border-bottom:none; }
  .it .nm { font-size:11px; font-weight:600; overflow-wrap:anywhere; }
  .it .ln { display:flex; justify-content:space-between; font-size:10.5px; margin-top:.3mm; }
  .tot { margin-top:1mm; break-inside:avoid; }
  .tot .r { display:flex; justify-content:space-between; font-size:11px; padding:.4mm 0; }
  .tot .grand { border-top:1px solid #000; border-bottom:1px solid #000; margin-top:1mm; padding:1.5mm 0; font-size:15px; font-weight:700; }
  .pay { margin-top:1.5mm; font-size:11px; break-inside:avoid; }
  .pay .r { display:flex; justify-content:space-between; padding:.4mm 0; }
  .pay .due { font-weight:700; }
  .dbt { margin-top:1.5mm; font-size:10.5px; break-inside:avoid; }
  .dbt .r { display:flex; justify-content:space-between; gap:2mm; padding:.4mm 0; }
  .nts { font-size:10px; margin-top:1.5mm; }
  .ft { text-align:center; font-size:10px; color:#333; margin-top:2mm; }
  .print-btn { position:fixed; bottom:16px; background:${theme.accent}; color:#fff; border:none; padding:10px 20px; border-radius:8px; font-family:inherit; font-size:13px; font-weight:600; cursor:pointer; z-index:100; }
  @media print {
    body { background:#fff; display:block; } .rc { width:auto; }
    .print-btn { display:none; }
  }
</style>
</head>
<body>
<div class="rc">
  <div class="ch">
    <h1>${data.companyName}</h1>
    ${data.companyPhone ? `<p>${data.companyPhone}</p>` : ""}
    ${data.companyAddress ? `<p>${data.companyAddress}</p>` : ""}
    <div class="t">${title} #${data.id.slice(0, 8)}</div>
  </div>
  <hr class="d">
  <div class="m"><span>${data.type === "purchase" ? L.supplier : L.customer}</span><b>${data.counterpartyName}</b></div>
  ${data.counterpartyPhone ? `<div class="m"><span>☎</span><b>${data.counterpartyPhone}</b></div>` : ""}
  <div class="m"><span>${L.date}</span><b>${fdate(data.date, c)}</b></div>
  ${pm ? `<div class="m"><span>${L.payMethod}</span><b>${pm}</b></div>` : ""}
  ${ps ? `<div class="m"><span>${L.payStatus}</span><b>${ps}</b></div>` : ""}
  ${data.engineerName ? `<div class="m"><span>${L.engineer}</span><b>${data.engineerName}</b></div>` : ""}
  ${data.warehouseName ? `<div class="m"><span>${L.warehouse}</span><b>${data.warehouseName}</b></div>` : ""}
  ${extra}
  <hr class="d">
  <div class="sec">${L.items} (${data.items.length})</div>
  ${itemRows}
  <hr class="d">
  <div class="tot">
    <div class="r"><span>${L.subtotal}</span><span>${money(data.subtotal, c)}</span></div>
    ${disc ? `<div class="r"><span>${disc.label}</span><span>−${money(disc.amount, c)}</span></div>` : ""}
    ${data.taxRate > 0 ? `<div class="r"><span>${L.tax} (${data.taxRate}%)</span><span>${money(data.taxAmount, c)}</span></div>` : ""}
    <div class="r grand"><span>${L.total}</span><span>${money(data.total, c)}</span></div>
  </div>
  ${showPay ? `<div class="pay">
    <div class="r"><span>${L.paidCash}</span><span>${money(paid, c)}</span></div>
    <div class="r due"><span>${L.dueCredit}</span><span>${due > 0 ? money(due, c) : L.settledState}</span></div>
  </div>` : ""}
  ${showDebt ? `<div class="dbt">
    <div class="r"><span>${L.totalOwed}</span><b>${money(debt, c)}</b></div>
    <div class="r"><span>${L.lastPayment}</span><b>${lastPay}</b></div>
    ${added > 0 ? `<div class="r"><span>${L.addedDebt}</span><b>+${money(added, c)}</b></div>` : ""}
  </div>` : ""}
  ${data.notes ? `<div class="nts">${L.notes}: ${data.notes}</div>` : ""}
  <div class="ft">${L.thanks}<br>${L.printDate}: ${fdate(new Date().toISOString(), c)}</div>
</div>
<button class="print-btn" onclick="window.print()">${L.printReceipt}</button>
</body>
</html>`;
}
