"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/context";
import { apiErrorMessage } from "@/lib/api-client";
import { notifyDataChanged } from "@/lib/data-events";
import SubmitButton from "@/components/SubmitButton";
import { Save, X } from "lucide-react";

export interface CompanyOption {
  id: string;
  name: string;
  nameAr?: string | null;
}

export interface ProductFormData {
  id?: string;
  name: string;
  productType: string;
  companyId: string;
  sku: string;
  egsCode: string;
  purchasePrice: string;
  quantity: string;
  pricingTiers: {
    legacyCustomer: string;
    newCustomer: string;
    jumlaMachines: string;
    jumlaParts: string;
    sectori: string;
    engineer: string;
  };
  description: string;
}

export const PRICE_TIER_OPTIONS = [
  { key: "legacyCustomer", label: "عميل قديم" },
  { key: "newCustomer", label: "عميل جديد" },
  { key: "jumlaMachines", label: "شركة جملة آلات" },
  { key: "jumlaParts", label: "شركة جملة قطع غيار" },
  { key: "sectori", label: "شركة قطاعي" },
  { key: "engineer", label: "مهندس" },
] as const;

export const emptyPricingTiers = {
  legacyCustomer: "",
  newCustomer: "",
  jumlaMachines: "",
  jumlaParts: "",
  sectori: "",
  engineer: "",
};

export const emptyProductForm: ProductFormData = {
  name: "",
  productType: "SPARE_PART",
  companyId: "",
  sku: "",
  egsCode: "",
  purchasePrice: "",
  quantity: "",
  pricingTiers: { ...emptyPricingTiers },
  description: "",
};

interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  companies: CompanyOption[];
  initialCompanyId?: string;
  editingProduct?: {
    id: string;
    name: string;
    productType: string;
    companyId: string;
    sku?: string | null;
    egsCode?: string | null;
    purchasePrice?: number | null;
    pricingTiers?: Record<string, number | null> | null;
    description?: string | null;
  } | null;
  onSuccess: (product: any) => void;
}

export default function ProductFormModal({
  open,
  onClose,
  companies,
  initialCompanyId,
  editingProduct,
  onSuccess,
}: ProductFormModalProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<ProductFormData>(emptyProductForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editingProduct) {
      setForm({
        id: editingProduct.id,
        name: editingProduct.name,
        productType: editingProduct.productType,
        companyId: editingProduct.companyId,
        sku: editingProduct.sku || "",
        egsCode: editingProduct.egsCode || "",
        purchasePrice: editingProduct.purchasePrice != null ? String(editingProduct.purchasePrice) : "",
        quantity: "",
        pricingTiers: {
          legacyCustomer: editingProduct.pricingTiers?.legacyCustomer != null ? String(editingProduct.pricingTiers.legacyCustomer) : "",
          newCustomer: editingProduct.pricingTiers?.newCustomer != null ? String(editingProduct.pricingTiers.newCustomer) : "",
          jumlaMachines: editingProduct.pricingTiers?.jumlaMachines != null ? String(editingProduct.pricingTiers.jumlaMachines) : "",
          jumlaParts: editingProduct.pricingTiers?.jumlaParts != null ? String(editingProduct.pricingTiers.jumlaParts) : "",
          sectori: editingProduct.pricingTiers?.sectori != null ? String(editingProduct.pricingTiers.sectori) : "",
          engineer: editingProduct.pricingTiers?.engineer != null ? String(editingProduct.pricingTiers.engineer) : "",
        },
        description: editingProduct.description || "",
      });
    } else {
      setForm({
        ...emptyProductForm,
        companyId: initialCompanyId || (companies[0]?.id ?? ""),
        pricingTiers: { ...emptyPricingTiers },
      });
    }
    setError("");
  }, [open, editingProduct, initialCompanyId, companies]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        productType: form.productType,
        companyId: form.companyId,
        sku: form.sku.trim() || undefined,
        egsCode: form.egsCode.trim() || undefined,
        description: form.description.trim() || undefined,
        purchasePrice: form.purchasePrice === "" ? null : Number(form.purchasePrice),
        quantity: form.quantity === "" ? undefined : Number(form.quantity),
        pricingTiers: Object.fromEntries(
          PRICE_TIER_OPTIONS.map(({ key }) => [
            key,
            form.pricingTiers[key] === "" ? null : Number(form.pricingTiers[key]),
          ])
        ),
      };

      const isEdit = Boolean(editingProduct?.id);
      const url = isEdit ? `/api/products/${editingProduct!.id}` : "/api/products";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(data, t));
        return;
      }

      notifyDataChanged(["products", "inventory", "sales", "purchases"]);
      onSuccess(data);
      onClose();
    } catch {
      setError(t("common.connectionError"));
    } finally {
      setSaving(false);
    }
  };

  const title = editingProduct ? t("products.editProduct") : t("products.addProduct");

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-xs p-2 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-4xl rounded-t-2xl sm:rounded-2xl bg-white p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto sidebar-scroll transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t("products.name")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t("products.type")} <span className="text-red-500">*</span>
              </label>
              <select
                value={form.productType}
                onChange={(e) => setForm({ ...form, productType: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="SPARE_PART">{t("products.sparePart")}</option>
                <option value="MACHINE">{t("products.machine")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t("warehouses.company")} <span className="text-red-500">*</span>
              </label>
              <select
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">{t("common.selectOption")}</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.nameAr || company.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="mb-1 block text-sm font-medium text-slate-700">SKU</label>
              <input
                type="text"
                dir="ltr"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="mb-1 block text-sm font-medium text-slate-700">EGS</label>
              <input
                type="text"
                dir="ltr"
                value={form.egsCode}
                onChange={(e) => setForm({ ...form, egsCode: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">أسعار المنتج</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("products.purchasePrice")}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.purchasePrice}
                  onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="mb-1 block text-sm font-medium text-slate-700">الكمية الحالية</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">أسعار البيع حسب شريحة العميل</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {PRICE_TIER_OPTIONS.map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.pricingTiers[key] ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        pricingTiers: { ...form.pricingTiers, [key]: e.target.value },
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("products.description")}</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              {t("common.cancel")}
            </button>
            <SubmitButton
              loading={saving}
              label={t("common.save")}
              loadingLabel={t("common.saving")}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Save size={16} />
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
