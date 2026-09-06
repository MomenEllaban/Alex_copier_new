"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

export interface QuickAddField {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "email";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface SelectWithAddProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  quickAddTitle: string;
  quickAddFields: QuickAddField[];
  quickAddEndpoint: string;
  quickAddDefaults?: Record<string, string>;
  onQuickAddSuccess?: (newItem: { id: string; name: string }) => void;
  selectClassName?: string;
}

export default function SelectWithAdd({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
  className = "",
  quickAddTitle,
  quickAddFields,
  quickAddEndpoint,
  quickAddDefaults = {},
  onQuickAddSuccess,
  selectClassName,
}: SelectWithAddProps) {
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const inputClass =
    selectClassName ||
    "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const openQuickAdd = () => {
    const initial: Record<string, string> = {};
    for (const field of quickAddFields) {
      initial[field.key] = quickAddDefaults[field.key] ?? "";
    }
    setQuickAddForm(initial);
    setError("");
    setShowQuickAdd(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {};
      for (const field of quickAddFields) {
        const val = quickAddForm[field.key];
        if (val === undefined) continue;
        if (field.type === "number") {
          body[field.key] = val === "" ? null : Number(val);
        } else {
          body[field.key] = val || null;
        }
      }
      const res = await fetch(quickAddEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "حدث خطأ");
        return;
      }
      if (onQuickAddSuccess) {
        onQuickAddSuccess({ id: data.id, name: data.name || quickAddForm.name || "" });
      }
      setShowQuickAdd(false);
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500 ms-0.5">*</span>}
      </label>
      <div className="flex gap-1.5">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} flex-1`}
          required={required}
          disabled={disabled}
        >
          <option value="">{placeholder || `اختر ${label}`}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={openQuickAdd}
          disabled={disabled}
          title={`إضافة ${label}`}
          className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 transition hover:bg-blue-100 disabled:opacity-50"
        >
          <Plus size={18} />
        </button>
      </div>

      {showQuickAdd && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={() => setShowQuickAdd(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-5 sm:p-6 shadow-xl max-h-[92vh] overflow-y-auto sidebar-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">{quickAddTitle}</h3>
              <button
                onClick={() => setShowQuickAdd(false)}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              {quickAddFields.map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {field.label}
                    {field.required && <span className="text-red-500 ms-0.5">*</span>}
                  </label>
                  {field.type === "select" && field.options ? (
                    <select
                      value={quickAddForm[field.key] || ""}
                      onChange={(e) =>
                        setQuickAddForm({ ...quickAddForm, [field.key]: e.target.value })
                      }
                      className={inputClass}
                      required={field.required}
                    >
                      <option value="">{field.placeholder || `اختر ${field.label}`}</option>
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
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
                      min={field.type === "number" ? "0" : undefined}
                      step={field.type === "number" ? "0.01" : undefined}
                    />
                  )}
                </div>
              ))}
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "جاري الحفظ..." : "إضافة"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
