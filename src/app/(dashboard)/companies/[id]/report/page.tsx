"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { useI18n } from "@/i18n/context";
import { useToast } from "@/components/UIProvider";
import PrinterLoader from "@/components/PrinterLoader";
import { DateTimeCell } from "@/components/DateTimeCell";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Printer } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

interface ReportData {
  company: {
    id: string;
    name: string;
    nameAr: string | null;
  };
  sales: {
    total: number;
    count: number;
    byPaymentMethod: Record<string, number>;
    orders: Array<{
      id: string;
      total: number;
      discount: number;
      paymentMethod: string;
      paymentStatus: string;
      orderDate: string;
      createdAt: string;
      customer?: { name: string };
      items?: Array<{ product?: { name: string }; quantity: number; unitPrice: number }>;
    }>;
  };
  purchases: {
    total: number;
    count: number;
    orders: Array<{
      id: string;
      total: number;
      orderDate: string;
      createdAt: string;
      supplier?: { name: string };
      items?: Array<{ product?: { name: string }; quantity: number; unitPrice: number }>;
    }>;
  };
  expenses: {
    total: number;
    byCategory: Record<string, number>;
    items: Array<{
      id: string;
      date: string;
      category: string;
      description: string;
      amount: number;
    }>;
  };
  settlements: {
    total: number;
    pending: number;
    count: number;
    items: Array<{
      id: string;
      createdAt: string;
      amount: number;
      status: string;
      direction?: string;
      collector?: { name: string };
    }>;
  };
  returns: {
    total: number;
    count: number;
    items: Array<{
      id: string;
      createdAt: string;
      total: number;
      reason: string;
      type: string;
      customer?: { name: string };
      supplier?: { name: string };
    }>;
  };
  netProfit: number;
  incomeStatement: {
    salesRevenue: number;
    purchasesCost: number;
    salesReturns: number;
    purchaseReturns: number;
    expenses: number;
    settlementsCollected: number;
    netProfit: number;
  };
  cashPosition: {
    cashIn: number;
    cashOut: number;
    netCash: number;
    settlementsVerified: number;
    cashFromSales: number;
    expenses: number;
    cashForPurchases: number;
  };
  customerDebt: {
    total: number;
    details: Array<{
      customerId: string;
      customerName: string;
      phone: string | null;
      balance: number;
    }>;
  };
  monthlyData: Array<{
    month: string;
    sales: number;
    purchases: number;
    expenses: number;
    settlements: number;
  }>;
}

const moneyFormatter = new Intl.NumberFormat("ar-EG", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 0,
});

type LedgerEntry = {
  id: string;
  kind: "SALE" | "PURCHASE" | "EXPENSE" | "SETTLEMENT" | "SALE_RETURN" | "PURCHASE_RETURN";
  direction: "IN" | "OUT";
  date: string;
  label: string;
  detail: string;
  amount: number;
};

const STATUS_BADGE: Record<string, string> = {
  INITIAL: "bg-yellow-100 text-yellow-700",
  VERIFIED: "bg-green-100 text-green-700",
  PAID: "bg-green-100 text-green-700",
  PENDING: "bg-yellow-100 text-yellow-700",
  OVERDUE: "bg-red-100 text-red-700",
  DRAFT: "bg-gray-100 text-gray-600",
  CONFIRMED: "bg-blue-100 text-blue-700",
  RECEIVED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
  PARTIAL: "bg-yellow-100 text-yellow-700",
  CREDIT: "bg-purple-100 text-purple-700",
  INSTALLMENT: "bg-blue-100 text-blue-700",
  CASH: "bg-emerald-100 text-emerald-700",
  MIXED: "bg-orange-100 text-orange-700",
};

const statusBadge = (status: string) => {
  const cls = STATUS_BADGE[status] ?? "bg-gray-100 text-gray-600";
  const labels: Record<string, string> = {
    INITIAL: "أولي",
    VERIFIED: "تم التحقق",
    PAID: "مدفوع",
    PENDING: "معلق",
    OVERDUE: "متأخر",
    DRAFT: "مسودة",
    CONFIRMED: "مؤكد",
    RECEIVED: "تم الاستلام",
    CANCELLED: "ملغي",
    PARTIAL: "جزئي",
    CREDIT: "أجل",
    INSTALLMENT: "أجل",
    CASH: "كاش",
    MIXED: "أجل",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
};

const paymentMethodLabel = (method: string) => {
  const map: Record<string, string> = {
    CASH: "كاش",
    CREDIT: "أجل",
    INSTALLMENT: "أجل",
    MIXED: "أجل",
  };
  return map[method] ?? method;
};

const paymentStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    PENDING: "معلق",
    PAID: "مدفوع",
    PARTIAL: "جزئي",
    OVERDUE: "متأخر",
  };
  return map[status] ?? status;
};

const SubtotalRow = ({ label, value, colSpan, color }: { label: string; value: number; colSpan: number; color?: string }) => (
  <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
    <td colSpan={colSpan} className="px-4 py-3 text-sm text-right">
      {label}
    </td>
    <td className={`px-4 py-3 text-sm text-left ${color ?? ""}`}>
      {moneyFormatter.format(value)}
    </td>
  </tr>
);

export default function CompanyReportPage() {
  const { dir, t } = useI18n();
  const { success: toastSuccess, error: toastError } = useToast();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const toISODate = (d: Date) => d.toISOString().slice(0, 10);

  const [from, setFrom] = useState(toISODate(firstOfMonth));
  const [to, setTo] = useState(toISODate(today));
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"ledger" | "details">("ledger");

  const toggleOrder = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const fetchReport = () => {
    setLoading(true);
    const qs = new URLSearchParams({ from, to });
    fetch(`/api/companies/${id}/report?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then((data) => setReport(data))
      .catch(() => {
        toastError("حدث خطأ أثناء تحميل التقرير");
        setReport(null);
      })
      .finally(() => setLoading(false));
  };

  const { refresh, refreshing } = useAutoRefresh(fetchReport, [
    "sales", "purchases", "settlements", "expenses", "returns", "companies",
  ]);

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const salesTotal = useMemo(
    () => report?.sales?.total ?? 0,
    [report],
  );
  const purchasesTotal = useMemo(
    () => report?.purchases?.total ?? 0,
    [report],
  );
  const expensesTotal = useMemo(
    () => report?.expenses?.total ?? 0,
    [report],
  );
  const settlementsTotal = useMemo(
    () => report?.settlements?.total ?? 0,
    [report],
  );
  const returnsTotal = useMemo(
    () => report?.returns?.total ?? 0,
    [report],
  );
  const salesOrders = useMemo(() => report?.sales?.orders ?? [], [report]);
  const purchaseOrders = useMemo(() => report?.purchases?.orders ?? [], [report]);
  const expenseItems = useMemo(() => report?.expenses?.items ?? [], [report]);
  const settlementItems = useMemo(() => report?.settlements?.items ?? [], [report]);
  const returnItems = useMemo(() => report?.returns?.items ?? [], [report]);

  const ledger = useMemo<LedgerEntry[]>(() => {
    if (!report) return [];
    const rows: LedgerEntry[] = [];

    for (const o of report.sales.orders ?? []) {
      rows.push({
        id: `sale-${o.id}`,
        kind: "SALE",
        direction: "IN",
        date: o.createdAt || o.orderDate,
        label: t("navigation.sales"),
        detail: o.customer?.name || o.id.slice(0, 8),
        amount: o.total || 0,
      });
    }
    for (const o of report.purchases.orders ?? []) {
      rows.push({
        id: `purchase-${o.id}`,
        kind: "PURCHASE",
        direction: "OUT",
        date: o.createdAt || o.orderDate,
        label: t("navigation.purchases"),
        detail: o.supplier?.name || o.id.slice(0, 8),
        amount: o.total || 0,
      });
    }
    for (const e of report.expenses.items ?? []) {
      rows.push({
        id: `expense-${e.id}`,
        kind: "EXPENSE",
        direction: "OUT",
        date: e.date,
        label: t("finance.expenses"),
        detail: [e.category, e.description].filter(Boolean).join(" — "),
        amount: e.amount || 0,
      });
    }
    for (const s of report.settlements.items ?? []) {
      const outgoing = s.direction === "SUBTRACTION";
      rows.push({
        id: `settlement-${s.id}`,
        kind: "SETTLEMENT",
        direction: outgoing ? "OUT" : "IN",
        date: s.createdAt,
        label: t("navigation.settlements"),
        detail: s.status === "VERIFIED"
          ? `${s.collector?.name || "—"} · ${t("settlements.verified")}`
          : s.collector?.name || "—",
        amount: s.amount || 0,
      });
    }
    for (const r of report.returns.items ?? []) {
      const saleReturn = r.type === "SALE_RETURN";
      rows.push({
        id: `return-${r.id}`,
        kind: saleReturn ? "SALE_RETURN" : "PURCHASE_RETURN",
        direction: saleReturn ? "OUT" : "IN",
        date: r.createdAt,
        label: saleReturn ? t("reports.salesReturn") : t("reports.purchaseReturn"),
        detail: r.customer?.name || r.supplier?.name || r.reason || "—",
        amount: r.total || 0,
      });
    }

    return rows.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [report, t]);

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { font-size: 11pt !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          * { overflow: visible !important; max-height: none !important; }
          table { page-break-inside: auto; width: 100% !important; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          tfoot { display: table-row-group; }
          .print-break { page-break-before: always; }
          div { break-inside: avoid; }
        }
      `}</style>

      <div dir={dir} className="space-y-6">
        <div className="no-print flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/companies")}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-600 transition hover:bg-gray-50"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
              <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
                {report?.company?.nameAr || report?.company?.name || "التقرير المالي"}
              </h1>
              <p className="text-sm text-gray-500">التقرير المالي — {from} إلى {to}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <button
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              <Printer size={16} />
              طباعة
            </button>
          </div>
        </div>

        <div className="no-print flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">من تاريخ</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">إلى تاريخ</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "جاري التحميل..." : "عرض التقرير"}
          </button>
        </div>

        <div className="no-print flex gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm" role="tablist">
          {([
            { id: "ledger", label: t("reports.activityLedger") },
            { id: "details", label: t("reports.detailedReport") },
          ] as const).map((tb) => (
            <button
              key={tb.id}
              role="tab"
              aria-selected={activeTab === tb.id}
              onClick={() => setActiveTab(tb.id)}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${activeTab === tb.id ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
            <PrinterLoader size="md" label="جاري تحميل التقرير..." />
          </div>
        ) : report ? (
          activeTab === "ledger" ? (
            <LedgerTable ledger={ledger} t={t} />
          ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-r-4 border-green-500">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-600">💰</div>
                  <p className="text-sm text-gray-500">اجمالي المبيعات</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-green-600">{moneyFormatter.format(salesTotal)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-r-4 border-blue-500">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">📦</div>
                  <p className="text-sm text-gray-500">اجمالي المشتريات</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-blue-600">{moneyFormatter.format(purchasesTotal)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-r-4 border-orange-500">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">📋</div>
                  <p className="text-sm text-gray-500">المصروفات</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-orange-600">{moneyFormatter.format(expensesTotal)}</p>
              </div>
              <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-r-4 ${report.netProfit >= 0 ? "border-green-500" : "border-red-500"}`}>
                <div className="flex items-center gap-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${report.netProfit >= 0 ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                    {report.netProfit >= 0 ? "📈" : "📉"}
                  </div>
                  <p className="text-sm text-gray-500">صافي الربح / الخسارة</p>
                </div>
                <p className={`mt-2 text-2xl font-bold ${report.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {moneyFormatter.format(report.netProfit)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print-break">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
                  <h2 className="text-lg font-bold text-slate-900">قائمة الدخل</h2>
                </div>
                <table className="w-full">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="px-5 py-3 text-sm text-gray-600">إيرادات المبيعات</td>
                      <td className="px-5 py-3 text-sm font-bold text-green-700 text-left">{moneyFormatter.format(report.incomeStatement.salesRevenue)}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-5 py-3 text-sm text-gray-600">تكلفة المشتريات</td>
                      <td className="px-5 py-3 text-sm font-bold text-blue-700 text-left">{moneyFormatter.format(-report.incomeStatement.purchasesCost)}</td>
                    </tr>
                    {report.incomeStatement.salesReturns > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="px-5 py-3 text-sm text-gray-600">مرتجعات المبيعات</td>
                        <td className="px-5 py-3 text-sm font-bold text-red-700 text-left">{moneyFormatter.format(-report.incomeStatement.salesReturns)}</td>
                      </tr>
                    )}
                    {report.incomeStatement.settlementsCollected !== 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="px-5 py-3 text-sm text-gray-600">التسويات (صافي)</td>
                        <td className={`px-5 py-3 text-sm font-bold text-left ${report.incomeStatement.settlementsCollected >= 0 ? "text-green-700" : "text-red-600"}`}>{moneyFormatter.format(report.incomeStatement.settlementsCollected)}</td>
                      </tr>
                    )}
                    <tr className="border-b border-gray-100">
                      <td className="px-5 py-3 text-sm text-gray-600">المصروفات</td>
                      <td className="px-5 py-3 text-sm font-bold text-orange-700 text-left">{moneyFormatter.format(-report.incomeStatement.expenses)}</td>
                    </tr>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                      <td className="px-5 py-3 text-sm">صافي الربح / الخسارة</td>
                      <td className={`px-5 py-3 text-sm text-left ${report.incomeStatement.netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {moneyFormatter.format(report.incomeStatement.netProfit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
                  <h2 className="text-lg font-bold text-slate-900">الموقف النقدي</h2>
                </div>
                <p className="px-5 pt-3 text-xs font-semibold tracking-wide text-gray-400">التدفقات النقدية الداخلة</p>
                <table className="w-full">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="px-5 py-2 text-sm text-gray-600">مدفوعات العملاء (تحصيلات معتمدة)</td>
                      <td className="px-5 py-2 text-sm font-bold text-green-700 text-left">{moneyFormatter.format(report.cashPosition.settlementsVerified)}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-5 py-2 text-sm text-gray-600">نقد من المبيعات</td>
                      <td className="px-5 py-2 text-sm font-bold text-green-700 text-left">{moneyFormatter.format(report.cashPosition.cashFromSales)}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-5 py-2 text-sm font-semibold text-gray-700">اجمالي الداخل</td>
                      <td className="px-5 py-2 text-sm font-bold text-green-700 text-left">{moneyFormatter.format(report.cashPosition.cashIn)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="px-5 pt-4 text-xs font-semibold tracking-wide text-gray-400">التدفقات النقدية الخارجة</p>
                <table className="w-full">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="px-5 py-2 text-sm text-gray-600">المصروفات النقدية</td>
                      <td className="px-5 py-2 text-sm font-bold text-orange-700 text-left">{moneyFormatter.format(-report.cashPosition.expenses)}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-5 py-2 text-sm text-gray-600">المشتريات النقدية (مستلمة)</td>
                      <td className="px-5 py-2 text-sm font-bold text-orange-700 text-left">{moneyFormatter.format(-report.cashPosition.cashForPurchases)}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-5 py-2 text-sm font-semibold text-gray-700">اجمالي الخارج</td>
                      <td className="px-5 py-2 text-sm font-bold text-orange-700 text-left">{moneyFormatter.format(-report.cashPosition.cashOut)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="flex items-center justify-between border-t-2 border-slate-300 bg-slate-50 px-5 py-3">
                  <span className="text-sm font-bold">صافي التدفق النقدي</span>
                  <span className={`text-sm font-bold ${report.cashPosition.netCash >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {moneyFormatter.format(report.cashPosition.netCash)}
                  </span>
                </div>
              </div>
            </div>

            {report.customerDebt && report.customerDebt.total > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">المبالغ المستحقة من العملاء</h2>
                  <span className="text-sm font-bold text-amber-600">{moneyFormatter.format(report.customerDebt.total)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">العميل</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">الهاتف</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">المبلغ المستحق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.customerDebt.details.map((row) => (
                        <tr key={row.customerId} className="border-t border-gray-100 hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-sm font-medium">{row.customerName}</td>
                          <td className="px-4 py-3 text-sm text-end" dir="ltr">{row.phone || "—"}</td>
                          <td className="px-4 py-3 text-sm font-bold text-amber-600">{moneyFormatter.format(row.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <SubtotalRow label="اجمالي المستحق من العملاء" value={report.customerDebt.total} colSpan={2} color="text-amber-600" />
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-3">
                <h2 className="text-lg font-bold text-slate-900">المبيعات</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">التاريخ</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">رقم الطلب</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">العميل</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">طريقة الدفع</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">الاجمالي</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">حالة الدفع</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesOrders.map((row) => {
                      const expanded = expandedOrders.has(row.id);
                      const items = row.items ?? [];
                      return (
                        <Fragment key={row.id}>
                          <tr
                            onClick={() => (items.length ? toggleOrder(row.id) : undefined)}
                            className={`border-t border-gray-100 ${items.length ? "cursor-pointer hover:bg-slate-50/50" : ""}`}
                          >
                            <td className="px-4 py-3 text-sm"><DateTimeCell value={row.orderDate || row.createdAt} /></td>
                            <td className="px-4 py-3 text-sm font-medium">{row.id.slice(0, 8)}</td>
                            <td className="px-4 py-3 text-sm">{row.customer?.name || "—"}</td>
                            <td className="px-4 py-3 text-sm">{statusBadge(row.paymentMethod)}</td>
                            <td className="px-4 py-3 text-sm font-bold text-green-700">{moneyFormatter.format(row.total)}</td>
                            <td className="px-4 py-3 text-sm">{statusBadge(row.paymentStatus)}</td>
                            <td className="px-4 py-3 text-sm">
                              {items.length > 0 && (
                                <span className="text-slate-400">{expanded ? "▲" : "▼"}</span>
                              )}
                            </td>
                          </tr>
                          {expanded && items.length > 0 && (
                            <tr className="border-t border-gray-100 bg-slate-50/60">
                              <td colSpan={7} className="px-6 py-3">
                                <table className="w-full min-w-[500px]">
                                  <thead>
                                    <tr>
                                      <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-400">المنتج</th>
                                      <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-400">الكمية</th>
                                      <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-400">سعر الوحدة</th>
                                      <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-400">الاجمالي</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((it, idx) => (
                                      <tr key={idx} className="border-t border-gray-100">
                                        <td className="px-3 py-1.5 text-sm">{it.product?.name || "—"}</td>
                                        <td className="px-3 py-1.5 text-sm">{it.quantity}</td>
                                        <td className="px-3 py-1.5 text-sm">{moneyFormatter.format(it.unitPrice)}</td>
                                        <td className="px-3 py-1.5 text-sm font-bold">{moneyFormatter.format(it.quantity * it.unitPrice)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {salesOrders.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-400">لا توجد بيانات</td>
                      </tr>
                    )}
                  </tbody>
                  {salesOrders.length > 0 && (
                    <tfoot>
                      <SubtotalRow label="اجمالي المبيعات" value={salesTotal} colSpan={6} color="text-green-700" />
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-3">
                <h2 className="text-lg font-bold text-slate-900">المشتريات</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">التاريخ</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">رقم الطلب</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">المورد</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">الاجمالي</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseOrders.map((row) => {
                      const expanded = expandedOrders.has(row.id);
                      const items = row.items ?? [];
                      return (
                        <Fragment key={row.id}>
                          <tr
                            onClick={() => (items.length ? toggleOrder(row.id) : undefined)}
                            className={`border-t border-gray-100 ${items.length ? "cursor-pointer hover:bg-slate-50/50" : ""}`}
                          >
                            <td className="px-4 py-3 text-sm"><DateTimeCell value={row.orderDate || row.createdAt} /></td>
                            <td className="px-4 py-3 text-sm font-medium">{row.id.slice(0, 8)}</td>
                            <td className="px-4 py-3 text-sm">{row.supplier?.name || "—"}</td>
                            <td className="px-4 py-3 text-sm font-bold text-blue-700">{moneyFormatter.format(row.total)}</td>
                            <td className="px-4 py-3 text-sm">
                              {items.length > 0 && (
                                <span className="text-slate-400">{expanded ? "▲" : "▼"}</span>
                              )}
                            </td>
                          </tr>
                          {expanded && items.length > 0 && (
                            <tr className="border-t border-gray-100 bg-slate-50/60">
                              <td colSpan={5} className="px-6 py-3">
                                <table className="w-full min-w-[500px]">
                                  <thead>
                                    <tr>
                                      <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-400">المنتج</th>
                                      <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-400">الكمية</th>
                                      <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-400">سعر الوحدة</th>
                                      <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-400">الاجمالي</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((it, idx) => (
                                      <tr key={idx} className="border-t border-gray-100">
                                        <td className="px-3 py-1.5 text-sm">{it.product?.name || "—"}</td>
                                        <td className="px-3 py-1.5 text-sm">{it.quantity}</td>
                                        <td className="px-3 py-1.5 text-sm">{moneyFormatter.format(it.unitPrice)}</td>
                                        <td className="px-3 py-1.5 text-sm font-bold">{moneyFormatter.format(it.quantity * it.unitPrice)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {purchaseOrders.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400">لا توجد بيانات</td>
                      </tr>
                    )}
                  </tbody>
                  {purchaseOrders.length > 0 && (
                    <tfoot>
                       <SubtotalRow label="اجمالي المشتريات" value={purchasesTotal} colSpan={4} color="text-blue-700" />
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-3">
                <h2 className="text-lg font-bold text-slate-900">المصروفات</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">التاريخ</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">الفئة</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">الوصف</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseItems.map((row) => (
                      <tr key={row.id} className="border-t border-gray-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-sm"><DateTimeCell value={row.date} /></td>
                        <td className="px-4 py-3 text-sm font-medium">{row.category}</td>
                        <td className="px-4 py-3 text-sm">{row.description}</td>
                        <td className="px-4 py-3 text-sm font-bold text-orange-700">{moneyFormatter.format(row.amount)}</td>
                      </tr>
                    ))}
                    {expenseItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-400">لا توجد بيانات</td>
                      </tr>
                    )}
                  </tbody>
                   {expenseItems.length > 0 && (
                    <tfoot>
                      <SubtotalRow label="اجمالي المصروفات" value={expensesTotal} colSpan={3} color="text-orange-700" />
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-3">
                <h2 className="text-lg font-bold text-slate-900">التسويات</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[550px]">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">التاريخ</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">رقم التسوية</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">المبلغ</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">محصلها</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlementItems.map((row) => (
                      <tr key={row.id} className="border-t border-gray-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-sm"><DateTimeCell value={row.createdAt} /></td>
                        <td className="px-4 py-3 text-sm font-medium">{row.id.slice(0, 8)}</td>
                        <td className={`px-4 py-3 text-sm font-bold ${row.direction === "SUBTRACTION" ? "text-red-600" : "text-purple-700"}`}>{row.direction === "SUBTRACTION" ? "−" : "+"}{moneyFormatter.format(row.amount)}</td>
                        <td className="px-4 py-3 text-sm">{row.collector?.name || "—"}</td>
                        <td className="px-4 py-3 text-sm">{statusBadge(row.status)}</td>
                      </tr>
                    ))}
                    {settlementItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400">لا توجد بيانات</td>
                      </tr>
                    )}
                  </tbody>
                  {settlementItems.length > 0 && (
                    <tfoot>
                      <SubtotalRow label="اجمالي التسويات" value={settlementsTotal} colSpan={3} color="text-purple-700" />
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-3">
                <h2 className="text-lg font-bold text-slate-900">المرتجعات</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">التاريخ</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">النوع</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">الطرف الآخر</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">الاجمالي</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">السبب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnItems.map((row) => (
                      <tr key={row.id} className="border-t border-gray-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-sm"><DateTimeCell value={row.createdAt} /></td>
                        <td className="px-4 py-3 text-sm">
                          {row.type === "PURCHASE_RETURN" ? (
                            <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">مرتجع مشتريات</span>
                          ) : (
                            <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">مرتجع مبيعات</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">{row.customer?.name || row.supplier?.name || "—"}</td>
                        <td className="px-4 py-3 text-sm font-bold text-red-700">{moneyFormatter.format(row.total)}</td>
                        <td className="px-4 py-3 text-sm">{row.reason}</td>
                      </tr>
                    ))}
                    {returnItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400">لا توجد بيانات</td>
                      </tr>
                    )}
                  </tbody>
                  {returnItems.length > 0 && (
                    <tfoot>
                      <SubtotalRow label="اجمالي المرتجعات" value={returnsTotal} colSpan={4} color="text-red-700" />
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
          )
        ) : (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
            <p className="text-gray-400">لا توجد بيانات</p>
          </div>
        )}
      </div>
    </>
  );
}

const LEDGER_BADGE: Record<LedgerEntry["kind"], { cls: string; labelKey: string }> = {
  SALE: { cls: "bg-green-100 text-green-700", labelKey: "navigation.sales" },
  PURCHASE: { cls: "bg-blue-100 text-blue-700", labelKey: "navigation.purchases" },
  EXPENSE: { cls: "bg-orange-100 text-orange-700", labelKey: "finance.expenses" },
  SETTLEMENT: { cls: "bg-purple-100 text-purple-700", labelKey: "navigation.settlements" },
  SALE_RETURN: { cls: "bg-red-100 text-red-700", labelKey: "reports.salesReturn" },
  PURCHASE_RETURN: { cls: "bg-emerald-100 text-emerald-700", labelKey: "reports.purchaseReturn" },
};

function LedgerTable({ ledger, t }: { ledger: LedgerEntry[]; t: (key: string) => string }) {
  const totalIn = ledger.filter((r) => r.direction === "IN").reduce((s, r) => s + r.amount, 0);
  const totalOut = ledger.filter((r) => r.direction === "OUT").reduce((s, r) => s + r.amount, 0);
  const net = totalIn - totalOut;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ArrowDownRight className="text-green-600" size={18} />
            <p className="text-sm font-medium text-green-700">{t("reports.totalIn")}</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-green-700">{moneyFormatter.format(totalIn)}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="text-red-600" size={18} />
            <p className="text-sm font-medium text-red-700">{t("reports.totalOut")}</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-red-700">{moneyFormatter.format(totalOut)}</p>
        </div>
        <div className={`rounded-2xl border p-5 shadow-sm ${net >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <p className={`text-sm font-medium ${net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{t("reports.netFlow")}</p>
          <p className={`mt-2 text-2xl font-bold ${net >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {moneyFormatter.format(net)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-bold text-slate-900">{t("reports.activityLedger")}</h2>
          <p className="text-sm text-gray-500">
            {t("pagination.showing")} {ledger.length} {t("pagination.of")}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t("common.date")}</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t("reports.type")}</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t("reports.description")}</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t("reports.in")}</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">{t("reports.out")}</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => {
                const badge = LEDGER_BADGE[row.kind];
                return (
                  <tr key={row.id} className="border-t border-gray-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <DateTimeCell value={row.date} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                        {t(badge.labelKey)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.detail}</td>
                    <td className="px-4 py-3 text-sm font-bold text-green-700">
                      {row.direction === "IN" ? moneyFormatter.format(row.amount) : ""}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-red-700">
                      {row.direction === "OUT" ? moneyFormatter.format(row.amount) : ""}
                    </td>
                  </tr>
                );
              })}
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">لا توجد بيانات</td>
                </tr>
              )}
            </tbody>
            {ledger.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <td colSpan={3} className="px-4 py-3 text-sm text-right">الإجمالي</td>
                  <td className="px-4 py-3 text-sm text-left text-green-700">{moneyFormatter.format(totalIn)}</td>
                  <td className="px-4 py-3 text-sm text-left text-red-700">{moneyFormatter.format(totalOut)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
