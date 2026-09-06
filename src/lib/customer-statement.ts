import { prisma } from "./prisma";

export type StatementRowType = "SALE" | "PAYMENT" | "RETURN" | "SETTLEMENT" | "TRADE_IN";

export interface StatementRow {
  id: string;
  type: StatementRowType;
  date: string; // ISO datetime used for display + sort
  ref: string | null; // human reference (order number / settlement number / notes / reason)
  description: string | null;
  debit: number; // column value: money that increases the customer's debt (مدين)
  credit: number; // column value: money that reduces the customer's debt (دائن)
  amount: number; // derived signed movement (debit - credit): positive increases the debt
  balance: number; // running debt balance after this row
  finalized: boolean; // whether this row participates in the running balance
}

export interface CustomerStatement {
  customerId: string;
  customerName: string;
  companyName: string | null;
  phone: string | null;
  rows: StatementRow[];
  openingBalance: number;
  totalBilled: number; // total debt (customer.totalDebt) — total billed to the customer
  totalPaid: number; // total paid toward the debt (totalDebt - remainingDebt, capped at totalDebt)
  creditBalance: number; // money under the customer's account when closingBalance is negative
  closingBalance: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build a full chronological statement for a customer by merging every
 * financial movement: sales invoices, payments, sale returns, and settlements.
 *
 * Balance convention: rows are sorted by (date, createdAt). Each row carries a
 * `debit` (مدين) and `credit` (دائن) column. Invoices billed on credit add to
 * debit; cash invoices are fully covered the same instant so they appear with
 * debit === credit and therefore do not change the balance. Payments, approved
 * returns, and collected settlements reduce the debt and appear under credit.
 * The running `balance` therefore ends at the remaining debt.
 */
export async function buildCustomerStatement(customerId: string): Promise<CustomerStatement | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, companyName: true, phone: true, totalDebt: true, remainingDebt: true },
  });
  if (!customer) return null;

  const [salesOrders, payments, returns, settlements] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { customerId },
      select: {
        id: true,
        total: true,
        paymentMethod: true,
        tradeInTotal: true,
        orderDate: true,
        createdAt: true,
        status: true,
        notes: true,
      },
      orderBy: [{ orderDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.customerPayment.findMany({
      where: { customerId },
      select: { id: true, amount: true, paymentDate: true, createdAt: true, notes: true },
      orderBy: { paymentDate: "asc" },
    }),
    prisma.returnTransaction.findMany({
      where: { customerId, type: "SALE_RETURN", status: { in: ["APPROVED", "COMPLETED"] } },
      select: { id: true, total: true, createdAt: true, reason: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.settlement.findMany({
      where: { customerId },
      select: {
        id: true,
        amount: true,
        direction: true,
        reason: true,
        settlementNumber: true,
        createdAt: true,
        status: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  interface Movement extends StatementRow {
    sort: number;
    finalized: boolean;
  }

  const moves: Movement[] = [];

  for (const o of salesOrders) {
    // Every saved invoice already moved the customer's debt at creation
    // (the sales form has no confirm step) and is always stored as CONFIRMED.
    // Only cancelled orders are excluded.
    const cash = o.paymentMethod === "CASH";
    const debit = o.total;
    const credit = cash ? o.total : 0;
    moves.push({
      id: o.id,
      type: "SALE",
      date: o.createdAt.toISOString(),
      ref: o.id,
      description: o.notes,
      debit,
      credit,
      amount: debit - credit,
      balance: 0,
      sort: o.createdAt.getTime(),
      finalized: o.status !== "CANCELLED",
    });

    // Trade-in value (قيمة الاستبدال) covers part of the invoice, so it is
    // shown as an explicit credit. On cash invoices the value is offset by an
    // equal debit so the row is visible without moving the balance.
    const tradeIn = Number(o.tradeInTotal) || 0;
    if (tradeIn > 0) {
      moves.push({
        id: `${o.id}-tradein`,
        type: "TRADE_IN",
        date: o.createdAt.toISOString(),
        ref: o.id,
        description: "قيمة استبدال",
        debit: cash ? tradeIn : 0,
        credit: tradeIn,
        amount: cash ? 0 : -tradeIn,
        balance: 0,
        sort: o.createdAt.getTime() + 1,
        finalized: o.status !== "CANCELLED",
      });
    }
  }
  for (const p of payments) {
    moves.push({
      id: p.id,
      type: "PAYMENT",
      date: p.createdAt.toISOString(),
      ref: p.notes,
      description: p.notes,
      debit: 0,
      credit: p.amount,
      amount: -p.amount,
      balance: 0,
      sort: p.createdAt.getTime(),
      finalized: true,
    });
  }

  for (const r of returns) {
    moves.push({
      id: r.id,
      type: "RETURN",
      date: r.createdAt.toISOString(),
      ref: r.reason,
      description: r.reason,
      debit: 0,
      credit: r.total,
      amount: -r.total,
      balance: 0,
      sort: r.createdAt.getTime(),
      finalized: true,
    });
  }

  for (const s of settlements) {
    // ADDITION = money collected from the customer (reduces debt) => credit,
    // SUBTRACTION = money given to the customer (increases debt) => debit.
    const statusNote = s.status === "INITIAL" ? " (غير معتمدة)" : "";
    const subtract = s.direction === "SUBTRACTION";
    moves.push({
      id: s.id,
      type: "SETTLEMENT",
      date: s.createdAt.toISOString(),
      ref: s.settlementNumber,
      description: s.reason ? `${s.reason}${statusNote}` : statusNote.trim() || s.reason,
      debit: subtract ? s.amount : 0,
      credit: subtract ? 0 : s.amount,
      amount: subtract ? s.amount : -s.amount,
      balance: 0,
      sort: s.createdAt.getTime(),
      finalized: s.status === "VERIFIED",
    });
  }

  // Sort chronologically; ties broken by created time.
  moves.sort((a, b) => a.sort - b.sort || a.date.localeCompare(b.date));

  // The authoritative debt figures live on the Customer record. The raw
  // movements are built up independently and may carry historical drift, so we
  // seed an opening balance that makes the running balance reconcile EXACTLY to
  // remainingDebt:
  //   openingBalance + Σ finalized movements = remainingDebt
  //
  // Every saved invoice is already reflected in remainingDebt (the sales form
  // has no confirm step), so all invoices are finalized; CANCELLED orders and
  // INITIAL settlements are the only non-finalized rows (kept for visibility
  // but they do not move the balance).
  //
  // Summary stats are anchored to the authoritative values too so they stay
  // consistent with the dashboard and each other (billed - paid = remaining).
  const finalizedMovement = moves
    .filter((d) => d.finalized)
    .reduce((sum, d) => sum + d.amount, 0);
  const openingBalance = round2(customer.remainingDebt - finalizedMovement);

  const rows: StatementRow[] = [];
  let balance = openingBalance;
  for (const d of moves) {
    if (d.finalized) balance += d.amount;
    d.balance = round2(balance);
    rows.push({
      id: d.id,
      type: d.type,
      date: d.date,
      ref: d.ref,
      description: d.description,
      debit: round2(d.debit),
      credit: round2(d.credit),
      amount: round2(d.amount),
      balance: d.balance,
      finalized: d.finalized,
    });
  }

  const closingBalance = round2(balance);

  return {
    customerId: customer.id,
    customerName: customer.name,
    companyName: customer.companyName,
    phone: customer.phone,
    rows,
    openingBalance,
    totalBilled: round2(customer.totalDebt),
    // Cap at totalDebt: overpayments become credit (negative remainingDebt) and
    // must not inflate the "paid" figure beyond what was actually billed.
    totalPaid: round2(Math.min(customer.totalDebt, Math.max(0, customer.totalDebt - customer.remainingDebt))),
    // Money under the customer's account: what they paid beyond what they owe.
    creditBalance: round2(Math.max(0, -closingBalance)),
    closingBalance,
  };
}
