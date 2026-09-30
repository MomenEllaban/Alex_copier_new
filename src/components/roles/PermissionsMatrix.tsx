"use client";

import { useCallback, useMemo, useState, type CSSProperties } from "react";
import {
  Check,
  ChevronDown,
  Lock,
  Minus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useI18n } from "@/i18n/context";
import { OTHER_GROUP_LABEL, pageIcon, pageLabelKey } from "@/components/roles/page-icons";
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

/**
 * A conventional pill toggle: opaque track, solid white knob inset by 2px on
 * every side, knob shadow for depth. Track and knob are the Radix/shadcn
 * dimensions (36x20 / 44x24) so it matches the toggle the rest of the web uses.
 *
 * Two traps this shape is built around:
 *  • `min-h-0` beats the global `button { min-height: 44px }` rule in
 *    globals.css, which would otherwise stretch the pill into a 44px circle.
 *  • The knob sits at `start-0.5` and slides with a *direction-aware*
 *    translate: in RTL the track is mirrored, so a plain `translate-x-*` would
 *    push the knob out through the wrong end. The `rtl:` variants flip the
 *    sign rather than the property, so one knob works in both directions.
 */
function Switch({
  checked,
  disabled,
  locked,
  onChange,
  label,
  size = "md",
}: {
  checked: boolean;
  disabled?: boolean;
  /** On, but held by a protected system role: shown, not clickable. */
  locked?: boolean;
  onChange: (next: boolean) => void;
  label: string;
  size?: "sm" | "md";
}) {
  // track width - 2*2px inset - knob diameter
  const travel = size === "sm" ? 16 : 20;
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "size-4" : "size-5";
  // Hit area growth is capped to stay clear of the neighbouring row: a taller
  // pseudo-element than the row pitch makes switches steal each other's clicks.
  const hit = size === "sm" ? "after:-inset-y-1" : "after:-inset-y-1.5";

  const tone = checked
    ? locked
      ? "bg-emerald-500/60 dark:bg-emerald-500/40"
      : "bg-emerald-500 hover:bg-emerald-600 focus-visible:ring-emerald-500"
    : disabled
      ? "bg-slate-200 dark:bg-slate-700"
      : "bg-slate-300 hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${track} ${hit} min-h-0 shrink-0 items-center rounded-full
        after:absolute after:inset-x-0 after:content-['']
        transition-colors duration-200 focus:outline-none focus-visible:ring-2
        focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950
        ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${tone}`}
    >
      <span
        aria-hidden
        style={{ "--knob-travel": `${travel}px` } as CSSProperties}
        className={`pointer-events-none absolute start-0.5 top-1/2 -translate-y-1/2 ${knob}
          rounded-full bg-white shadow-[0_1px_2px_0_rgb(0_0_0/0.3)]
          transition-transform duration-200 ease-out
          ${checked
            ? "translate-x-0 rtl:-translate-x-[var(--knob-travel)]"
            : "translate-x-[var(--knob-travel)] rtl:translate-x-0"}`}
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

  /**
   * A page's display name, in the reader's language.
   *
   * Never falls back to the key: `Page.name` from the API is the Arabic label
   * the scanner stored, and the key is a camelCase identifier, so both would
   * read as a foreign language in one locale or the other.
   */
  const pageLabel = useCallback(
    (page: MatrixPage) => {
      const key = pageLabelKey(page.key);
      return key ? t(key) : page.name;
    },
    [t]
  );

  /**
   * An action added to the database before this build knows its key would
   * otherwise render the raw identifier, so it gets a named placeholder.
   */
  const actionLabel = useCallback(
    (action: MatrixAction) =>
      ACTION_LABELS[locale][action.key as ActionKey] ?? t("roles.unknownAction"),
    [locale, t]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return pages;
    return pages.filter(
      (page) =>
        pageLabel(page).toLowerCase().includes(needle) || page.key.toLowerCase().includes(needle)
    );
  }, [pages, query, pageLabel]);

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
  const allowedActionCount = pages.reduce(
    (sum, p) =>
      sum + p.actions.filter((a) => state.actions[`${p.key}:${a.key}`] === true).length,
    0
  );
  const totalActionCount = pages.reduce((sum, p) => sum + p.actions.length, 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div
        className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm
          backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("roles.searchPlaceholder")}
              aria-label={t("roles.searchPlaceholder")}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pe-9 ps-9 text-sm text-slate-900
                outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-950"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("roles.clearSearch")}
                className="absolute top-1/2 end-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center
                  rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-600
                  dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
              className="flex-1 whitespace-nowrap rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2
                text-sm font-medium text-emerald-700 transition hover:bg-emerald-100
                disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800
                dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900 sm:flex-none"
            >
              {t("roles.enableAll")}
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setEverything(false)}
              className="flex-1 whitespace-nowrap rounded-lg border border-slate-300 bg-slate-50 px-3 py-2
                text-sm font-medium text-slate-700 transition hover:bg-slate-100
                disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700
                dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:flex-none"
            >
              {t("roles.disableAll")}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{enabledCount}</span>
            <span> / {pages.length} {t("roles.pageCount")}</span>
          </span>
          <span aria-hidden className="h-3 w-px bg-slate-300 dark:bg-slate-700" />
          <span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {allowedActionCount}
            </span>
            <span> / {totalActionCount} {t("roles.actionCount")}</span>
          </span>
        </div>
      </div>

      {/* Tree */}
      {grouped.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500
            dark:border-slate-700 dark:text-slate-400"
        >
          {t("roles.searchNoResults")}
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map(([group, groupPages]) => {
            // Page.group holds the sidebar's own i18n key, so the section
            // heading follows the sidebar wording in either language.
            const label = group ? t(group) : OTHER_GROUP_LABEL[locale];
            return (
              <section key={group || "other"}>
                <h3
                  className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500
                    dark:text-slate-400"
                >
                  {label}
                </h3>
                <ul className="space-y-2">
                  {groupPages.map((page) => {
                    const Icon = pageIcon(page.icon);
                    const name = pageLabel(page);
                    const canView = state.pages[page.key] === true;
                    const isOpen = open[page.key] ?? canView;
                    const allowedActions = page.actions.filter(
                      (a) => state.actions[`${page.key}:${a.key}`] === true
                    ).length;

                    return (
                      <li
                        key={page.key}
                        className={`relative overflow-hidden rounded-xl border transition-colors ${
                          canView
                            ? "border-emerald-300 bg-white dark:border-emerald-800 dark:bg-slate-900"
                            : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40"
                        }`}
                      >
                        {/* Open pages carry a colour bar down the start edge;
                            closed ones stay flat grey. */}
                        <span
                          aria-hidden
                          className={`absolute inset-y-0 start-0 w-1 transition-colors ${
                            canView
                              ? "bg-emerald-500"
                              : "bg-slate-300 dark:bg-slate-700"
                          }`}
                        />

                        {/* Page row */}
                        <div className="flex items-center gap-2 ps-4 pe-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setOpen((prev) => ({ ...prev, [page.key]: !isOpen }))}
                            aria-expanded={isOpen}
                            aria-label={name}
                            className="flex min-w-0 shrink items-center gap-3 rounded-lg p-1 text-start"
                          >
                            <ChevronDown
                              size={16}
                              className={`shrink-0 text-slate-400 transition-transform dark:text-slate-500 ${
                                isOpen ? "" : "ltr:-rotate-90 rtl:rotate-90"
                              }`}
                            />
                            <span
                              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                                canView
                                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                                  : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                              }`}
                            >
                              <Icon size={17} />
                            </span>
                            <span
                              className={`min-w-0 truncate text-sm font-medium ${
                                canView
                                  ? "text-slate-900 dark:text-slate-50"
                                  : "text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              {name}
                            </span>
                          </button>

                          {canView ? (
                            <span
                              className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[10px]
                                font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            >
                              {t("roles.enabled")}
                            </span>
                          ) : (
                            <span
                              className="shrink-0 rounded-full bg-slate-200 px-1.5 py-px text-[10px]
                                font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300"
                            >
                              {t("roles.disabled")}
                            </span>
                          )}
                          {readOnly && canView && (
                            <span
                              className="inline-flex shrink-0 items-center gap-0.5 rounded-full
                                bg-blue-100 px-1.5 py-px text-[10px] font-semibold text-blue-700
                                dark:bg-blue-950 dark:text-blue-300"
                            >
                              <Lock size={9} />
                              {t("roles.locked")}
                            </span>
                          )}

                          {/* The switch sits immediately after the label, not
                              pushed to the far edge of the row. */}
                          <Switch
                            checked={canView}
                            disabled={readOnly}
                            locked={readOnly}
                            onChange={(next) => setPage(page, next)}
                            label={name}
                          />

                          {/* Always a count, never the raw page key: a disabled
                              page used to show `serviceRequests` here. */}
                          <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                            {canView
                              ? `${allowedActions}/${page.actions.length} ${t("roles.actionCount")}`
                              : `0/${page.actions.length} ${t("roles.actionCount")}`}
                          </span>

                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => setPageAll(page, !canView)}
                              title={canView ? t("roles.disablePage") : t("roles.enablePage")}
                              className={`ms-auto hidden min-h-0 shrink-0 rounded-lg border px-2 py-1.5
                                text-xs transition sm:block ${
                                  canView
                                    ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                                    : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                }`}
                            >
                              {canView ? t("roles.disablePage") : t("roles.enablePage")}
                            </button>
                          )}
                        </div>

                        {/* Actions */}
                        {isOpen && page.actions.length > 0 && (
                          <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40">
                            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                              {page.actions.map((action) => {
                                const ref = `${page.key}:${action.key}`;
                                const allowed = state.actions[ref] === true;
                                return (
                                  <li
                                    key={action.id}
                                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                                      canView ? "" : "opacity-50"
                                    }`}
                                  >
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      {allowed ? (
                                        <Check
                                          size={12}
                                          className="shrink-0 text-emerald-600 dark:text-emerald-400"
                                        />
                                      ) : (
                                        <X
                                          size={12}
                                          className="shrink-0 text-slate-300 dark:text-slate-600"
                                        />
                                      )}
                                      <span
                                        className={`truncate text-xs ${
                                          allowed
                                            ? "font-medium text-slate-700 dark:text-slate-200"
                                            : "text-slate-400 dark:text-slate-500"
                                        }`}
                                      >
                                        {actionLabel(action)}
                                      </span>
                                    </span>
                                    {/* Hugs the action label instead of sitting
                                        at the far edge of the grid cell. */}
                                    <Switch
                                      size="sm"
                                      checked={allowed}
                                      // An action on a hidden page has no meaning,
                                      // so it cannot be switched on.
                                      disabled={readOnly || !canView}
                                      locked={readOnly && canView}
                                      onChange={(next) => setAction(page, action, next)}
                                      label={`${name} — ${actionLabel(action)}`}
                                    />
                                  </li>
                                );
                              })}
                            </ul>

                            {canView && isViewOnly(page, state) && (
                              <p
                                className="mt-2 flex items-center gap-1 px-2 text-[11px] text-amber-700
                                  dark:text-amber-400"
                              >
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

      {readOnly && (
        <p
          className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm
            text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
        >
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          {t("roles.systemRoleHint")}
        </p>
      )}
    </div>
  );
}
