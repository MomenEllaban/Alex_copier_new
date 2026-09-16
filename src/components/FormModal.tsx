"use client";

import { X } from "lucide-react";

interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  /** Widest layout for data-heavy tables (e.g. tests history). */
  xl?: boolean;
  maxWidthClass?: string;
}

export default function FormModal({ open, onClose, title, children, wide, xl, maxWidthClass }: FormModalProps) {
  if (!open) return null;

  const sizeClass = maxWidthClass
    ? maxWidthClass
    : xl
    ? "max-w-[96vw] xl:max-w-7xl"
    : wide
    ? "max-w-4xl"
    : "max-w-xl";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs p-2 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${sizeClass} rounded-t-2xl sm:rounded-2xl bg-white p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto sidebar-scroll transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
