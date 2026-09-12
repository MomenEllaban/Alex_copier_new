"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  dropdownClassName?: string;
  id?: string;
  disabledValues?: string[];
}

function normalize(s: string) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "اختر...",
  searchPlaceholder = "ابحث...",
  emptyText = "لا توجد نتائج",
  disabled,
  required,
  className = "",
  dropdownClassName = "",
  id,
  disabledValues,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const inputId = id || `ss-${reactId.replace(/:/g, "")}`;

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) => normalize(o.label).includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  useEffect(() => {
    if (open) {
      setHighlight(0);
      // focus search every time dropdown opens so typing filters immediately
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setQuery("");
    }
  }, [open ]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${highlight}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* native hidden input keeps `required` form validation working */}
      {required && (
        <input
          id={`${inputId}-req`}
          required
          value={value}
          onChange={() => {}}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          tabIndex={-1}
          aria-hidden
        />
      )}
      <div
        id={inputId}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        } ${selected ? "text-slate-900" : "text-gray-400"}`}
      >
        <span className="flex-1 truncate text-start">
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              aria-label="مسح الاختيار"
              onClick={(e) => {
                e.stopPropagation();
                pick("");
              }}
              className="rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </div>

      {open && !disabled && (
        <div
          className={`absolute z-[60] mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl ${dropdownClassName}`}
        >
          {/* search is always visible while typing */}
          <div className="border-b border-gray-100 p-2">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlight((h) => Math.min(h + 1, filtered.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlight((h) => Math.max(h - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const target = filtered[highlight];
                    if (target && !disabledValues?.includes(target.value)) pick(target.value);
                  }
                }}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-gray-200 bg-slate-50 py-2 pe-3 ps-8 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
                  aria-label="مسح البحث"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div ref={listRef} role="listbox" className="max-h-60 overflow-y-auto p-1.5 sidebar-scroll">
            {/* clear / all option */}
            <div
              role="option"
              aria-selected={!value}
              data-index={-1}
              onClick={() => pick("")}
              className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm transition hover:bg-blue-50 ${
                !value ? "bg-blue-50 font-medium text-blue-700" : "text-slate-500"
              }`}
            >
              <span>{placeholder}</span>
              {!value && <Check size={15} className="text-blue-600" />}
            </div>

            {filtered.map((opt, i) => {
              const active = opt.value === value;
              const isDisabled = disabledValues?.includes(opt.value);
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={active}
                  aria-disabled={isDisabled}
                  data-index={i}
                  onClick={() => !isDisabled && pick(opt.value)}
                  onMouseEnter={() => !isDisabled && setHighlight(i)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
                    i === highlight && !isDisabled ? "bg-blue-50" : ""
                  } ${active ? "font-medium text-blue-700" : "text-slate-800"} ${
                    isDisabled ? "cursor-not-allowed opacity-40" : ""
                  }`}
                  title={opt.label}
                >
                  <span className="flex-1 truncate">{opt.label}</span>
                  {active && <Check size={15} className="shrink-0 text-blue-600" />}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-gray-400">{emptyText}</div>
            )}
          </div>

          {query && filtered.length > 0 && (
            <div className="border-t border-gray-100 bg-slate-50 px-3 py-1.5 text-xs text-gray-400">
              {filtered.length} نتيجة
            </div>
          )}
        </div>
      )}
    </div>
  );
}
