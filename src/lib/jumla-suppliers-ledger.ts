/**
 * Jumla Machines (شركة جملة آلات) Suppliers Detailed Ledger.
 * Source: ده ملف موردين. تبع شركه الجمله الات فقط.md
 * Exact accounting movements with dates, document numbers, types, debit, credit, running balance, and notes.
 */

export interface LedgerMovement {
  date: string;
  docNumber: string;
  docType: "فاتورة مشتريات" | "كاش" | "صرف نقدية" | "استلام نقدية" | "رصيد افتتاحي موردين";
  debit: number;   // مدين (مسدد للمورد / دفعات نقدية)
  credit: number;  // دائن (مستحق للمورد / فواتير مشتريات)
  runningBalance: number; // الرصيد التراكمي الدائن
  notes: string;
}

export interface SupplierLedger {
  code: number;
  name: string;
  contactName: string;
  finalBalance: number; // دائن
  lastPaymentDate: string | null;
  lastPaymentAmount: number;
  movements: LedgerMovement[];
}

export const JUMLA_SUPPLIERS_LEDGER: Record<string, SupplierLedger> = {
  "رضا امين": {
    code: 15,
    name: "رضا امين",
    contactName: "م. رضا امين",
    finalBalance: 826000,
    lastPaymentDate: "2026/09/10",
    lastPaymentAmount: 90000,
    movements: [
      { date: "2025/12/24", docNumber: "16", docType: "فاتورة مشتريات", debit: 0, credit: 226750, runningBalance: 226750, notes: "فاتورة مشتريات" },
      { date: "2025/12/24", docNumber: "16", docType: "كاش", debit: 100000, credit: 0, runningBalance: 126750, notes: "سداد كاش فاتورة 16" },
      { date: "2025/12/24", docNumber: "18", docType: "فاتورة مشتريات", debit: 0, credit: 103000, runningBalance: 229750, notes: "فاتورة مشتريات" },
      { date: "2025/12/24", docNumber: "18", docType: "كاش", debit: 103000, credit: 0, runningBalance: 126750, notes: "سداد كاش فاتورة 18" },
      { date: "2025/12/28", docNumber: "19", docType: "فاتورة مشتريات", debit: 0, credit: 66000, runningBalance: 192750, notes: "فاتورة مشتريات" },
      { date: "2026/01/27", docNumber: "21", docType: "فاتورة مشتريات", debit: 0, credit: 189750, runningBalance: 382500, notes: "فاتورة مشتريات" },
      { date: "2026/02/01", docNumber: "30", docType: "صرف نقدية", debit: 100000, credit: 0, runningBalance: 282500, notes: "2 دفعة نقدية" },
      { date: "2026/02/01", docNumber: "23", docType: "فاتورة مشتريات", debit: 0, credit: 55000, runningBalance: 337500, notes: "فاتورة مشتريات" },
      { date: "2026/02/23", docNumber: "25", docType: "فاتورة مشتريات", debit: 0, credit: 408250, runningBalance: 745750, notes: "فاتورة مشتريات" },
      { date: "2026/09/10", docNumber: "45", docType: "فاتورة مشتريات", debit: 0, credit: 170250, runningBalance: 916000, notes: "فاتورة مشتريات رقم 45 (6 آلات 2506، 7 آلات 3206-3252، 2 آلات TA5056I، 3 آلات 4002-4056، 5 طابعات كيوسيرا)" },
      { date: "2026/09/10", docNumber: "45", docType: "كاش", debit: 90000, credit: 0, runningBalance: 826000, notes: "سداد كاش فاتورة 45" },
    ],
  },
  "الدولية م. محمود صبري": {
    code: 10,
    name: "الدولية م. محمود صبري",
    contactName: "م. محمود صبري",
    finalBalance: 368250,
    lastPaymentDate: "2026/02/01",
    lastPaymentAmount: 50000,
    movements: [
      { date: "2026/02/01", docNumber: "رصيد معتمد", docType: "رصيد افتتاحي موردين", debit: 0, credit: 368250, runningBalance: 368250, notes: "رصيد مؤكد معتمد لحساب الدولية م. محمود صبري (تاريخ آخر دفعة: 2026/02/01 بقيمة 50,000 ج.م)" },
    ],
  },
  "أسعد": {
    code: 11,
    name: "أسعد",
    contactName: "أسعد",
    finalBalance: 342000,
    lastPaymentDate: "2026/08/31",
    lastPaymentAmount: 73000,
    movements: [
      { date: "2025/08/16", docNumber: "1", docType: "فاتورة مشتريات", debit: 0, credit: 85000, runningBalance: 85000, notes: "فاتورة مشتريات" },
      { date: "2025/08/16", docNumber: "1", docType: "كاش", debit: 40000, credit: 0, runningBalance: 45000, notes: "سداد كاش" },
      { date: "2025/09/30", docNumber: "16", docType: "صرف نقدية", debit: 45000, credit: 0, runningBalance: 0, notes: "صرف نقدية دفعة" },
      { date: "2025/11/06", docNumber: "11", docType: "فاتورة مشتريات", debit: 0, credit: 53000, runningBalance: 53000, notes: "فاتورة مشتريات" },
      { date: "2025/11/06", docNumber: "11", docType: "كاش", debit: 53000, credit: 0, runningBalance: 0, notes: "سداد كاش" },
      { date: "2025/11/23", docNumber: "13", docType: "فاتورة مشتريات", debit: 0, credit: 145000, runningBalance: 145000, notes: "فاتورة مشتريات" },
      { date: "2025/11/23", docNumber: "13", docType: "كاش", debit: 40000, credit: 0, runningBalance: 105000, notes: "سداد كاش" },
      { date: "2026/03/14", docNumber: "27", docType: "فاتورة مشتريات", debit: 0, credit: 19, runningBalance: 105019, notes: "فروق تسوية" },
      { date: "2026/03/14", docNumber: "27", docType: "كاش", debit: 19, credit: 0, runningBalance: 105000, notes: "سداد نقدي" },
      { date: "2026/03/14", docNumber: "28", docType: "فاتورة مشتريات", debit: 0, credit: 6, runningBalance: 105006, notes: "فروق تسوية" },
      { date: "2026/03/14", docNumber: "28", docType: "كاش", debit: 6, credit: 0, runningBalance: 105000, notes: "سداد نقدي" },
      { date: "2026/08/31", docNumber: "42", docType: "فاتورة مشتريات", debit: 0, credit: 310000, runningBalance: 415000, notes: "فاتورة مشتريات رقم 42 (إجمالي 314,250 ج.م - خصم 4,250 ج.م = صافي 310,000 ج.م، تشمل 12 صنف آلات كيوسيرا)" },
      { date: "2026/08/31", docNumber: "42", docType: "كاش", debit: 73000, credit: 0, runningBalance: 342000, notes: "سداد كاش فاتورة 42" },
    ],
  },
  "سامح الشرقاوي": {
    code: 9,
    name: "سامح الشرقاوي",
    contactName: "سامح الشرقاوي",
    finalBalance: 220500,
    lastPaymentDate: "2026/08/04",
    lastPaymentAmount: 50000,
    movements: [
      { date: "2025/07/13", docNumber: "2", docType: "رصيد افتتاحي موردين", debit: 0, credit: 1150000, runningBalance: 1150000, notes: "رصيد أول مدة موردين - 2" },
      { date: "2025/07/13", docNumber: "2", docType: "صرف نقدية", debit: 95000, credit: 0, runningBalance: 1055000, notes: "دفعة نقدية" },
      { date: "2025/07/13", docNumber: "2", docType: "صرف نقدية", debit: 28000, credit: 0, runningBalance: 1027000, notes: "دفعة نقدية" },
      { date: "2025/07/13", docNumber: "2", docType: "صرف نقدية", debit: 116000, credit: 0, runningBalance: 911000, notes: "دفعة نقدية" },
      { date: "2025/07/13", docNumber: "2", docType: "صرف نقدية", debit: 100000, credit: 0, runningBalance: 811000, notes: "دفعة نقدية" },
      { date: "2025/07/13", docNumber: "2", docType: "صرف نقدية", debit: 141000, credit: 0, runningBalance: 670000, notes: "دفعة نقدية" },
      { date: "2025/08/04", docNumber: "3", docType: "صرف نقدية", debit: 85000, credit: 0, runningBalance: 585000, notes: "إيداع بنكي" },
      { date: "2025/08/04", docNumber: "4", docType: "صرف نقدية", debit: 35000, credit: 0, runningBalance: 550000, notes: "صرف نقدية" },
      { date: "2025/08/04", docNumber: "4", docType: "صرف نقدية", debit: 50000, credit: 0, runningBalance: 500000, notes: "صرف نقدية" },
      { date: "2025/08/04", docNumber: "1", docType: "استلام نقدية", debit: 0, credit: 92000, runningBalance: 592000, notes: "عدد 8 آلة كيوسيرا" },
      { date: "2025/08/04", docNumber: "1", docType: "استلام نقدية", debit: 0, credit: 67860, runningBalance: 659860, notes: "الجامبو يوم الحاوية" },
      { date: "2025/10/07", docNumber: "18", docType: "صرف نقدية", debit: 88860, credit: 0, runningBalance: 571000, notes: "صرف نقدية" },
      { date: "2025/10/22", docNumber: "22", docType: "صرف نقدية", debit: 50000, credit: 0, runningBalance: 521000, notes: "دفعة نقدية" },
      { date: "2025/10/28", docNumber: "23", docType: "صرف نقدية", debit: 50000, credit: 0, runningBalance: 471000, notes: "دفعة 28/10" },
      { date: "2025/12/24", docNumber: "17", docType: "فاتورة مشتريات", debit: 0, credit: 95500, runningBalance: 566500, notes: "فاتورة مشتريات" },
      { date: "2026/02/01", docNumber: "32", docType: "صرف نقدية", debit: 566500, credit: 0, runningBalance: 0, notes: "تصفية حساب" },
      { date: "2026/02/01", docNumber: "24", docType: "فاتورة مشتريات", debit: 0, credit: 117500, runningBalance: 117500, notes: "فاتورة مشتريات" },
      { date: "2026/02/01", docNumber: "24", docType: "كاش", debit: 10000, credit: 0, runningBalance: 107500, notes: "سداد كاش فاتورة 24" },
      { date: "2026/02/01", docNumber: "63", docType: "استلام نقدية", debit: 0, credit: 20000, runningBalance: 127500, notes: "ضريبة" },
      { date: "2026/08/04", docNumber: "39", docType: "فاتورة مشتريات", debit: 0, credit: 143000, runningBalance: 270500, notes: "فاتورة مشتريات رقم 39 (14 آلة كيوسيرا: 5052ci, 6052, 4052, 5053, 4053ci, 406)" },
      { date: "2026/08/04", docNumber: "39", docType: "كاش", debit: 50000, credit: 0, runningBalance: 220500, notes: "سداد كاش فاتورة 39" },
    ],
  },
  "اليسرى": {
    code: 12,
    name: "اليسرى",
    contactName: "اليسرى",
    finalBalance: 210900,
    lastPaymentDate: "2026/09/05",
    lastPaymentAmount: 20000,
    movements: [
      { date: "2025/09/23", docNumber: "5", docType: "رصيد افتتاحي موردين", debit: 0, credit: 7000, runningBalance: 7000, notes: "رصيد أول مدة مورد - 5" },
      { date: "2025/09/23", docNumber: "3", docType: "فاتورة مشتريات", debit: 0, credit: 82400, runningBalance: 89400, notes: "فاتورة مشتريات" },
      { date: "2025/09/23", docNumber: "13", docType: "صرف نقدية", debit: 2250, credit: 0, runningBalance: 87150, notes: "برنتر 5031" },
      { date: "2025/10/27", docNumber: "9", docType: "فاتورة مشتريات", debit: 0, credit: 82750, runningBalance: 169900, notes: "فاتورة مشتريات" },
      { date: "2025/10/27", docNumber: "9", docType: "كاش", debit: 10000, credit: 0, runningBalance: 159900, notes: "سداد كاش" },
      { date: "2025/11/06", docNumber: "12", docType: "فاتورة مشتريات", debit: 0, credit: 8000, runningBalance: 167900, notes: "فاتورة مشتريات" },
      { date: "2026/02/01", docNumber: "31", docType: "صرف نقدية", debit: 21000, credit: 0, runningBalance: 146900, notes: "3 ماكينات كيوسيرا" },
      { date: "2026/09/05", docNumber: "43", docType: "فاتورة مشتريات", debit: 0, credit: 84000, runningBalance: 230900, notes: "فاتورة مشتريات رقم 43 (8 ماكينات كيوسيرا: 5006CI, 4006CI)" },
      { date: "2026/09/05", docNumber: "43", docType: "كاش", debit: 20000, credit: 0, runningBalance: 210900, notes: "سداد كاش فاتورة 43" },
    ],
  },
  "نور الدسوقي المنصورة": {
    code: 14,
    name: "نور الدسوقي المنصورة",
    contactName: "نور الدسوقي",
    finalBalance: 183500,
    lastPaymentDate: "2026/08/30",
    lastPaymentAmount: 116500,
    movements: [
      { date: "2025/10/12", docNumber: "8", docType: "فاتورة مشتريات", debit: 0, credit: 177750, runningBalance: 177750, notes: "فاتورة مشتريات" },
      { date: "2025/10/12", docNumber: "8", docType: "كاش", debit: 102600, credit: 0, runningBalance: 75150, notes: "سداد كاش" },
      { date: "2025/12/10", docNumber: "26", docType: "صرف نقدية", debit: 10000, credit: 0, runningBalance: 65150, notes: "تحويل من م. رضا" },
      { date: "2025/12/10", docNumber: "26", docType: "صرف نقدية", debit: 4850, credit: 0, runningBalance: 60300, notes: "الآلة 305 + حبر الأنك" },
      { date: "2025/12/17", docNumber: "38", docType: "صرف نقدية", debit: 1050, credit: 0, runningBalance: 59250, notes: "مجموعة خروج 4000 + رول تنظيف" },
      { date: "2026/02/01", docNumber: "35", docType: "صرف نقدية", debit: 49000, credit: 0, runningBalance: 10250, notes: "صرف نقدية" },
      { date: "2026/02/17", docNumber: "39", docType: "صرف نقدية", debit: 10250, credit: 0, runningBalance: 0, notes: "من حساب آلات فرع 45" },
      { date: "2026/08/30", docNumber: "40", docType: "فاتورة مشتريات", debit: 0, credit: 300000, runningBalance: 300000, notes: "فاتورة مشتريات رقم 40 (إجمالي 300,000 ج.م، خصم 1500 ج.م)" },
      { date: "2026/08/30", docNumber: "40", docType: "كاش", debit: 116500, credit: 0, runningBalance: 183500, notes: "سداد كاش فاتورة 40" },
    ],
  },
  "هنداوي": {
    code: 5,
    name: "هنداوي",
    contactName: "هنداوي",
    finalBalance: 83000,
    lastPaymentDate: "2026/02/01",
    lastPaymentAmount: 45000,
    movements: [
      { date: "2026/01/11", docNumber: "20", docType: "فاتورة مشتريات", debit: 0, credit: 128000, runningBalance: 128000, notes: "فاتورة مشتريات رقم 20" },
      { date: "2026/02/01", docNumber: "37", docType: "صرف نقدية", debit: 45000, credit: 0, runningBalance: 83000, notes: "صرف نقدية دفعة مستند 37" },
    ],
  },
  "الظهراوي": {
    code: 13,
    name: "الظهراوي",
    contactName: "الظهراوي",
    finalBalance: 25250,
    lastPaymentDate: "2026/01/11",
    lastPaymentAmount: 1250,
    movements: [
      { date: "2025/09/23", docNumber: "5", docType: "فاتورة مشتريات", debit: 0, credit: 28000, runningBalance: 28000, notes: "فاتورة مشتريات رقم 5" },
      { date: "2025/09/24", docNumber: "6", docType: "فاتورة مشتريات", debit: 0, credit: 10000, runningBalance: 38000, notes: "فاتورة مشتريات رقم 6" },
      { date: "2025/10/19", docNumber: "20", docType: "صرف نقدية", debit: 11500, credit: 0, runningBalance: 26500, notes: "ماكينة 2002" },
      { date: "2026/01/11", docNumber: "28", docType: "صرف نقدية", debit: 1250, credit: 0, runningBalance: 25250, notes: "تانك 60" },
    ],
  },
  "طارق سرحان": {
    code: 17,
    name: "طارق سرحان",
    contactName: "طارق سرحان",
    finalBalance: 22500,
    lastPaymentDate: null,
    lastPaymentAmount: 0,
    movements: [
      { date: "2026/03/14", docNumber: "26", docType: "فاتورة مشتريات", debit: 0, credit: 22500, runningBalance: 22500, notes: "فاتورة مشتريات رقم 26" },
    ],
  },
};

export function getJumlaSupplierLedger(name: string): SupplierLedger | null {
  if (!name) return null;
  const clean = name.trim();
  // Exact or contains match
  for (const [key, val] of Object.entries(JUMLA_SUPPLIERS_LEDGER)) {
    if (key === clean || clean.includes(key) || key.includes(clean)) {
      return val;
    }
  }
  return null;
}

export interface InvoiceItemDetail {
  index: number;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface SupplierInvoiceDetail {
  invoiceNumber: string;
  supplierName: string;
  date: string;
  branch?: string;
  total: number;
  discount: number;
  net: number;
  cashPaid: number;
  remainingDue: number;
  notes?: string;
  items: InvoiceItemDetail[];
}

export const JUMLA_INVOICES_DETAILS: Record<string, SupplierInvoiceDetail[]> = {
  "أسعد": [
    {
      invoiceNumber: "42",
      supplierName: "أسعد",
      date: "2026/08/31 01:43 م",
      branch: "فرع 2 / مخزن - فرع 2",
      total: 314250,
      discount: 4250,
      net: 310000,
      cashPaid: 73000,
      remainingDue: 237000,
      notes: "فاتورة مشتريات رقم 42 (12 صنف آلات تصوير وطابعات كيوسيرا)",
      items: [
        { index: 1, code: "001002010", name: "5053ci", quantity: 4, unitPrice: 11500, total: 45377.88 },
        { index: 2, code: "001002008", name: "كيوسيرا 4007CI-4053", quantity: 2, unitPrice: 11500, total: 22688.94 },
        { index: 3, code: "001002022", name: "كيوسيرا 2553", quantity: 2, unitPrice: 8250, total: 16276.85 },
        { index: 4, code: "001002007", name: "كيوسيرا 4006CI-4052", quantity: 2, unitPrice: 10500, total: 20715.99 },
        { index: 5, code: "0018005", name: "3565", quantity: 10, unitPrice: 5000, total: 49323.79 },
        { index: 6, code: "001007006", name: "كيوسيرا 3253", quantity: 2, unitPrice: 8750, total: 17263.33 },
        { index: 7, code: "001002007", name: "كيوسيرا 4006CI-4052", quantity: 3, unitPrice: 10500, total: 31073.99 },
        { index: 8, code: "001002005", name: "كيوسيرا 3206-3252", quantity: 6, unitPrice: 7750, total: 45871.12 },
        { index: 9, code: "001007007", name: "كيوسيرا 2552", quantity: 1, unitPrice: 7750, total: 7645.19 },
        { index: 10, code: "001010004", name: "TA5007CI", quantity: 3, unitPrice: 12000, total: 35513.13 },
        { index: 11, code: "001001045", name: "3655", quantity: 1, unitPrice: 8500, total: 8385.04 },
        { index: 12, code: "001006019", name: "4510", quantity: 10, unitPrice: 1000, total: 9864.76 },
      ],
    },
  ],
  "اليسرى": [
    {
      invoiceNumber: "43",
      supplierName: "اليسرى",
      date: "2026/09/05 08:26 ص",
      branch: "فرع 2 / مخزن - فرع 2",
      total: 84000,
      discount: 0,
      net: 84000,
      cashPaid: 20000,
      remainingDue: 64000,
      notes: "فاتورة مشتريات رقم 43 (8 ماكينات كيوسيرا ألوان)",
      items: [
        { index: 1, code: "001002009", name: "كيوسيرا 5006CI-5052", quantity: 2, unitPrice: 10500, total: 21000 },
        { index: 2, code: "001002007", name: "كيوسيرا 4006CI-4052", quantity: 3, unitPrice: 10500, total: 31500 },
        { index: 3, code: "001002009", name: "كيوسيرا 5006CI-5052", quantity: 2, unitPrice: 10500, total: 21000 },
        { index: 4, code: "001002007", name: "كيوسيرا 4006CI-4052", quantity: 1, unitPrice: 10500, total: 10500 },
      ],
    },
  ],
  "رضا امين": [
    {
      invoiceNumber: "45",
      supplierName: "رضا امين",
      date: "2026/09/10 10:57 ص",
      branch: "فرع 2 / مخزن - فرع 2",
      total: 170250,
      discount: 0,
      net: 170250,
      cashPaid: 90000,
      remainingDue: 80250,
      notes: "فاتورة مشتريات رقم 45 (7 بنود آلات تصوير وطابعات كيوسيرا)",
      items: [
        { index: 1, code: "001001037", name: "2506", quantity: 6, unitPrice: 8000, total: 48000 },
        { index: 2, code: "001002005", name: "كيوسيرا 3206-3252", quantity: 7, unitPrice: 8000, total: 56000 },
        { index: 3, code: "001010009", name: "TA5056I-5002", quantity: 2, unitPrice: 10500, total: 21000 },
        { index: 4, code: "001002015", name: "4002-4056", quantity: 3, unitPrice: 10500, total: 31500 },
        { index: 5, code: "001002024", name: "برنتر كيوسيرا 5031-5032-6031", quantity: 1, unitPrice: 2750, total: 2750 },
        { index: 6, code: "001010017", name: "TA P 5032DN", quantity: 2, unitPrice: 2750, total: 5500 },
        { index: 7, code: "001002013", name: "5031dn", quantity: 2, unitPrice: 2750, total: 5500 },
      ],
    },
  ],
  "سامح الشرقاوي": [
    {
      invoiceNumber: "39",
      supplierName: "سامح الشرقاوي",
      date: "2026/08/04",
      branch: "الجملة آلات",
      total: 143000,
      discount: 0,
      net: 143000,
      cashPaid: 50000,
      remainingDue: 93000,
      notes: "فاتورة مستند 39 (14 قطعة آلات كيوسيرا)",
      items: [
        { index: 1, code: "5052ci", name: "كيوسيرا 5052ci", quantity: 1, unitPrice: 11500, total: 11500 },
        { index: 2, code: "6052", name: "كيوسيرا 6052", quantity: 4, unitPrice: 11500, total: 46000 },
        { index: 3, code: "4052", name: "كيوسيرا 4052", quantity: 1, unitPrice: 11500, total: 11500 },
        { index: 4, code: "5053", name: "كيوسيرا 5053", quantity: 1, unitPrice: 12000, total: 12000 },
        { index: 5, code: "4053ci", name: "كيوسيرا 4053ci", quantity: 3, unitPrice: 12000, total: 36000 },
        { index: 6, code: "406", name: "كيوسيرا 406", quantity: 4, unitPrice: 6500, total: 26000 },
      ],
    },
    {
      invoiceNumber: "يدوية-98K",
      supplierName: "سامح الشرقاوي",
      date: "غير مؤرخ",
      branch: "الجملة آلات",
      total: 98000,
      discount: 0,
      net: 98000,
      cashPaid: 30000,
      remainingDue: 68000,
      notes: "فاتورة يدوية 11 آلة كيوسيرا",
      items: [
        { index: 1, code: "3252", name: "كيوسيرا 3252", quantity: 3, unitPrice: 9000, total: 27000 },
        { index: 2, code: "3003", name: "كيوسيرا 3003", quantity: 3, unitPrice: 9000, total: 27000 },
        { index: 3, code: "6052", name: "كيوسيرا 6052", quantity: 2, unitPrice: 11500, total: 23000 },
        { index: 4, code: "4061ci", name: "كيوسيرا 4061ci", quantity: 3, unitPrice: 7000, total: 21000 },
      ],
    },
  ],
};

export function getJumlaSupplierInvoices(name: string): SupplierInvoiceDetail[] {
  if (!name) return [];
  const clean = name.trim();
  for (const [key, val] of Object.entries(JUMLA_INVOICES_DETAILS)) {
    if (key === clean || clean.includes(key) || key.includes(clean)) {
      return val;
    }
  }
  return [];
}

