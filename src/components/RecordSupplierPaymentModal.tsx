"use client";

import { useState } from "react";
import { Save, Wallet, AlertCircle, Trash2, Link2 } from "lucide-react";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import { useConfirm, useToast } from "@/components/UIProvider";
import { useI18n } from "@/i18n/context";
import { apiErrorMessage } from "@/lib/api-client";
import { notifyDataChanged } from "@/lib/data-events";
import type { SupplierPaymentLite } from "@/lib/supplier-statement";

export interface SupplierForPayment {
  id: string;
  name: string;
  companyId?: string | null;
  company?: { id: string; name: string } | null;
  balance?: number;
  totalPurchases?: number;
  totalPaid?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  supplier: SupplierForPayment | null;
  companies: Array<{ id: string; name: string }>;
  onSuccess: () => void;
  /** When provided the modal edits/deletes this payment instead of creating one. */
  payment?: SupplierPaymentLite | null;
  canDelete?: boolean;
}

const PAYMENT_METHODS = [
  { value: "كاش", label: "كاش (نقداً)" },
  { value: "صرف نقدية", label: "صرف نقدية من الخزينة" },
  { value: "تحويل بنكي", label: "تحويل بنكي" },
  { value: "شيك", label: "شيك مصرفي" },
  { value: "أخرى", label: "أخرى" },
];

function toDateInput(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function RecordSupplierPaymentModal({
  open,
  onClose,
  supplier,
  companies,
  onSuccess,
  payment,
  canDelete = true,
}: Props) {
  const { t } = useI18n();
  const { success: toastSuccess, error: toastError } = useToast();
  const confirmAction = useConfirm();

  const [amount, setAmount] = useState(() => (payment ? String(payment.amount) : ""));
  const [paymentDate, setPaymentDate] = useState(() =>
    payment ? toDateInput(payment.paymentDate) : new Date().toISOString().slice(0, 10),
  );
  const [paymentMethod, setPaymentMethod] = useState(() => payment?.paymentMethod || "كاش");
  const [docNumber, setDocNumber] = useState(() => payment?.docNumber || "");
  const [notes, setNotes] = useState(() => payment?.notes || "");
  const [companyId, setCompanyId] = useState(() =>
    payment
      ? payment.companyId || ""
      : supplier?.companyId || companies[0]?.id || "",
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState("");

  if (!open || !supplier) return null;

  const currentBalance = supplier.balance ?? 0;
  const numAmount = parseFloat(amount || "0");
  const balanceBeforeThisPayment = currentBalance + (payment ? Number(payment.amount) || 0 : 0);
  const newBalance = balanceBeforeThisPayment - (isNaN(numAmount) ? 0 : numAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!numAmount || numAmount <= 0) {
      const msg = "المبلغ يجب أن يكون أكبر من صفر";
      setFormError(msg);
      toastError(msg);
      return;
    }

    setSaving(true);
    try {
      const url = payment
        ? `/api/suppliers/${supplier.id}/payments/${payment.id}`
        : `/api/suppliers/${supplier.id}/payments`;
      const res = await fetch(url, {
        method: payment ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numAmount,
          paymentDate: paymentDate || undefined,
          paymentMethod,
          docNumber: docNumber.trim() || undefined,
          notes: notes.trim() || undefined,
          companyId: companyId || undefined,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = apiErrorMessage(data, t);
        setFormError(msg);
        toastError(msg);
        return;
      }

      toastSuccess(
        payment
          ? t("payments.updated")
          : `تم تسجيل دفعة بقيمة ${numAmount.toLocaleString("ar-EG")} ج.م للمورد ${supplier.name} بنجاح`,
      );
      notifyDataChanged(["suppliers", "purchases", "payments"]);
      onSuccess();
      onClose();
    } catch {
      const msg = "حدث خطأ أثناء حفظ الدفعة";
      setFormError(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!payment) return;
    const confirmed = await confirmAction({
      title: t("payments.deleteTitle"),
      message: t(
        payment.purchaseOrderId ? "payments.deleteLinkedConfirm" : "payments.deleteConfirm",
      ),
      confirmLabel: t("common.delete"),
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}/payments/${payment.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toastError(apiErrorMessage(data, t));
        return;
      }
      toastSuccess(t("payments.deleted"));
      notifyDataChanged(["suppliers", "purchases", "payments"]);
      onSuccess();
      onClose();
    } catch {
      toastError(t("common.error"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        payment
          ? `${t("payments.editTitle")} — ${supplier.name}`
          : `تسجيل دفعة مستلمة للمورد — ${supplier.name}`
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
        {/* Balance Preview Header Card */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-amber-900 flex items-center gap-1.5">
              <Wallet size={16} className="text-amber-700" />
              حساب ومستحقات المورد الحالية
            </span>
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              دائن
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
            <div className="rounded-lg bg-white p-2 border border-amber-100">
              <span className="block text-[11px] text-gray-500">الرصيد المستحق الحالي</span>
              <span className="text-sm font-black text-amber-900">
                {currentBalance.toLocaleString("ar-EG")} ج.م
              </span>
            </div>

            <div className="rounded-lg bg-white p-2 border border-amber-100">
              <span className="block text-[11px] text-gray-500">المبلغ المدخل للسداد</span>
              <span className="text-sm font-bold text-emerald-700">
                {numAmount > 0 ? `${numAmount.toLocaleString("ar-EG")} ج.م` : "—"}
              </span>
            </div>

            <div className="rounded-lg bg-white p-2 border border-amber-100 col-span-2 sm:col-span-1">
              <span className="block text-[11px] text-gray-500">المتبقي بعد السداد</span>
              <span className={`text-sm font-black ${newBalance <= 0 ? "text-emerald-700" : "text-amber-900"}`}>
                {newBalance.toLocaleString("ar-EG")} ج.م
              </span>
            </div>
          </div>

          {newBalance < 0 && (
            <p className="text-[11px] text-emerald-700 font-medium">
              * تنبيه: المبلغ يتجاوز الرصيد الحالي وسيصبح للمنشأة رصيد دائن لدى المورد بمقدار {Math.abs(newBalance).toLocaleString("ar-EG")} ج.م.
            </p>
          )}
        </div>

        {payment?.purchaseOrderId && (
          <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-800">
            <Link2 size={15} className="mt-0.5 shrink-0" />
            <span>
              {t("payments.linkedInvoice")}: <span className="font-mono">{payment.purchaseOrderId.slice(0, 8)}</span>
              <span className="mt-1 block text-[11px] text-sky-700">{t("payments.linkedInvoiceHint")}</span>
            </span>
          </div>
        )}

        {formError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            <AlertCircle size={15} className="shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Company & Payment Method */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block font-medium text-slate-700">الشركة / الفرع</label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">شركة المورد الافتراضية</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block font-medium text-slate-700">طريقة السداد *</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              {paymentMethod && !PAYMENT_METHODS.some((m) => m.value === paymentMethod) && (
                <option value={paymentMethod}>{paymentMethod}</option>
              )}
            </select>
          </div>
        </div>

        {/* Amount & Date */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block font-medium text-slate-700">
              المبلغ المسدد (ج.م) *
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-medium text-slate-700">تاريخ السداد *</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        {/* Receipt / Doc Number & Notes */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block font-medium text-slate-700">رقم السند / الإيصال / الشيك</label>
            <input
              type="text"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder="مثال: سند صرف 104 أو رقم الشيك"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-medium text-slate-700">البيان وملاحظات السداد</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="دفعة تحت الحساب / سداد فاتورة..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse gap-2.5 pt-3 sm:flex-row sm:items-center sm:justify-between border-t border-gray-200">
          <div>
            {payment && canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
              >
                <Trash2 size={15} />
                {t("payments.delete")}
              </button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deleting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              {t("common.cancel")}
            </button>
            <SubmitButton
              loading={saving || deleting}
              label={payment ? t("payments.saveEdit") : "تأكيد وتسجيل الدفعة"}
              loadingLabel={t("payments.updating")}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              <Save size={16} />
            </SubmitButton>
          </div>
        </div>
      </form>
    </FormModal>
  );
}
