"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/context";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import DateRangeFilter, { inDateRange } from "@/components/DateRangeFilter";
import Pagination from "@/components/Pagination";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { DataEntity } from "@/lib/data-events";
import type { ReactNode } from "react";

const PAGE_SIZE = 15;

export interface ReportColumn<T> {
  key: string;
  /** Already-translated header label. */
  header: string;
  render: (row: T) => ReactNode;
  /** Value written to CSV; defaults to the rendered text. */
  exportValue?: (row: T) => string | number;
  align?: "start" | "end" | "center";
}

export interface ReportFilterOption {
  value: string;
  label: string;
}

export interface ReportSummaryCard {
  label: string;
  value: string;
  accent: string;
}

export interface ReportViewProps<T> {
  /** Report endpoint under /api/reports. */
  endpoint: string;
  /** Report heading; falls back to the generic reports title. */
  title: string;
  /** Field holding the report's own date, if it has one worth filtering on. */
  dateOf?: (row: T) => string | null;
  searchPlaceholder: string;
  searchFields: (row: T) => Array<string | number | null | undefined>;
  columns: () => ReportColumn<T>[];
  filters?: Array<{ key: string; label: string; options: ReportFilterOption[] }>;
  filterOf?: (row: T) => Record<string, string>;
  /** Headline cards, computed from the currently filtered rows. */
  summary?: (rows: T[]) => ReportSummaryCard[];
  /** Data-store keys that should trigger an auto refresh. */
  refreshDeps?: DataEntity[];
  filename: string;
}

const ALIGN_CLASS = {
  start: "text-start",
  end: "text-end",
  center: "text-center",
} as const;

/**
 * Shared shell for the report pages under /reports/*.
 *
 * Fetching, search, filtering, pagination and CSV export behave identically on
 * every report, so they live here once instead of being copied into each page.
 * Each report page supplies its own columns, filters and summary cards.
 */
export default function ReportView<T>({
  endpoint,
  title,
  dateOf,
  searchPlaceholder,
  searchFields,
  columns,
  filters = [],
  filterOf,
  summary,
  refreshDeps = [],
  filename,
}: ReportViewProps<T>) {
  const { t } = useI18n();
  // Columns depend on the active language, so the page passes a memoised
  // getter rather than a fixed array.
  const columnList = columns();
  const [rows, setRows] = useState<T[]>([]);
  const [summaryData, setSummaryData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState<string | null>(null);
  const search = searchInput ?? "";
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Plain function rather than useCallback: useAutoRefresh keeps it in a ref,
  // and each report page hard-codes its own endpoint, so the fetch runs once
  // per mount. This matches the pattern on the other list pages.
  const fetchRows = async () => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) {
        setRows([]);
        return;
      }
      const data = await res.json();
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setSummaryData(data?.summary && !Array.isArray(data.summary) ? data.summary : {});
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchRows, refreshDeps);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasDateFilter = Boolean(dateOf);

  // Not memoised: filtering a few thousand rows is cheaper than tracking the
  // dependency list, and this avoids stale-closure bugs when filters change.
  const filtered = rows.filter((row) => {
    if (search && !searchFields(row).some((field) => matchesQuery(field == null ? null : String(field), search))) {
      return false;
    }

    if (filterOf) {
      const rowFilters = filterOf(row);
      for (const filter of filters) {
        const selected = filterValues[filter.key] ?? "";
        if (selected && rowFilters[filter.key] !== selected) return false;
      }
    }

    if (hasDateFilter && (from || to) && !inDateRange(dateOf!(row), from, to)) return false;

    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const summaryCards = summary
    ? summary(filtered)
    : // Scalar reports read their cards from the server summary.
      Object.entries(summaryData).map(([key, value]) => ({
        label: t(`reports.${key}`),
        value: typeof value === "number" ? value.toLocaleString() : String(value),
        accent: "bg-slate-50 text-slate-700",
      }));

  const hasActiveFilters =
    search !== "" || from !== "" || to !== "" || Object.values(filterValues).some(Boolean);

  const resetFilters = () => {
    setSearchInput(null);
    setFilterValues({});
    setFrom("");
    setTo("");
    setPage(1);
  };

  const getExport = () => {
    const exportColumns = columns();
    return {
      headers: exportColumns.map((column) => column.header),
      rows: filtered.map((row) =>
        exportColumns.map((column) => {
          if (column.exportValue) return String(column.exportValue(row));
          const rendered = column.render(row);
          return typeof rendered === "string" || typeof rendered === "number" ? String(rendered) : "";
        }),
      ),
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        <div className="flex items-center gap-2">
          <ExportButton filename={filename} getExport={getExport} disabled={filtered.length === 0} />
          <RefreshButton onRefresh={refresh} refreshing={refreshing} />
        </div>
      </div>

      {summaryCards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div key={card.label} className={`rounded-2xl border border-slate-200 p-4 shadow-sm ${card.accent}`}>
              <div className="text-xs font-medium opacity-80">{card.label}</div>
              <div className="mt-2 text-xl font-bold sm:text-2xl">{card.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            className="w-full sm:max-w-xs"
            value={search}
            onChange={(value) => {
              setSearchInput(value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
          />
          {filters.map((filter) => (
            <FilterSelect
              key={filter.key}
              value={filterValues[filter.key] ?? ""}
              onChange={(value) => {
                setFilterValues((current) => ({ ...current, [filter.key]: value }));
                setPage(1);
              }}
              options={filter.options}
              allLabel={t("common.all")}
            />
          ))}
          {hasDateFilter && (
            <DateRangeFilter
              from={from}
              to={to}
              onFromChange={(value) => {
                setFrom(value);
                setPage(1);
              }}
              onToChange={(value) => {
                setTo(value);
                setPage(1);
              }}
            />
          )}
        </div>
        {hasActiveFilters && (
          <button type="button" onClick={resetFilters} className="text-sm text-blue-600 hover:underline">
            {t("common.resetFilters")}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columnList.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 font-medium ${ALIGN_CLASS[column.align ?? "start"]}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columnList.length} className="px-4 py-10">
                  <div className="flex min-h-[220px] items-center justify-center">
                    <PrinterLoader size="md" />
                  </div>
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={columnList.length} className="px-4 py-10 text-center text-slate-500">
                  {t("common.noData")}
                </td>
              </tr>
            ) : (
              paged.map((row, index) => (
                <tr key={index} className="hover:bg-slate-50">
                  {columnList.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 text-slate-700 ${ALIGN_CLASS[column.align ?? "start"]}`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
        />
      )}
    </div>
  );
}
