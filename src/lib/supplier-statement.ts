/**
 * Supplier statement / balance engine — single source of truth.
 *
 * Data reality (no migration): suppliers have NO debt tracking — no
 * `remainingDebt` on Supplier and no `paidAmount` on PurchaseOrder
 * (see `prisma/schema.prisma`). The company report states the convention
 * explicitly: "purchases have no per-order payment tracking yet, so
 * received = paid" (`src/app/api/companies/[id]/report/route.ts`).
 *
 * Balance definition used everywhere (balances page + statement modal):
 *   balance(supplier) = Σ PurchaseOrder.total
 *     WHERE supplierId matches
 *     AND status NOT IN ('DRAFT', 'CANCELLED')
 *     (i.e. CONFIRMED + RECEIVED count as payable)
 *
 * Returns are NOT subtracted again: a PURCHASE_RETURN already decrements
 * `PurchaseOrder.total` at creation time (`src/app/api/returns/route.ts`
 * — `newTotal = total - returnTotal`). The statement lists returns as
 * informational lines only, so the report never double-counts.
 *
 * Only APPROVED / COMPLETED returns are shown (PENDING / REJECTED are
 * not financial facts yet).
 */

import { esc } from "@/lib/html-escape";
import { getJumlaSupplierLedger } from "@/lib/jumla-suppliers-ledger";

export interface PurchaseOrderLite {
  id: string;
  supplierId: string;
  companyId?: string;
  status: string;
  total: number;
  notes?: string | null;
  orderDate?: string | null;
  createdAt: string;
  items?: Array<{
    id?: string;
    quantity: number;
    unitPrice: number;
    total?: number;
    product?: { id: string; name: string; sku?: string | null } | null;
  }>;
}

export interface PurchaseReturnLite {
  id: string;
  supplierId?: string | null;
  purchaseOrderId?: string | null;
  total: number;
  status: string;
  createdAt: string;
  product?: { name?: string | null } | null;
  quantity?: number;
}

/** Orders that represent real payables — everything except drafts & cancellations. */
export function isPayableOrder(status: string): boolean {
  return status !== "DRAFT" && status !== "CANCELLED";
}

/** Returns that are financial facts (visible + affect stock/money). */
export function isFinalReturn(status: string): boolean {
  return status === "APPROVED" || status === "COMPLETED";
}

export interface SupplierStatementEntry {
  kind: "PURCHASE" | "RETURN" | "PAYMENT" | "RECEIPT" | "OPENING";
  id: string;
  date: string;
  docNumber?: string;
  docType?: string;
  label: string;
  debit: number;   // مدين (مسدد للمورد)
  credit: number;  // دائن (مستحق للمورد)
  runningBalance: number; // الرصيد التراكمي
  amount: number; // signed: +credit / -debit for backward compatibility
  status: string;
}

export interface SupplierStatement {
  supplierId: string;
  supplierName?: string;
  code?: number;
  orders: PurchaseOrderLite[];
  returns: PurchaseReturnLite[];
  entries: SupplierStatementEntry[];
  ordersCount: number;
  totalPurchases: number; // Σ دائن (إجمالي الاستحقاق / الفواتير)
  totalPaid: number;      // Σ مدين (إجمالي المسدد كاش ودفعات)
  returnsTotal: number;   // Σ المرتجعات
  balance: number;        // صافي الرصيد المستحق للمورد (دائن)
  lastOrderDate: string | null;
  lastPaymentDate?: string | null;
  lastPaymentAmount?: number;
}

export function buildSupplierStatement(
  supplierId: string,
  allOrders: PurchaseOrderLite[],
  allReturns: PurchaseReturnLite[],
  supplierName?: string,
): SupplierStatement {
  const jumlaLedger = supplierName ? getJumlaSupplierLedger(supplierName) : null;
  const orders = allOrders
    .filter((o) => o.supplierId === supplierId && isPayableOrder(o.status))
    .sort(
      (a, b) =>
        new Date(b.orderDate || b.createdAt).getTime() -
        new Date(a.orderDate || a.createdAt).getTime(),
    );

  const orderById = new Map(allOrders.map((o) => [o.id, o]));
  const returns = allReturns
    .filter((r) => {
      if (!isFinalReturn(r.status)) return false;
      if (r.supplierId === supplierId) return true;
      if (r.purchaseOrderId) {
        const parent = orderById.get(r.purchaseOrderId);
        if (parent?.supplierId === supplierId) return true;
      }
      return false;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 1. If detailed Jumla Ledger exists, build canonical 7-column accounting ledger
  if (jumlaLedger) {
    let sumCredit = 0;
    let sumDebit = 0;
    const entries: SupplierStatementEntry[] = jumlaLedger.movements.map((m, idx) => {
      sumCredit += m.credit;
      sumDebit += m.debit;
      let kind: SupplierStatementEntry["kind"] = "PURCHASE";
      if (m.docType === "كاش" || m.docType === "صرف نقدية") kind = "PAYMENT";
      else if (m.docType === "استلام نقدية") kind = "RECEIPT";
      else if (m.docType === "رصيد افتتاحي موردين") kind = "OPENING";

      return {
        kind,
        id: `mvt-${m.docNumber}-${idx}`,
        date: m.date,
        docNumber: m.docNumber,
        docType: m.docType,
        label: m.notes || m.docType,
        debit: m.debit,
        credit: m.credit,
        runningBalance: m.runningBalance,
        amount: m.credit > 0 ? m.credit : -m.debit,
        status: "CONFIRMED",
      };
    });

    const purchaseOrdersCount = jumlaLedger.movements.filter(
      (m) => m.docType === "فاتورة مشتريات"
    ).length;

    return {
      supplierId,
      supplierName: jumlaLedger.name,
      code: jumlaLedger.code,
      orders,
      returns,
      entries,
      ordersCount: purchaseOrdersCount || orders.length,
      totalPurchases: sumCredit,
      totalPaid: sumDebit,
      returnsTotal: 0,
      balance: jumlaLedger.finalBalance,
      lastOrderDate: entries.length > 0 ? entries[entries.length - 1].date : null,
      lastPaymentDate: jumlaLedger.lastPaymentDate,
      lastPaymentAmount: jumlaLedger.lastPaymentAmount,
    };
  }

  // 2. Standard DB supplier fallback
  const totalPurchases = orders.reduce((s, o) => s + (o.total || 0), 0);
  const returnsTotal = returns.reduce((s, r) => s + (r.total || 0), 0);

  // Build chronologically to compute running balance
  const rawList = [
    ...orders.map((o) => ({
      kind: "PURCHASE" as const,
      id: o.id,
      date: o.orderDate || o.createdAt,
      docNumber: o.id.slice(0, 8),
      docType: "فاتورة مشتريات",
      label: o.notes || `فاتورة شراء #${o.id.slice(0, 8)}`,
      debit: 0,
      credit: o.total || 0,
      status: o.status,
    })),
    ...returns.map((r) => ({
      kind: "RETURN" as const,
      id: r.id,
      date: r.createdAt,
      docNumber: r.id.slice(0, 8),
      docType: "مرتجع مشتريات",
      label: `مرتجع مشتريات${r.product?.name ? ` — ${r.product.name}` : ""}`,
      debit: r.total || 0,
      credit: 0,
      status: r.status,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let currentRun = 0;
  const entries: SupplierStatementEntry[] = rawList.map((item) => {
    currentRun += item.credit - item.debit;
    return {
      ...item,
      runningBalance: currentRun,
      amount: item.credit > 0 ? item.credit : -item.debit,
    };
  });

  return {
    supplierId,
    supplierName,
    orders,
    returns,
    entries,
    ordersCount: orders.length,
    totalPurchases,
    totalPaid: returnsTotal,
    returnsTotal,
    balance: totalPurchases,
    lastOrderDate: orders.length ? orders[0].orderDate || orders[0].createdAt : null,
  };
}

export interface SupplierBalanceRow {
  supplierId: string;
  ordersCount: number;
  totalPurchases: number;
  returnsTotal: number;
  balance: number;
  lastOrderDate: string | null;
}

/** Aggregate balances for every supplier; caller filters `balance !== 0`. */
export function buildSupplierBalances(
  supplierIds: string[],
  allOrders: PurchaseOrderLite[],
  allReturns: PurchaseReturnLite[],
): Map<string, SupplierBalanceRow> {
  const map = new Map<string, SupplierBalanceRow>();
  for (const id of supplierIds) {
    const st = buildSupplierStatement(id, allOrders, allReturns);
    map.set(id, {
      supplierId: id,
      ordersCount: st.ordersCount,
      totalPurchases: st.totalPurchases,
      returnsTotal: st.returnsTotal,
      balance: st.balance,
      lastOrderDate: st.lastOrderDate,
    });
  }
  return map;
}

/** Printable HTML for a supplier statement (opened in a new window → print). */
export function buildSupplierStatementPrintHtml(
  supplierName: string,
  companyName: string,
  statement: SupplierStatement,
  generatedAt: string,
): string {
  const totalPaid = statement.totalPaid ?? statement.returnsTotal ?? 0;
  const totalPurchases = statement.totalPurchases ?? 0;
  const balance = statement.balance ?? (totalPurchases - totalPaid);

  const rows = (statement.entries || [])
    .map((e) => {
      const debit = e.debit ?? (e.amount < 0 ? -e.amount : 0);
      const credit = e.credit ?? (e.amount > 0 ? e.amount : 0);
      const runBal = e.runningBalance ?? e.amount ?? 0;
      const dateStr = typeof e.date === "string" ? e.date.split("T")[0] : "";

      return `<tr>
        <td style="text-align:center">${esc(dateStr)}</td>
        <td style="text-align:center;font-weight:bold">${esc(e.docNumber || "—")}</td>
        <td><span class="badge ${debit > 0 ? "badge-debit" : "badge-credit"}">${esc(e.docType || (e.kind === "PURCHASE" ? "فاتورة مشتريات" : "مرتجع"))}</span></td>
        <td>${esc(e.label || "")}</td>
        <td style="text-align:right;color:#047857;font-weight:bold">${debit > 0 ? esc(debit.toLocaleString("ar-EG")) + " ج.م" : "0"}</td>
        <td style="text-align:right;color:#1e40af;font-weight:bold">${credit > 0 ? esc(credit.toLocaleString("ar-EG")) + " ج.م" : "0"}</td>
        <td style="text-align:right;font-weight:black;color:#b45309">${esc(runBal.toLocaleString("ar-EG"))} ج.م</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
    <title>كشف حساب مورد تفصيلي — ${esc(supplierName)}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; font-size: 11pt; color: #0f172a; margin: 0; padding: 10px; background: #fff; }
      .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
      .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
      .title { font-size: 20pt; font-weight: 900; margin: 0; color: #0f172a; }
      .subtitle { font-size: 11pt; color: #475569; margin-top: 4px; }
      .meta { text-align: left; font-size: 10pt; color: #334155; }
      .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px; }
      .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; background: #f8fafc; }
      .card-title { font-size: 9pt; color: #64748b; font-weight: bold; margin-bottom: 4px; }
      .card-val { font-size: 13pt; font-weight: 900; }
      .card-amber { background: #fffbeb; border-color: #fde68a; }
      .card-amber .card-val { color: #b45309; }
      .card-blue { background: #eff6ff; border-color: #bfdbfe; }
      .card-blue .card-val { color: #1e40af; }
      .card-green { background: #f0fdf4; border-color: #bbf7d0; }
      .card-green .card-val { color: #15803d; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 10pt; }
      th, td { border: 1px solid #cbd5e1; padding: 7px 9px; vertical-align: middle; }
      th { background: #f1f5f9; font-weight: 800; color: #1e293b; font-size: 9.5pt; }
      tfoot tr { background: #f8fafc; font-weight: 900; border-top: 2px solid #0f172a; }
      .badge { display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 8.5pt; font-weight: bold; }
      .badge-credit { background: #dbeafe; color: #1e40af; }
      .badge-debit { background: #dcfce7; color: #15803d; }
      .footer-note { font-size: 9pt; color: #64748b; margin-top: 16px; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
    </style>
    </head><body>
    <div class="header">
      <div class="header-top">
        <div>
          <h1 class="title">كشف حساب مورد تفصيلي</h1>
          <p class="subtitle">المورد: <b>${esc(supplierName)}</b> ${statement.code ? `(كود ${statement.code})` : ""} — ${esc(companyName || "شركة جملة آلات")}</p>
        </div>
        <div class="meta">
          <p><b>تاريخ الطباعة:</b> ${esc(generatedAt)}</p>
          <p><b>العملة:</b> جنيه مصري (EGP)</p>
        </div>
      </div>
      <div class="summary-cards">
        <div class="card card-blue">
          <div class="card-title">إجمالي الاستحقاق / الفواتير (دائن)</div>
          <div class="card-val">${esc(totalPurchases.toLocaleString("ar-EG"))} ج.م</div>
        </div>
        <div class="card card-green">
          <div class="card-title">إجمالي المسدد كاش ودفعات (مدين)</div>
          <div class="card-val">${esc(totalPaid.toLocaleString("ar-EG"))} ج.م</div>
        </div>
        <div class="card card-amber">
          <div class="card-title">صافي الرصيد المستحق (دائن)</div>
          <div class="card-val">${esc(balance.toLocaleString("ar-EG"))} ج.م</div>
        </div>
        <div class="card">
          <div class="card-title">آخر دفعة مسددة</div>
          <div class="card-val" style="font-size:11pt">
            ${statement.lastPaymentAmount ? esc(statement.lastPaymentAmount.toLocaleString("ar-EG")) + " ج.م" : "—"}
            <span style="display:block;font-size:8.5pt;color:#64748b;font-weight:normal">${statement.lastPaymentDate ? esc(statement.lastPaymentDate) : ""}</span>
          </div>
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:12%">التاريخ</th>
          <th style="width:10%">رقم المستند</th>
          <th style="width:14%">النوع</th>
          <th>البيان والملاحظات</th>
          <th style="width:13%">مدين (مسدد)</th>
          <th style="width:13%">دائن (مستحق)</th>
          <th style="width:14%">الرصيد التراكمي</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8">لا توجد حركات مسجلة</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="text-align:right">الإجمالي العام للحساب:</td>
          <td style="text-align:right;color:#047857">${esc(totalPaid.toLocaleString("ar-EG"))} ج.م</td>
          <td style="text-align:right;color:#1e40af">${esc(totalPurchases.toLocaleString("ar-EG"))} ج.م</td>
          <td style="text-align:right;color:#b45309">${esc(balance.toLocaleString("ar-EG"))} ج.م</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer-note">
      <p>• كشف الحساب صادر ومعتمد من نظام Alex Copier ERP لشركة جملة آلات. الرصيد دائن يعني مستحق للمورد.</p>
    </div>

    <script>window.onload=()=>window.print()</script>
    </body></html>`;
}

