"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Printer, Receipt } from "lucide-react";

interface PrintMenuProps {
  type: "sale" | "purchase" | "contract" | "return";
  id: string;
}

const FORMATS = [
  { key: "invoice", labelAr: "فاتورة A4", labelEn: "A4 Invoice", format: "" },
  { key: "receipt80", labelAr: "ريسيت 80mm", labelEn: "Receipt 80mm", format: "receipt80" },
  { key: "receipt58", labelAr: "ريسيت 58mm", labelEn: "Receipt 58mm", format: "receipt58" },
] as const;

export default function PrintMenu({ type, id }: PrintMenuProps) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLang(document.documentElement.lang === "en" ? "en" : "ar");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const openUrl = (format: string) => {
    const el = document.documentElement;
    const urlLang = el.lang === "en" ? "en" : "ar";
    const urlDir = el.dir === "ltr" ? "ltr" : "rtl";
    const q = format ? `&format=${format}` : "";
    window.open(`/api/invoices?type=${type}&id=${id}${q}&lang=${urlLang}&dir=${urlDir}`, "_blank");
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={lang === "en" ? "Print" : "طباعة"}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-2 text-xs font-medium text-green-600 transition hover:bg-green-100"
      >
        <Printer size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute z-[70] mt-1.5 min-w-36 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl end-0"
        >
          {FORMATS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="menuitem"
              onClick={() => openUrl(f.format)}
              className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs font-medium text-slate-700 transition hover:bg-green-50 hover:text-green-700"
            >
              {f.key === "invoice" ? <Printer size={14} /> : f.key === "receipt80" ? <Receipt size={14} /> : <FileText size={14} />}
              {lang === "en" ? f.labelEn : f.labelAr}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
