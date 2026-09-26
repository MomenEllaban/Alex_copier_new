"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Minus, Search, X } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { GROUP_LABELS, pageIcon } from "@/components/roles/page-icons";
import { ACTION_LABELS, type ActionKey } from "@/lib/rbac-catalog";

export interface MatrixAction {
  id: string;
  key: string;
  name: string | null;
  isAllowed: boolean;
}

export interface MatrixPage {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  group: string | null;
  sortOrder: number;
  canView: boolean;
  actions: MatrixAction[];
}

export interface MatrixState {
  pages: Record<string, boolean>;
  actions: Record<string, boolean>;
}

export function emptyMatrix(pages: MatrixPage[]): MatrixState {
  const pageState: Record<string, boolean> = {};
  const actionState: Record<string, boolean> = {};
  for (const page of pages) {
    pageState[page.key] = page.canView;
    for (const action of page.actions) {
      actionState[`${page.key}:${action.key}`] = action.isAllowed;
    }
  }
  return { pages: pageState, actions: actionState };
}

/** Actions on a page that the role can never hold — shown for context only. */
function isViewOnly(page: MatrixPage, state: MatrixState): boolean {
  return page.actions.every(
    (action) => action.key === "view" || state.actions[`${page.key}:${action.key}`] !== true
  );
}

function Switch({
  checked,
  disabled,
  onChange,
  label,
  size = "md",
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
  size?: "sm" | "md";
}) {
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const shift = size === "sm" ? "translate-x-4" : "translate-x-5";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${track} shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
        disabled
          ? "cursor-not-allowed bg-slate-200"
          : checked
            ? "bg-emerald-500 hover:bg-emerald-600"
            : "bg-slate-300 hover:bg-slate-400"
      }`}
    >
      <span
        className={`inline-block ${knob} transform rounded-full bg-white shadow transition-transform ${
          checked ? shift : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function PermissionsMatrix({
  pages,
  state,
  onChange,
  readOnly,
}: {
  pages: MatrixPage[];
  state: MatrixState;
  onChange: (next: MatrixState) => void;
  /** True for the protected system role: switches render but do not respond. */
  readOnly: boolean;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return pages;
    return pages.filter(
      (page) =>
        page.name.toLowerCase().includes(needle) || page.key.toLowerCase().includes(needle)
    );
  }, [pages, query]);

  /** Pages grouped by sidebar section, in catalog order. */
  const grouped = useMemo(() => {
    const map = new Map<string, MatrixPage[]>();
    for (const page of filtered) {
      const key = page.group ?? "";
      const list = map.get(key);
      if (list) list.push(page);
      else map.set(key, [page]);
    }
    return [...map.entries()];
  }, [filtered]);

  const setPage = (page: MatrixPage, canView: boolean) => {
    if (readOnly) return;
    const pagesNext = { ...state.pages, [page.key]: canView };
    // Switching a page off clears its actions: they are unreachable, and
    // leaving them on makes re-enabling the page silently restore access.
    if (!canView) {
      const actionsNext = { ...state.actions };
      for (const action of page.actions) actionsNext[`${page.key}:${action.key}`] = false;
      onChange({ pages: pagesNext, actions: actionsNext });
      return;
    }
    onChange({ pages: pagesNext, actions: state.actions });
  };

  const setAction = (page: MatrixPage, action: MatrixAction, allowed: boolean) => {
    if (readOnly) return;
    onChange({
      pages: state.pages,
      actions: { ...state.actions, [`${page.key}:${action.key}`]: allowed },
    });
  };

  const setPageAll = (page: MatrixPage, value: boolean) => {
    if (readOnly) return;
    const actionsNext = { ...state.actions };
    for (const action of page.actions) actionsNext[`${page.key}:${action.key}`] = value;
    onChange({ pages: { ...state.pages, [page.key]: value }, actions: actionsNext });
  };

  const setEverything = (value: boolean) => {
    if (readOnly) return;
    const pagesNext: Record<string, boolean> = {};
    const actionsNext: Record<string, boolean> = {};
    for (const page of pages) {
      pagesNext[page.key] = value;
      for (const action of page.actions) actionsNext[`${page.key}:${action.key}`] = value;
    }
    onChange({ pages: pagesNext, actions: actionsNext });
  };

  const enabledCount = pages.filter((p) => state.pages[p.key]).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-1 space-y-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("roles.searchPlaceholder")}
              className="w-full rounded-lg border border-slate-300 py-2 pe-9 ps-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="clear"
                className="absolute top-1/2 end-2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setEverything(true)}
              className="flex-1 whitespace-nowrap rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {t("roles.enableAll")}
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setEverything(false)}
              className="flex-1 whitespace-nowrap rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {t("roles.disableAll")}
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          {enabledCount} / {pages.length} {t("roles.pageCount")}
        </p>
      </div>

      {/* Tree */}
      {grouped.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          {t("roles.searchNoResults")}
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map(([group, groupPages]) => {
            const label = GROUP_LABELS[group] ?? GROUP_LABELS[""];
            return (
              <section key={group || "other"}>
                <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label[locale] ?? label.ar}
                </h3>
                <ul className="space-y-2">
                  {groupPages.map((page) => {
                    const Icon = pageIcon(page.icon);
                    const canView = state.pages[page.key] === true;
                    const isOpen = open[page.key] ?? canView;
                    const allowedActions = page.actions.filter(
                      (a) => state.actions[`${page.key}:${a.key}`] === true
                    ).length;

                    return (
                      <li
                        key={page.key}
                        className={`overflow-hidden rounded-xl border transition-colors ${
                          canView ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        {/* Page row */}
                        <div className="flex items-center gap-2 p-3">
                          <button
                            type="button"
                            onClick={() => setOpen((prev) => ({ ...prev, [page.key]: !isOpen }))}
                            aria-expanded={isOpen}
                            aria-label={page.name}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-start"
                          >
                            <ChevronDown
                              size={16}
                              className={`shrink-0 text-slate-400 transition-transform ${
                                isOpen ? "" : "-rotate-90"
                              }`}
                            />
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                canView ? "bg-emerald-50 text-emerald-600" : "bg-slate-200 text-slate-500"
                              }`}
                            >
                              <Icon size={17} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block truncate text-sm font-medium ${
                                  canView ? "text-slate-900" : "text-slate-500"
                                }`}
                              >
                                {page.name}
                              </span>
                              <span className="block truncate text-xs text-slate-400">
                                {canView
                                  ? `${allowedActions}/${page.actions.length} ${t("roles.actionCount")}`
                                  : page.key}
                              </span>
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => setPageAll(page, !canView)}
                            title={canView ? t("roles.disablePage") : t("roles.enablePage")}
                            className="hidden shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 sm:block"
                          >
                            {canView ? t("roles.disablePage") : t("roles.enablePage")}
                          </button>

                          <Switch
                            checked={canView}
                            disabled={readOnly}
                            onChange={(next) => setPage(page, next)}
                            label={page.name}
                          />
                        </div>

                        {/* Actions */}
                        {isOpen && page.actions.length > 0 && (
                          <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2">
                            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                              {page.actions.map((action) => {
                                const ref = `${page.key}:${action.key}`;
                                const allowed = state.actions[ref] === true;
                                return (
                                  <li
                                    key={action.id}
                                    className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${
                                      canView ? "" : "opacity-45"
                                    }`}
                                  >
                                    <span
                                      className={`truncate text-xs ${
                                        allowed ? "font-medium text-slate-700" : "text-slate-400"
                                      }`}
                                    >
                                      {ACTION_LABELS[locale][action.key as ActionKey] ?? action.key}
                                    </span>
                                    <Switch
                                      size="sm"
                                      checked={allowed}
                                      // An action on a hidden page has no meaning,
                                      // so it cannot be switched on.
                                      disabled={readOnly || !canView}
                                      onChange={(next) => setAction(page, action, next)}
                                      label={`${page.name} — ${action.key}`}
                                    />
                                  </li>
                                );
                              })}
                            </ul>

                            {canView && isViewOnly(page, state) && (
                              <p className="mt-2 flex items-center gap-1 px-2 text-[11px] text-amber-700">
                                <Minus size={11} />
                                {t("roles.viewOnlyNotice")}
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
