"use client";

import SearchableSelect from "./SearchableSelect";

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  allLabel: string;
  className?: string;
}

export default function FilterSelect({ value, onChange, options, allLabel, className = "" }: FilterSelectProps) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={allLabel}
      className={className}
    />
  );
}
