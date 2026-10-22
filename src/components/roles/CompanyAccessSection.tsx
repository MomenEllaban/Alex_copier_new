"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, RotateCcw, Save } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { useToast } from "@/components/UIProvider";
import SearchInput from "@/components/SearchInput";
import PrinterLoader from "@/components/PrinterLoader";
import { apiErrorMessage } from "@/lib/api-client";
import { roleLabel } from "@/lib/permissions";

interface CompanyOption {
  id: string;
  name: string;
  nameAr: string | null;
}

interface UserAccessRow {
  id: string;
  name: string;
  email: string;
  role: string;
  roleName: string | null;
  companyId: string | null;
  companyName: string | null;
  /** Rows actually stored for this user; empty means "default". */
  explicitCompanyIds: string[];
  /** What the user really sees now; null means every company. */
  effectiveCompanyIds: string[] | null;
}

interface Payload {
  companies: CompanyOption[];
  users: UserAccessRow[];
}

const companyLabel = (company: CompanyOption) => company.nameAr || company.name;

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/**
 * Per-user access to the financial report of each company.
 *
 * This is deliberately separate from the role matrix above: the role decides
 * *whether* a user may open the companies/reports screens, while these rows
 * decide *which* companies they see there. Two accountants can hold the same
 * role and still need a different set of companies.
 *
 * Semantics worth keeping in the UI:
 *   • no explicit rows  -> the user falls back to their home company (or every
 *     company when they have none) — the "Default" badge;
 *   • explicit rows     -> exactly those companies, even if that excludes the
 *     user's own company, so the warning below matters;
 *   • the general manager is always every company and is not editable.
 */
export default function CompanyAccessSection() {
  const { t, locale } = useI18n();
  const toast = useToast();

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [users, setUsers] = useState<UserAccessRow[]>([]);
  const [saved, setSaved] = useState<Record<string, string[]>>({});
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const applyPayload = useCallback((payload: Payload) => {
    const allIds = payload.companies.map((company) => company.id);
    const nextSaved: Record<string, string[]> = {};
    const nextDraft: Record<string, string[]> = {};
    for (const user of payload.users) {
      const selection = user.effectiveCompanyIds ?? allIds;
      nextSaved[user.id] = selection;
      nextDraft[user.id] = selection;
    }
    setCompanies(payload.companies);
    setUsers(payload.users);
    setSaved(nextSaved);
    setDraft(nextDraft);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/roles/company-access", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("forbidden");
        return (await res.json()) as Payload;
      })
      .then((payload) => {
        if (!cancelled) applyPayload(payload);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyPayload]);

  const allCompanyIds = useMemo(() => companies.map((company) => company.id), [companies]);

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle)
    );
  }, [users, query]);

  const toggle = (userId: string, companyId: string, checked: boolean) => {
    setDraft((current) => {
      const selection = current[userId] ?? [];
      const next = checked
        ? Array.from(new Set([...selection, companyId]))
        : selection.filter((id) => id !== companyId);
      return { ...current, [userId]: next };
    });
  };

  /**
   * Updates one row only, so saving a user never throws away another user's
   * unsaved checkboxes.
   */
  const applyResult = (user: UserAccessRow, companyIds: string[]) => {
    const effective =
      companyIds.length > 0
        ? companyIds
        : user.role === "GENERAL_MANAGER"
          ? allCompanyIds
          : user.companyId
            ? [user.companyId]
            : allCompanyIds;

    setUsers((list) =>
      list.map((item) =>
        item.id === user.id ? { ...item, explicitCompanyIds: companyIds } : item
      )
    );
    setSaved((current) => ({ ...current, [user.id]: effective }));
    setDraft((current) => ({ ...current, [user.id]: effective }));
  };

  const put = async (user: UserAccessRow, companyIds: string[]) => {
    setSavingId(user.id);
    try {
      const res = await fetch("/api/roles/company-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, companyIds }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(data, t, "roles.companyAccess.loadFailed"));
        return false;
      }
      applyResult(user, Array.isArray(data?.companyIds) ? data.companyIds : companyIds);
      toast.success(t("roles.companyAccess.saved"));
      return true;
    } catch {
      toast.error(t("roles.companyAccess.loadFailed"));
      return false;
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <PrinterLoader label={t("roles.companyAccess.loadFailed")} size="sm" />;
  }

  if (loadFailed) {
    return (
      <p
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700
          dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      >
        {t("roles.companyAccess.loadFailed")}
      </p>
    );
  }

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      aria-labelledby="company-access-title"
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            id="company-access-title"
            className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50"
          >
            <Building2 size={16} className="text-blue-600 dark:text-blue-400" />
            {t("roles.companyAccess.title")}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("roles.companyAccess.subtitle")}
          </p>
        </div>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t("roles.companyAccess.search")}
          className="shrink-0 md:w-72"
        />
      </div>

      <p
        className="border-b border-slate-100 px-4 py-2 text-[11px] leading-relaxed text-slate-500
          dark:border-slate-800 dark:text-slate-400"
      >
        {t("roles.companyAccess.defaultHint")}
      </p>

      {companies.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t("roles.companyAccess.noCompanies")}
        </p>
      ) : visibleUsers.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t("roles.companyAccess.noUsers")}
        </p>
      ) : (
        <div className="max-h-[34rem] space-y-3 overflow-y-auto p-4">
          {visibleUsers.map((user) => {
            const isGeneralManager = user.role === "GENERAL_MANAGER";
            const selection = draft[user.id] ?? [];
            const isSaving = savingId === user.id;
            const dirty = !sameSet(selection, saved[user.id] ?? []);
            const empty = selection.length === 0;
            const homeExcluded =
              !isGeneralManager && Boolean(user.companyId) && !selection.includes(user.companyId!);

            return (
              <div
                key={user.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-3
                  dark:border-slate-800 dark:bg-slate-950/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {user.name}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {user.email}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-medium
                        text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {roleLabel(user.role, locale, user.roleName)}
                    </span>
                    {user.explicitCompanyIds.length === 0 ? (
                      <span
                        className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium
                          text-blue-700 dark:bg-blue-950 dark:text-blue-200"
                      >
                        {t("roles.companyAccess.defaultBadge")}
                      </span>
                    ) : null}
                  </div>
                </div>

                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {t("roles.companyAccess.homeCompany")}:{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {user.companyName || "—"}
                  </span>
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {companies.map((company) => {
                    const checked = isGeneralManager || selection.includes(company.id);
                    return (
                      <label
                        key={company.id}
                        className={`flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-1.5
                          text-xs font-medium transition ${
                            checked
                              ? "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-100"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600"
                          } ${isGeneralManager ? "cursor-not-allowed opacity-70" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isGeneralManager || isSaving}
                          onChange={(event) => toggle(user.id, company.id, event.target.checked)}
                          className="h-3.5 w-3.5 accent-blue-600"
                        />
                        {companyLabel(company)}
                      </label>
                    );
                  })}
                </div>

                {isGeneralManager ? (
                  <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {t("roles.companyAccess.locked")}
                  </p>
                ) : empty ? (
                  <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    {t("roles.companyAccess.chooseOne")}
                  </p>
                ) : homeExcluded ? (
                  <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    {t("roles.companyAccess.homeExcluded")}
                  </p>
                ) : null}

                {!isGeneralManager && (dirty || user.explicitCompanyIds.length > 0) ? (
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {user.explicitCompanyIds.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => void put(user, [])}
                        disabled={isSaving}
                        title={t("roles.companyAccess.resetTitle")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white
                          px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50
                          disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200
                          dark:hover:bg-slate-800"
                      >
                        <RotateCcw size={13} />
                        {t("roles.companyAccess.reset")}
                      </button>
                    ) : null}
                    {dirty ? (
                      <button
                        type="button"
                        onClick={() => void put(user, selection)}
                        disabled={isSaving || empty}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5
                          text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700
                          disabled:opacity-50"
                      >
                        <Save size={13} />
                        {isSaving ? t("roles.companyAccess.saving") : t("roles.companyAccess.save")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
