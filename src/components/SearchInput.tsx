"use client";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}

export default function SearchInput({ value, onChange, placeholder, className = "" }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border border-gray-300 rounded-lg ps-9 pe-4 py-2 w-full md:w-80 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <svg
        className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="11" cy="11" r="7" strokeLinecap="round" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="✕"
          className="absolute end-[2rem] top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function matchesQuery(haystack: string | undefined | null, query: string): boolean {
  if (!query) return true;
  return String(haystack ?? "").toLowerCase().includes(query.toLowerCase());
}
