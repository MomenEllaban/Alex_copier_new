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

export interface PurchaseOrderLite {
  id: string;
  supplierId: string;
  companyId?: string;
  status: string;
  total: number;
  orderDate?: string | null;
  createdAt: string;
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
  kind: "PURCHASE" | "RETURN";
  id: string;
  date: string;
  label: string;
  amount: number; // +purchase / −return (signed for display)
  status: string;
}

export interface SupplierStatement {
  supplierId: string;
  orders: PurchaseOrderLite[];
  returns: PurchaseReturnLite[];
  entries: SupplierStatementEntry[]; // newest first
  ordersCount: number;
  totalPurchases: number; // Σ payable order totals (already net of returns)
  returnsTotal: number; // Σ final returns (informational — already reflected in totals)
  balance: number; // == totalPurchases
  lastOrderDate: string | null;
}

export function buildSupplierStatement(
  supplierId: string,
  allOrders: PurchaseOrderLite[],
  allReturns: PurchaseReturnLite[],
): SupplierStatement {
  const orders = allOrders
    .filter((o) => o.supplierId === supplierId && isPayableOrder(o.status))
    .sort(
      (a, b) =>
        new Date(b.orderDate || b.createdAt).getTime() -
        new Date(a.orderDate || a.createdAt).getTime(),
    );
  const orderById = new Map(allOrders.map((o) => [o.id, o]));
  // Returns are money-back facts: match by direct supplierId, or via the
  // parent purchase order's supplier (covers returns with null supplierId).
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

  const totalPurchases = orders.reduce((s, o) => s + (o.total || 0), 0);
  const returnsTotal = returns.reduce((s, r) => s + (r.total || 0), 0);

  const entries: SupplierStatementEntry[] = [
    ...orders.map((o) => ({
      kind: "PURCHASE" as const,
      id: o.id,
      date: o.orderDate || o.createdAt,
      label: `فاتورة شراء ${o.id.slice(0, 8)}`,
      amount: o.total || 0,
      status: o.status,
    })),
    ...returns.map((r) => ({
      kind: "RETURN" as const,
      id: r.id,
      date: r.createdAt,
      label: `مرتجع مشتريات${r.product?.name ? ` — ${r.product.name}` : ""}`,
      amount: -(r.total || 0),
      status: r.status,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    supplierId,
    orders,
    returns,
    entries,
    ordersCount: orders.length,
    totalPurchases,
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
  const rows = statement.entries
    .map(
      (e) => `<tr>
        <td>${new Date(e.date).toLocaleDateString("en-GB")}</td>
        <td>${e.kind === "PURCHASE" ? "فاتورة شراء" : "مرتجع مشتريات"}</td>
        <td>${e.label}</td>
        <td style="color:${e.amount < 0 ? "#b91c1c" : "#166534"};font-weight:bold">${e.amount.toLocaleString("ar-EG")} ج.م</td>
      </tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
    <title>كشف حساب المورد — ${supplierName}</title>
    <style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;font-size:12pt;color:#111}
    h1{font-size:18pt;margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{border:1px solid #999;padding:6px 8px;text-align:right;font-size:10.5pt}
    th{background:#f1f5f9}.summary{display:flex;gap:12px;margin-top:12px}
    .card{border:1px solid #999;padding:8px 12px;flex:1}.muted{color:#555;font-size:10pt}</style>
    </head><body>
    <h1>كشف حساب المورد — ${supplierName}</h1>
    <p class="muted">${companyName} — بتاريخ ${generatedAt}</p>
    <div class="summary">
      <div class="card">إجمالي المشتريات (صافي بعد المرتجعات)<br><b>${statement.totalPurchases.toLocaleString("ar-EG")} ج.م</b></div>
      <div class="card">عدد الفواتير<br><b>${statement.ordersCount}</b></div>
      <div class="card">إجمالي المرتجعات (معلوماتي)<br><b>${statement.returnsTotal.toLocaleString("ar-EG")} ج.م</b></div>
      <div class="card">الرصيد المستحق للمورد<br><b>${statement.balance.toLocaleString("ar-EG")} ج.م</b></div>
    </div>
    <table><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">لا توجد حركات</td></tr>'}</tbody></table>
    <p class="muted">ملحوظة: مرتجعات المشتريات تُخصم من إجمالي فاتورة الشراء لحظة اعتمادها، لذلك تظهر هنا للبيان فقط دون خصم مكرر.</p>
    <script>window.onload=()=>window.print()</script></body></html>`;
}
