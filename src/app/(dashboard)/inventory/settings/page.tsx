"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/context";
import PrinterLoader from "@/components/PrinterLoader";
import RefreshButton from "@/components/RefreshButton";
import FilterSelect from "@/components/FilterSelect";
import { useToast } from "@/components/UIProvider";
import { apiErrorMessage, readApiError } from "@/lib/api-client";
import { AlertTriangle, Cog, ShieldCheck } from "lucide-react";

interface InventorySettings {
  id: string;
  companyId: string;
  allowNegativeStock: boolean;
  warnOnNegativeStock: boolean;
}

interface Company { id: string; name: string; nameAr?: string | null; }

/**
 * The negative-stock policy, per company.
 *
 * Kept on its own page (and its own permission) rather than inside the stock
 * list because it is the one switch that can loosen a business rule: the flag
 * only ever applies to SALES. Manual movements and every reversal stay blocked
 * at zero whatever is set here — see the note rendered under the switches.
 *
 * Each switch writes immediately on PUT; there is no draft state, so what is on
 * screen is always what the next sale will do.
 */
export default function InventorySettingsPage() {
  const { t, dir } = useI18n();
  const { success: toastSuccess, error: toastError } = useToast();

  const [settings, setSettings] = useState<InventorySettings | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  // A general manager belongs to no company, so they pick which one to edit.
  const [companyId, setCompanyId] = useState("");
  const [needsCompany, setNeedsCompany] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // `fetchSettings` is a pure request helper: it resolves with the outcome instead
  // of writing state itself. That keeps the mount effect free of setState calls,
  // since every state change then lands in the `.then` callback below.
  const fetchSettings = useCallback(async (targetCompanyId?: string) => {
    const url = targetCompanyId
      ? `/api/inventory/settings?companyId=${encodeURIComponent(targetCompanyId)}`
      : "/api/inventory/settings";
    const res = await fetch(url);

    if (res.ok) {
      return { kind: "ok" as const, settings: (await res.json()) as InventorySettings };
    }

    const data = await readApiError(res);
    // 400 with companyId is the server asking WHICH company — not a failure.
    if (res.status === 400 && (data as { error?: string } | null)?.error === "companyId is required") {
      const companiesRes = await fetch("/api/companies");
      const list: Company[] = companiesRes.ok ? await companiesRes.json() : [];
      return { kind: "pick" as const, companies: list };
    }

    return { kind: "error" as const, message: apiErrorMessage(data, t) };
  }, [t]);

  const applyResult = useCallback(
    (result: Awaited<ReturnType<typeof fetchSettings>>) => {
      if (result.kind === "ok") {
        setSettings(result.settings);
        setCompanyId(result.settings.companyId);
        setNeedsCompany(false);
        return;
      }
      if (result.kind === "pick") {
        // A 400 "companyId is required" means the user must choose a company, so
        // the picker stays up. `applyPickedCompany` clears this again below once
        // it has loaded the preselected company's settings.
        setNeedsCompany(true);
        setCompanies(result.companies);
        return;
      }
      toastError(result.message);
    },
    [toastError]
  );

  // Preselect the first company so a general manager is not looking at an empty
  // page on arrival. Returns true once that company's settings are on screen,
  // so the caller can skip re-applying the `pick` result that asked for it.
  const applyPickedCompany = useCallback(async (list: Company[]) => {
    const first = list[0];
    if (!first) return false;
    setCompanyId(first.id);
    const res = await fetch(`/api/inventory/settings?companyId=${encodeURIComponent(first.id)}`);
    if (!res.ok) return false;
    setSettings((await res.json()) as InventorySettings);
    setNeedsCompany(false);
    return true;
  }, []);

  // Runs the "pick a company, then load it" sequence in one place so the mount
  // fetch and `reload` cannot drift apart.
  const resolve = useCallback(
    async (result: Awaited<ReturnType<typeof fetchSettings>>) => {
      if (result.kind === "pick") {
        applyResult(result);
        await applyPickedCompany(result.companies);
        return;
      }
      applyResult(result);
    },
    [applyResult, applyPickedCompany]
  );

  // `loading` already starts true, so only `reload` raises it — doing that here
  // would be a synchronous setState inside the mount effect.
  const reload = useCallback(
    (targetCompanyId?: string) => {
      setLoading(true);
      void fetchSettings(targetCompanyId)
        .then(resolve)
        .catch(() => toastError(t("common.error")))
        .finally(() => setLoading(false));
    },
    [fetchSettings, resolve, toastError, t]
  );

  useEffect(() => {
    void fetchSettings()
      .then(resolve)
      .catch(() => toastError(t("common.error")))
      .finally(() => setLoading(false));
  }, [fetchSettings, resolve, toastError, t]);

  const changeCompany = async (next: string) => {
    setCompanyId(next);
    setSettings(null);
    reload(next);
  };

  const save = async (patch: Partial<InventorySettings>) => {
    if (!settings) return;
    const previous = settings;
    // Optimistic: the switch should not lag a round trip behind the click.
    setSettings({ ...settings, ...patch });
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowNegativeStock: patch.allowNegativeStock ?? previous.allowNegativeStock,
          warnOnNegativeStock: patch.warnOnNegativeStock ?? previous.warnOnNegativeStock,
          // Only meaningful for the general manager, who is not pinned to a company.
          companyId: previous.companyId,
        }),
      });
      const data = await readApiError(res);
      if (!res.ok) {
        setSettings(previous);
        toastError(apiErrorMessage(data, t));
        return;
      }
      setSettings(data as InventorySettings);
      toastSuccess(t("common.savedSuccessfully"));
    } catch {
      setSettings(previous);
      toastError(t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const allow = settings?.allowNegativeStock ?? false;

  return (
    <div dir={dir} className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{t("inventory.settingsTitle")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("inventory.settingsSubtitle")}</p>
        </div>
        <RefreshButton onRefresh={() => reload(needsCompany ? undefined : companyId)} refreshing={loading} />
      </div>

      {needsCompany && companies.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="max-w-sm">
            <FilterSelect
              value={companyId}
              onChange={(v) => void changeCompany(v)}
              options={companies.map((c) => ({ value: c.id, label: c.nameAr || c.name }))}
              allLabel={t("common.selectOption")}
              className="w-full"
            />
          </div>
        </div>
      )}

      {loading && !settings ? (
        <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
          <PrinterLoader size="md" label={t("common.loading")} />
        </div>
      ) : !settings ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          {t("common.noData")}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${allow ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"}`}>
                {allow ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{t("inventory.policyCurrent")}</p>
                <p className={`mt-0.5 text-lg font-semibold ${allow ? "text-rose-700" : "text-emerald-700"}`}>
                  {allow ? t("inventory.policyAllowed") : t("inventory.policyBlocked")}
                </p>
              </div>
              {saving && <Cog size={18} className="animate-spin text-slate-400" />}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800">{t("inventory.allowNegativeStock")}</span>
                <span className="mt-1 block text-sm leading-6 text-slate-500">{t("inventory.allowNegativeStockHint")}</span>
              </span>
              <input
                type="checkbox"
                checked={settings.allowNegativeStock}
                onChange={(e) => void save({ allowNegativeStock: e.target.checked })}
                className="mt-1 size-5 shrink-0 cursor-pointer accent-rose-600"
              />
            </label>

            <div className="border-t border-slate-100 pt-4">
              <label className={`flex items-start justify-between gap-4 ${allow ? "cursor-pointer" : "opacity-60"}`}>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">{t("inventory.warnOnNegativeStock")}</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-500">{t("inventory.warnOnNegativeStockHint")}</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.warnOnNegativeStock}
                  disabled={!allow}
                  onChange={(e) => void save({ warnOnNegativeStock: e.target.checked })}
                  className="mt-1 size-5 shrink-0 cursor-pointer accent-amber-600 disabled:cursor-not-allowed"
                />
              </label>
            </div>

            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              <ShieldCheck size={16} className="mt-1 shrink-0 text-amber-600" />
              {t("inventory.policyScopeNote")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
