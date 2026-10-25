"use client";

import { useEffect, useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import { useI18n } from "@/i18n/context";
import { notifyDataChanged, type DataEntity } from "@/lib/data-events";

export interface QuickAddField {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "email" | "textarea";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  step?: string;
  min?: string;
  colSpan?: 1 | 2;
}

export interface SelectWithAddProps {
  label?: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  quickAddTitle?: string;
  quickAddFields?: QuickAddField[];
  quickAddEndpoint?: string;
  quickAddDefaults?: Record<string, string | number | undefined>;
  onQuickAddSuccess?: (newItem: any) => void;
  selectClassName?: string;
  buttonTitle?: string;
  buttonClassName?: string;
  modalWidthClass?: string;
  notifyEntities?: DataEntity[];
  onCustomAdd?: () => void;
}

export default function SelectWithAdd({
  label,
  hideLabel = false,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
  className = "",
  quickAddTitle,
  quickAddFields = [],
  quickAddEndpoint,
  quickAddDefaults = {},
  onQuickAddSuccess,
  selectClassName,
  buttonTitle,
  buttonClassName,
  modalWidthClass,
  notifyEntities,
  onCustomAdd,
}: SelectWithAddProps) {
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { t } = useI18n();

  const inputClass =
    selectClassName ||
    "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

  // Escape key handler when modal is open
  useEffect(() => {
    if (!showQuickAdd || onCustomAdd) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowQuickAdd(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showQuickAdd, onCustomAdd]);

  const openQuickAdd = () => {
    if (onCustomAdd) {
      onCustomAdd();
      return;
    }
    const initial: Record<string, string> = {};
    for (const field of quickAddFields) {
      const defaultVal = quickAddDefaults[field.key];
      initial[field.key] = defaultVal !== undefined && defaultVal !== null ? String(defaultVal) : "";
    }
    setQuickAddForm(initial);
    setError("");
    setShowQuickAdd(true);
  };

  const handleSubmit = async () => {
    // Client-side required validation
    for (const field of quickAddFields) {
      if (field.required) {
        const val = quickAddForm[field.key];
        if (val === undefined || val === null || String(val).trim() === "") {
          setError(`حقل "${field.label}" مطلوب`);
          return;
        }
      }
    }

    if (!quickAddEndpoint) return;

    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {};
      for (const field of quickAddFields) {
        const val = quickAddForm[field.key];
        if (val === undefined) continue;
        if (field.type === "number") {
          body[field.key] = val === "" || val === null ? null : Number(val);
        } else {
          body[field.key] = val === "" ? null : val;
        }
      }

      const res = await fetch(quickAddEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t("common.error"));
        return;
      }

      const newItem = {
        ...data,
        id: data.id,
        name: data.name || quickAddForm.name || "",
        companyId: typeof data.companyId === "string" ? data.companyId : undefined,
      };

      if (newItem.id) {
        onChange(newItem.id);
      }

      if (onQuickAddSuccess) {
        onQuickAddSuccess(newItem);
      }

      if (notifyEntities && notifyEntities.length > 0) {
        notifyDataChanged(notifyEntities);
      }

      setShowQuickAdd(false);
    } catch {
      setError(t("common.connectionError"));
    } finally {
      setSaving(false);
    }
  };

  const titleText = buttonTitle || (label ? `${t("common.add")} ${label}` : t("common.add"));

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && !hideLabel && (
        <label className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ms-0.5">*</span>}
        </label>
      )}
      <div className="flex items-center gap-1.5">
        <SearchableSelect
          value={value}
          onChange={onChange}
          options={options}
          placeholder={placeholder || (label ? `${t("common.select")} ${label}` : `${t("common.select")}...`)}
          disabled={disabled}
          required={required}
          className="flex-1 min-w-0"
        />
        <button
          type="button"
          onClick={openQuickAdd}
          disabled={disabled}
          title={titleText}
          aria-label={titleText}
          className={
            buttonClassName ||
            "inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 transition hover:bg-blue-100 hover:border-blue-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-xs"
          }
        >
          <Plus size={18} className="stroke-[2.5]" />
        </button>
      </div>

      {showQuickAdd && !onCustomAdd && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-xs p-2 sm:items-center sm:p-4 animate-in fade-in duration-150"
          onClick={() => setShowQuickAdd(false)}
          role="dialog"
          aria-modal="true"
          aria-label={quickAddTitle}
        >
          <div
            className={`w-full ${modalWidthClass || "max-w-lg"} rounded-t-2xl sm:rounded-2xl bg-white p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto sidebar-scroll transition-all`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                  <Plus size={18} className="stroke-[2.5]" />
                </div>
                <h3 className="text-base font-bold text-slate-900">{quickAddTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAdd(false)}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {quickAddFields.map((field) => {
                const isFull = field.colSpan === 2 || field.type === "textarea" || field.colSpan === undefined;
                return (
                  <div key={field.key} className={isFull ? "sm:col-span-2 space-y-1" : "space-y-1"}>
                    <label className="block text-sm font-medium text-slate-700">
                      {field.label}
                      {field.required && <span className="text-red-500 ms-0.5">*</span>}
                    </label>

                    {field.type === "select" && field.options ? (
                      <SearchableSelect
                        value={quickAddForm[field.key] || ""}
                        onChange={(v) =>
                          setQuickAddForm({ ...quickAddForm, [field.key]: v })
                        }
                        options={field.options}
                        placeholder={field.placeholder || `${t("common.select")} ${field.label}`}
                        required={field.required}
                      />
                    ) : field.type === "textarea" ? (
                      <textarea
                        value={quickAddForm[field.key] || ""}
                        onChange={(e) =>
                          setQuickAddForm({ ...quickAddForm, [field.key]: e.target.value })
                        }
                        placeholder={field.placeholder}
                        className={inputClass}
                        rows={2}
                        required={field.required}
                      />
                    ) : (
                      <input
                        type={field.type || "text"}
                        value={quickAddForm[field.key] || ""}
                        onChange={(e) =>
                          setQuickAddForm({ ...quickAddForm, [field.key]: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSubmit();
                          }
                        }}
                        placeholder={field.placeholder}
                        className={inputClass}
                        required={field.required}
                        min={field.min ?? (field.type === "number" ? "0" : undefined)}
                        step={field.step ?? (field.type === "number" ? "0.01" : undefined)}
                      />
                    )}
                  </div>
                );
              })}

              {error && (
                <div className="sm:col-span-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700 font-medium">
                  {error}
                </div>
              )}

              <div className="sm:col-span-2 flex gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 active:scale-98"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-98 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{t("common.saving")}</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} className="stroke-[2.5]" />
                      <span>{t("common.add")}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
