"use client";

import { useState } from "react";
import { Printer, Download, Receipt, Package, FileText, CheckCircle2, ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { useI18n } from "@/i18n/context";
import FormModal from "@/components/FormModal";
import { exportRowsToCsv } from "@/lib/csv";
import {
  buildSupplierStatement,
  buildSupplierStatementPrintHtml,
  type PurchaseOrderLite,
  type PurchaseReturnLite,
  type SupplierPaymentLite,
} from "@/lib/supplier-statement";
import { getJumlaSupplierInvoices } from "@/lib/jumla-suppliers-ledger";

interface Props {
  open: boolean;
  onClose: () => void;
  supplierName: string;
  supplierId: string;
  companyName?: string;
  orders: PurchaseOrderLite[];
  returns: PurchaseReturnLite[];
  payments?: SupplierPaymentLite[];
  onRecordPayment?: (supplierId: string) => void;
}

export default function SupplierStatementModal({
  open,
  onClose,
  supplierName,
  supplierId,
  companyName,
  orders,
  returns,
  payments,
  onRecordPayment,
}: Props) {
  const { t, locale } = useI18n();
  const [activeTab, setActiveTab] = useState<"ledger" | "invoices">("ledger");

  if (!open) return null;

  const statement = buildSupplierStatement(supplierId, orders, returns, supplierName, payments);
  const invoiceDetails = getJumlaSupplierInvoices(supplierName);

  const dateFmt = (v: string) => {
    try {
      if (v.includes("/")) return v;
      return new Date(v).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB");
    } catch {
      return v;
    }
  };

  const handlePrint = () => {
    const html = buildSupplierStatementPrintHtml(
      supplierName,
      companyName || "شركة جملة آلات",
      statement,
      new Date().toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB"),
    );
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const handleExport = () => {
    exportRowsToCsv(`supplier-statement-${supplierName.replace(/\s+/g, "_")}`, [
      "التاريخ",
      "رقم المستند",
      "نوع الحركة",
      "البيان والتفاصيل",
      "مدين (مسدد)",
      "دائن (مستحق)",
      "الرصيد التراكمي",
    ], statement.entries.map((e) => [
      e.date.split("T")[0],
      e.docNumber || "—",
      e.docType || (e.kind === "PURCHASE" ? "فاتورة مشتريات" : "مرتجع"),
      e.label,
      String(e.debit || 0),
      String(e.credit || 0),
      String(e.runningBalance || 0),
    ]));
  };

  const badgeColor = (docType?: string, debit = 0) => {
    if (debit > 0 || docType === "كاش" || docType === "صرف نقدية") {
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    }
    if (docType === "استلام نقدية") {
      return "bg-purple-100 text-purple-800 border-purple-200";
    }
    if (docType === "رصيد افتتاحي موردين") {
      return "bg-amber-100 text-amber-800 border-amber-200";
    }
    return "bg-blue-100 text-blue-800 border-blue-200";
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`كشف حساب المورد — ${supplierName} ${statement.code ? `(كود ${statement.code})` : ""}`}
      wide
    >
      {/* 4 Summary Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3 shadow-xs">
          <div className="flex items-center justify-between text-xs text-blue-700 font-medium">
            <span>إجمالي الفواتير (دائن)</span>
            <ArrowUpRight size={14} className="text-blue-600" />
          </div>
          <span className="mt-1 block text-lg font-black text-blue-900">
            {statement.totalPurchases.toLocaleString("ar-EG")} ج.م
          </span>
          <span className="text-[11px] text-blue-600 font-medium">
            {statement.ordersCount} فاتورة ومستند
          </span>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 shadow-xs">
          <div className="flex items-center justify-between text-xs text-emerald-700 font-medium">
            <span>المسدد كاش ودفعات (مدين)</span>
            <ArrowDownLeft size={14} className="text-emerald-600" />
          </div>
          <span className="mt-1 block text-lg font-black text-emerald-900">
            {statement.totalPaid.toLocaleString("ar-EG")} ج.م
          </span>
          <span className="text-[11px] text-emerald-600 font-medium">دفعات وصرف نقدي</span>
        </div>

        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-xs">
          <div className="flex items-center justify-between text-xs text-amber-700 font-semibold">
            <span>صافي المستحق (دائن)</span>
            <Receipt size={14} className="text-amber-600" />
          </div>
          <span className="mt-1 block text-lg font-black text-amber-900">
            {statement.balance.toLocaleString("ar-EG")} ج.م
          </span>
          <span className="text-[11px] text-amber-700 font-medium">رصيد قائم للمورد</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>آخر دفعة مسددة</span>
            <CheckCircle2 size={14} className="text-slate-500" />
          </div>
          <span className="mt-1 block text-base font-bold text-slate-800">
            {statement.lastPaymentAmount
              ? `${statement.lastPaymentAmount.toLocaleString("ar-EG")} ج.م`
              : "لا توجد"}
          </span>
          <span className="text-[11px] text-slate-500 font-mono">
            {statement.lastPaymentDate || "—"}
          </span>
        </div>
      </div>

      {/* Tabs and Actions bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveTab("ledger")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              activeTab === "ledger"
                ? "bg-slate-900 text-white shadow-xs"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <FileText size={14} />
            كشف الحساب وحركات الأرصدة ({statement.entries.length})
          </button>
          {invoiceDetails.length > 0 && (
            <button
              onClick={() => setActiveTab("invoices")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                activeTab === "invoices"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
              }`}
            >
              <Package size={14} />
              تفاصيل أصناف فواتير المشتريات ({invoiceDetails.length})
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRecordPayment && (
            <button
              onClick={() => onRecordPayment(supplierId)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 shadow-xs"
            >
              <Wallet size={14} />
              تسجيل دفعة سداد
            </button>
          )}
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-sky-700 shadow-xs"
          >
            <Printer size={14} />
            طباعة كشف الحساب
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3.5 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
          >
            <Download size={14} />
            تصدير كشف الحساب (Excel)
          </button>
        </div>
      </div>

      {/* TAB 1: Complete 7-Column Accounting Ledger */}
      {activeTab === "ledger" && (
        <>
          {statement.entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              {t("common.noData")}
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-auto rounded-xl border border-gray-200 shadow-xs">
              <table className="w-full min-w-[700px] text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-3 text-start font-bold">التاريخ</th>
                    <th className="px-3 py-3 text-center font-bold">رقم المستند</th>
                    <th className="px-3 py-3 text-start font-bold">نوع الحركة</th>
                    <th className="px-3 py-3 text-start font-bold">البيان والملاحظات</th>
                    <th className="px-3 py-3 text-end font-bold text-emerald-700">مدين (مسدد)</th>
                    <th className="px-3 py-3 text-end font-bold text-blue-700">دائن (مستحق)</th>
                    <th className="px-3 py-3 text-end font-bold text-amber-800">الرصيد التراكمي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {statement.entries.map((e, idx) => (
                    <tr key={`${e.id}-${idx}`} className="hover:bg-slate-50/80 transition">
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-700">
                        {dateFmt(e.date)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-center font-bold font-mono text-slate-900">
                        {e.docNumber || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${badgeColor(
                            e.docType,
                            e.debit,
                          )}`}
                        >
                          {e.docType || (e.kind === "PURCHASE" ? "فاتورة مشتريات" : "مرتجع")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 max-w-xs">{e.label}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-end font-bold text-emerald-700">
                        {e.debit > 0 ? `${e.debit.toLocaleString("ar-EG")} ج.م` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-end font-bold text-blue-700">
                        {e.credit > 0 ? `${e.credit.toLocaleString("ar-EG")} ج.م` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-end font-black text-amber-800">
                        {e.runningBalance.toLocaleString("ar-EG")} ج.م
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-10 bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={4} className="px-3 py-2.5 text-start">
                      الإجمالي العام ({statement.entries.length} حركة)
                    </td>
                    <td className="px-3 py-2.5 text-end text-emerald-800">
                      {statement.totalPaid.toLocaleString("ar-EG")} ج.م
                    </td>
                    <td className="px-3 py-2.5 text-end text-blue-800">
                      {statement.totalPurchases.toLocaleString("ar-EG")} ج.م
                    </td>
                    <td className="px-3 py-2.5 text-end font-black text-amber-900">
                      {statement.balance.toLocaleString("ar-EG")} ج.م
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {/* TAB 2: Invoices Breakdown & Machine Lines */}
      {activeTab === "invoices" && (
        <div className="space-y-4 max-h-[55vh] overflow-auto">
          {invoiceDetails.map((inv) => (
            <div key={inv.invoiceNumber} className="rounded-xl border border-sky-200 bg-white p-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-sky-100 pb-3 gap-2">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    فاتورة رقم {inv.invoiceNumber} — {inv.supplierName}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    التاريخ: {inv.date} {inv.branch ? `| ${inv.branch}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">
                    الإجمالي: {inv.total.toLocaleString("ar-EG")} ج.م
                  </span>
                  {inv.discount > 0 && (
                    <span className="rounded-md bg-red-50 px-2 py-1 font-medium text-red-700 border border-red-200">
                      خصم: {inv.discount.toLocaleString("ar-EG")} ج.م
                    </span>
                  )}
                  <span className="rounded-md bg-emerald-50 px-2 py-1 font-bold text-emerald-800 border border-emerald-200">
                    مسدد كاش: {inv.cashPaid.toLocaleString("ar-EG")} ج.م
                  </span>
                  <span className="rounded-md bg-amber-100 px-2.5 py-1 font-black text-amber-900">
                    آجل متبقي: {inv.remainingDue.toLocaleString("ar-EG")} ج.م
                  </span>
                </div>
              </div>

              {inv.notes && (
                <p className="mt-2 text-xs text-sky-800 bg-sky-50/60 p-2 rounded-lg">
                  {inv.notes}
                </p>
              )}

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-start text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 border-b border-gray-200">
                      <th className="py-2 px-2 text-center w-8">م</th>
                      <th className="py-2 px-2 text-start font-semibold">كود الصنف</th>
                      <th className="py-2 px-2 text-start font-semibold">اسم الصنف / الموديل</th>
                      <th className="py-2 px-2 text-center font-semibold">الكمية</th>
                      <th className="py-2 px-2 text-end font-semibold">سعر الوحدة</th>
                      <th className="py-2 px-2 text-end font-semibold">الصافي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inv.items.map((item) => (
                      <tr key={item.index} className="hover:bg-slate-50/50">
                        <td className="py-2 px-2 text-center font-mono text-gray-400">{item.index}</td>
                        <td className="py-2 px-2 font-mono text-gray-600">{item.code}</td>
                        <td className="py-2 px-2 font-bold text-slate-800">{item.name}</td>
                        <td className="py-2 px-2 text-center font-semibold text-slate-700">{item.quantity}</td>
                        <td className="py-2 px-2 text-end text-slate-600">
                          {item.unitPrice.toLocaleString("ar-EG")} ج.م
                        </td>
                        <td className="py-2 px-2 text-end font-bold text-slate-900">
                          {item.total.toLocaleString("ar-EG")} ج.م
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </FormModal>
  );
}
