"use client";

import { Printer, Download } from "lucide-react";
import { useI18n } from "@/i18n/context";
import FormModal from "@/components/FormModal";
import { exportRowsToCsv } from "@/lib/csv";
import {
  buildSupplierStatement,
  buildSupplierStatementPrintHtml,
  type PurchaseOrderLite,
  type PurchaseReturnLite,
} from "@/lib/supplier-statement";

interface Props {
  open: boolean;
  onClose: () => void;
  supplierName: string;
  supplierId: string;
  companyName?: string;
  orders: PurchaseOrderLite[];
  returns: PurchaseReturnLite[];
}

export default function SupplierStatementModal({
  open,
  onClose,
  supplierName,
  supplierId,
  companyName,
  orders,
  returns,
}: Props) {
  const { t, locale } = useI18n();
  if (!open) return null;

  const statement = buildSupplierStatement(supplierId, orders, returns);
  const dateFmt = (v: string) =>
    new Date(v).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB");

  const handlePrint = () => {
    const html = buildSupplierStatementPrintHtml(
      supplierName,
      companyName || "",
      statement,
      new Date().toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB"),
    );
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const handleExport = () => {
    exportRowsToCsv(`supplier-statement-${supplierId.slice(0, 8)}`, [
      t("common.date"),
      t("suppliers.statementType"),
      t("suppliers.statementDetails"),
      t("common.amount"),
    ], statement.entries.map((e) => [
      new Date(e.date).toISOString().slice(0, 10),
      e.kind === "PURCHASE" ? t("suppliers.statementPurchase") : t("suppliers.statementReturn"),
      e.label,
      String(e.amount),
    ]));
  };

  return (
    <FormModal open={open} onClose={onClose} title={`${t("suppliers.statement")} — ${supplierName}`} wide>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <span className="block text-xs text-blue-600">{t("suppliers.totalPurchases")}</span>
          <span className="mt-1 block text-lg font-bold text-blue-800">
            {statement.totalPurchases.toLocaleString("ar-EG")} ج.م
          </span>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <span className="block text-xs text-gray-500">{t("suppliers.ordersCount")}</span>
          <span className="mt-1 block text-lg font-bold text-slate-800">{statement.ordersCount}</span>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
          <span className="block text-xs text-orange-600">{t("suppliers.returnsTotal")}</span>
          <span className="mt-1 block text-lg font-bold text-orange-700">
            {statement.returnsTotal.toLocaleString("ar-EG")} ج.م
          </span>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <span className="block text-xs text-amber-600">{t("suppliers.balanceDue")}</span>
          <span className="mt-1 block text-lg font-bold text-amber-700">
            {statement.balance.toLocaleString("ar-EG")} ج.م
          </span>
        </div>
      </div>

      <p className="mb-3 text-xs text-gray-500">{t("suppliers.returnsNote")}</p>

      <div className="mb-4 flex gap-2">
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
        >
          <Printer size={15} />{t("common.print")}
        </button>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-green-600 px-3 py-2 text-sm font-medium text-green-700 transition hover:bg-green-50"
        >
          <Download size={15} />{t("common.export")}
        </button>
      </div>

      {statement.entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">{t("common.noData")}</p>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.date")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.statementType")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.statementDetails")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.amount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {statement.entries.map((e) => (
                <tr key={`${e.kind}-${e.id}`} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-2.5">{dateFmt(e.date)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${e.kind === "PURCHASE" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                      {e.kind === "PURCHASE" ? t("suppliers.statementPurchase") : t("suppliers.statementReturn")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{e.label}</td>
                  <td className={`whitespace-nowrap px-4 py-2.5 font-bold ${e.amount < 0 ? "text-red-600" : "text-green-700"}`}>
                    {e.amount.toLocaleString("ar-EG")} ج.م
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FormModal>
  );
}
