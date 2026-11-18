"use client";

import { useI18n } from "@/i18n/context";

export interface CompanyTabOption {
  id: string;
  name?: string | null;
  nameAr?: string | null;
}

interface CompanyTabsProps {
  companies: CompanyTabOption[];
  /** "" means "all companies" */
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
  showAll?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * Company selector as tabs: "الكل" + one tab per company.
 * `""` keeps the existing "all companies" value used by every list page,
 * so no data-fetching changes are needed.
 */
export default function CompanyTabs({
  companies,
  value,
  onChange,
  allLabel,
  showAll = true,
  ariaLabel,
  className = "",
}: CompanyTabsProps) {
  const { t } = useI18n();

  const tabs = [
    ...(showAll ? [{ id: "", label: allLabel || t("common.all") }] : []),
    ...companies.map((company) => ({
      id: company.id,
      label: company.nameAr || company.name || company.id,
    })),
  ];

  return (
    <div
      role="tablist"
      aria-label={ariaLabel || t("common.company")}
      className={`no-print flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm ${className}`}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id || "all"}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={`min-w-24 flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
            value === tab.id
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
