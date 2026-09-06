export interface InvoiceItem {
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
}

export interface InvoiceData {
  type: "sale" | "purchase" | "contract" | "return";
  subType?: string;
  id: string;
  date: string;
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
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod?: string;
  paymentStatus?: string;
  notes?: string;
  extraFields?: { label: string; value: string }[];
}

interface InvoiceTheme {
  label: string;
  from: string;
  to: string;
  accent: string;
  bg: string;
  soft: string;
}

const SALE_SUBTHEMES: Record<string, InvoiceTheme> = {
  MACHINE_SALE: {
    label: "فاتورة بيع جهاز",
    from: "#0284c7",
    to: "#0369a1",
    accent: "#0284c7",
    bg: "#f8fafc",
    soft: "#e0f2fe",
  },
  SPARE_PART_SALE: {
    label: "فاتورة بيع قطع غيار",
    from: "#059669",
    to: "#047857",
    accent: "#059669",
    bg: "#f8fafc",
    soft: "#d1fae5",
  },
  TRADE_IN: {
    label: "فاتورة استبدال",
    from: "#d97706",
    to: "#b45309",
    accent: "#d97706",
    bg: "#f8fafc",
    soft: "#fef3c7",
  },
};

const BASE_THEMES: Record<string, InvoiceTheme> = {
  sale: {
    label: "فاتورة بيع",
    from: "#0284c7",
    to: "#0369a1",
    accent: "#0284c7",
    bg: "#f8fafc",
    soft: "#e0f2fe",
  },
  purchase: {
    label: "فاتورة شراء",
    from: "#7c3aed",
    to: "#6d28d9",
    accent: "#7c3aed",
    bg: "#f8fafc",
    soft: "#ede9fe",
  },
  contract: {
    label: "عقد صيانة",
    from: "#0d9488",
    to: "#0f766e",
    accent: "#0d9488",
    bg: "#f8fafc",
    soft: "#ccfbf1",
  },
  return: {
    label: "مرتجع",
    from: "#dc2626",
    to: "#b91c1c",
    accent: "#dc2626",
    bg: "#f8fafc",
    soft: "#fee2e2",
  },
};

function getTheme(data: InvoiceData): InvoiceTheme {
  if (data.type === "sale" && data.subType && SALE_SUBTHEMES[data.subType]) {
    return SALE_SUBTHEMES[data.subType];
  }
  return BASE_THEMES[data.type] || BASE_THEMES.sale;
}

const PAYMENT_METHOD_AR: Record<string, string> = {
  CASH: "كاش",
  CREDIT: "أجل",
  INSTALLMENT: "أجل",
  MIXED: "أجل",
};

const PAYMENT_STATUS_AR: Record<string, string> = {
  PENDING: "معلق",
  PARTIAL: "جزئي",
  PAID: "مدفوع",
  OVERDUE: "متأخر",
};

export function generateInvoiceHtml(data: InvoiceData): string {
  const theme = getTheme(data);
  const typeLabel = theme.label;
  const paymentMethod = data.paymentMethod ? PAYMENT_METHOD_AR[data.paymentMethod] || data.paymentMethod : "";
  const paymentStatus = data.paymentStatus ? PAYMENT_STATUS_AR[data.paymentStatus] || data.paymentStatus : "";

  const itemsRows = data.items
    .map(
      (item, i) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:13px;">${i + 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${item.name}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;">${item.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;">${item.unitPrice.toLocaleString("ar-EG")}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;">${item.discount > 0 ? item.discount.toLocaleString("ar-EG") : "-"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;font-weight:600;">${((item.quantity * item.unitPrice - item.discount)).toLocaleString("ar-EG")}</td>
    </tr>`
    )
    .join("");

  const extraRows = data.extraFields
    ? data.extraFields
        .map(
          (f) => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;">
        <span style="color:#6b7280;font-size:13px;">${f.label}</span>
        <span style="font-weight:500;font-size:13px;">${f.value}</span>
      </div>`
        )
        .join("")
    : "";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${typeLabel} — ${data.id.slice(0, 8)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Cairo', sans-serif; background: #f9fafb; color: #111827; padding: 24px; }
  .invoice { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
  .header { background: linear-gradient(135deg, ${theme.from}, ${theme.to}); color: #fff; padding: 28px 32px; display: flex; justify-content: space-between; align-items: flex-start; }
  .header-right h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .header-right p { font-size: 13px; opacity: 0.85; }
  .header-left { text-align: left; }
  .header-left .badge { background: ${theme.soft}; color: ${theme.accent}; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; }
  .header-left .inv-number { font-size: 18px; font-weight: 700; margin-top: 6px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 24px 32px; border-bottom: 1px solid #e5e7eb; }
  .meta-box h3 { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .meta-box p { font-size: 13px; line-height: 1.7; }
  .meta-box .name { font-weight: 600; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: ${theme.soft}; padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600; color: ${theme.accent}; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid ${theme.accent}; }
  thead th:nth-child(2) { text-align: right; }
  .totals { padding: 20px 32px; display: flex; justify-content: flex-end; }
  .totals-box { width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
  .totals-row.total { border-top: 2px solid ${theme.accent}; margin-top: 8px; padding-top: 10px; font-size: 16px; font-weight: 700; color: ${theme.accent}; }
  .footer { padding: 20px 32px; background: ${theme.bg}; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
  .footer-notes { font-size: 12px; color: #6b7280; max-width: 60%; }
  .footer-date { font-size: 12px; color: #9ca3af; }
  .print-btn { position: fixed; bottom: 24px; left: 24px; background: ${theme.accent}; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-family: 'Cairo', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(2,132,199,0.3); z-index: 100; }
  .print-btn:hover { background: ${theme.to}; }
  @media print { .print-btn { display: none; } body { padding: 0; background: #fff; } .invoice { box-shadow: none; border-radius: 0; } }
</style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="header-right">
        <h1>${data.companyName}</h1>
        ${data.companyAddress ? `<p>${data.companyAddress}</p>` : ""}
        ${data.companyPhone ? `<p>${data.companyPhone}</p>` : ""}
      </div>
      <div class="header-left">
        <div class="badge">${typeLabel}</div>
        <div class="inv-number">#${data.id.slice(0, 8)}</div>
      </div>
    </div>

    <div class="meta">
      <div class="meta-box">
        <h3>${data.type === "purchase" ? "المورد" : data.type === "contract" ? "الطرف" : "العميل"}</h3>
        <p class="name">${data.counterpartyName}</p>
        ${data.counterpartyAddress ? `<p>${data.counterpartyAddress}</p>` : ""}
        ${data.counterpartyPhone ? `<p>${data.counterpartyPhone}</p>` : ""}
      </div>
      <div class="meta-box">
        <h3>التفاصيل</h3>
        <p>التاريخ: ${new Date(data.date).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</p>
        ${paymentMethod ? `<p>طريقة الدفع: ${paymentMethod}</p>` : ""}
        ${paymentStatus ? `<p>حالة الدفع: ${paymentStatus}</p>` : ""}
        ${extraRows}
      </div>
    </div>

    <div style="padding: 0 32px;">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>المنتج</th>
            <th>الكمية</th>
            <th>سعر الوحدة</th>
            <th>الخصم</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="totals-box">
        <div class="totals-row">
          <span>المجموع الفرعي</span>
          <span>${data.subtotal.toLocaleString("ar-EG")} ج.م</span>
        </div>
        ${data.discount > 0 ? `
        <div class="totals-row">
          <span>الخصم</span>
          <span style="color:#dc2626;">-${data.discount.toLocaleString("ar-EG")} ج.م</span>
        </div>` : ""}
        ${data.taxRate > 0 ? `
        <div class="totals-row">
          <span>الضريبة (${data.taxRate}%)</span>
          <span>${data.taxAmount.toLocaleString("ar-EG")} ج.م</span>
        </div>` : ""}
        <div class="totals-row total">
          <span>الإجمالي</span>
          <span>${data.total.toLocaleString("ar-EG")} ج.م</span>
        </div>
      </div>
    </div>

    ${data.notes ? `
    <div style="padding: 0 32px 20px;">
      <div style="background:#f8fafc;border-radius:8px;padding:14px 18px;">
        <span style="font-size:12px;color:#6b7280;font-weight:600;">ملاحظات:</span>
        <p style="font-size:13px;margin-top:4px;color:#374151;">${data.notes}</p>
      </div>
    </div>` : ""}

    <div class="footer">
      <div class="footer-notes">
        ${data.type === "sale" ? "شكراً لتعاملكم معنا" : data.type === "purchase" ? "" : ""}
      </div>
      <div class="footer-date">تاريخ الطباعة: ${new Date().toLocaleDateString("ar-EG")}</div>
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">🖨️ طباعة الفاتورة</button>
</body>
</html>`;
}

export function generateReceiptHtml(data: InvoiceData): string {
  const theme = getTheme(data);
  const typeLabel = theme.label;
  const paymentMethod = data.paymentMethod ? PAYMENT_METHOD_AR[data.paymentMethod] || data.paymentMethod : "";
  const paymentStatus = data.paymentStatus ? PAYMENT_STATUS_AR[data.paymentStatus] || data.paymentStatus : "";

  const itemsRows = data.items
    .map(
      (item, i) => `
      <tr>
        <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:center;color:#6b7280;font-size:11px;">${i + 1}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:12px;">${item.name}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:11px;">${item.quantity}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:11px;">${item.unitPrice.toLocaleString("ar-EG")}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:11px;">${item.discount > 0 ? item.discount.toLocaleString("ar-EG") : "-"}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:11px;font-weight:600;">${(item.quantity * item.unitPrice - item.discount).toLocaleString("ar-EG")}</td>
      </tr>`
    )
    .join("");

  const extraRows = data.extraFields
    ? data.extraFields
        .map(
          (f) => `
        <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px;">
          <span style="color:#6b7280;">${f.label}</span>
          <span style="font-weight:500;">${f.value}</span>
        </div>`
        )
        .join("")
    : "";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ريسيت — ${data.id.slice(0, 8)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Cairo', sans-serif; background: #f3f4f6; display: flex; justify-content: center; padding: 24px; }
  .receipt { width: 380px; background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); overflow: hidden; }
  .receipt-header { text-align: center; padding: 18px 16px 12px; border-bottom: 2px dashed ${theme.accent}; }
  .receipt-header h1 { font-size: 16px; font-weight: 700; color: ${theme.accent}; }
  .receipt-header p { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .receipt-header .type { font-size: 12px; font-weight: 700; color: ${theme.accent}; margin-top: 6px; }
  .receipt-body { padding: 14px 16px; }
  .receipt-section { padding-bottom: 10px; border-bottom: 1px dashed #e5e7eb; margin-bottom: 10px; }
  .receipt-section h4 { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .receipt-meta-row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
  .receipt-meta-row .label { color: #6b7280; }
  .receipt-meta-row .value { font-weight: 500; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: ${theme.soft}; padding: 5px 4px; text-align: center; font-size: 10px; font-weight: 600; color: ${theme.accent}; text-transform: uppercase; border-bottom: 1px solid ${theme.accent}; }
  thead th:nth-child(2) { text-align: right; }
  .receipt-totals .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
  .receipt-totals .row.total { border-top: 2px solid ${theme.accent}; margin-top: 6px; padding-top: 8px; font-size: 15px; font-weight: 700; color: ${theme.accent}; }
  .receipt-notes { background: ${theme.soft}; border-radius: 6px; padding: 10px 12px; margin-top: 8px; }
  .receipt-notes .label { font-size: 10px; color: ${theme.accent}; font-weight: 600; }
  .receipt-notes p { font-size: 11px; color: #374151; margin-top: 2px; }
  .receipt-footer { text-align: center; padding: 12px 16px; border-top: 2px dashed ${theme.accent}; font-size: 11px; color: #9ca3af; }
  .print-btn { position: fixed; bottom: 24px; left: 24px; background: ${theme.accent}; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-family: 'Cairo', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(2,132,199,0.3); z-index: 100; }
  .print-btn:hover { background: ${theme.to}; }
  @media print {
    .print-btn { display: none; }
    body { padding: 0; background: #fff; }
    .receipt { box-shadow: none; border-radius: 0; width: 100%; max-width: 380px; }
  }
</style>
</head>
<body>
  <div class="receipt">
    <div class="receipt-header">
      <h1>${data.companyName}</h1>
      ${data.companyAddress ? `<p>${data.companyAddress}</p>` : ""}
      ${data.companyPhone ? `<p>${data.companyPhone}</p>` : ""}
      <div class="type">${typeLabel}</div>
    </div>

    <div class="receipt-body">
      <div class="receipt-section">
        <h4>${data.type === "purchase" ? "المورد" : "العميل"}</h4>
        <div class="receipt-meta-row">
          <span class="label">الاسم</span>
          <span class="value">${data.counterpartyName}</span>
        </div>
        ${data.counterpartyAddress ? `<div class="receipt-meta-row"><span class="label">العنوان</span><span class="value">${data.counterpartyAddress}</span></div>` : ""}
        ${data.counterpartyPhone ? `<div class="receipt-meta-row"><span class="label">الهاتف</span><span class="value">${data.counterpartyPhone}</span></div>` : ""}
      </div>

      <div class="receipt-section">
        <h4>التفاصيل</h4>
        <div class="receipt-meta-row">
          <span class="label">رقم</span>
          <span class="value">#${data.id.slice(0, 8)}</span>
        </div>
        <div class="receipt-meta-row">
          <span class="label">التاريخ</span>
          <span class="value">${new Date(data.date).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</span>
        </div>
        ${paymentMethod ? `<div class="receipt-meta-row"><span class="label">طريقة الدفع</span><span class="value">${paymentMethod}</span></div>` : ""}
        ${paymentStatus ? `<div class="receipt-meta-row"><span class="label">حالة الدفع</span><span class="value">${paymentStatus}</span></div>` : ""}
        ${extraRows}
      </div>

      <div class="receipt-section">
        <h4>المنتجات</h4>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>المنتج</th>
              <th>الكمية</th>
              <th>السعر</th>
              <th>الخصم</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
      </div>

      <div class="receipt-totals">
        <div class="row">
          <span>المجموع الفرعي</span>
          <span>${data.subtotal.toLocaleString("ar-EG")} ج.م</span>
        </div>
        ${data.discount > 0 ? `
        <div class="row" style="color:#dc2626;">
          <span>الخصم</span>
          <span>-${data.discount.toLocaleString("ar-EG")} ج.م</span>
        </div>` : ""}
        ${data.taxRate > 0 ? `
        <div class="row">
          <span>الضريبة (${data.taxRate}%)</span>
          <span>${data.taxAmount.toLocaleString("ar-EG")} ج.م</span>
        </div>` : ""}
        <div class="row total">
          <span>الإجمالي</span>
          <span>${data.total.toLocaleString("ar-EG")} ج.م</span>
        </div>
      </div>

      ${data.notes ? `
      <div class="receipt-notes">
        <span class="label">ملاحظات:</span>
        <p>${data.notes}</p>
      </div>` : ""}
    </div>

    <div class="receipt-footer">
      <p>شكراً لتعاملكم</p>
      <p style="margin-top:2px;">تاريخ الطباعة: ${new Date().toLocaleDateString("ar-EG")}</p>
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">🖨️ طباعة الريسيت</button>
</body>
</html>`;
}
