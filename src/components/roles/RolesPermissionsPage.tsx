"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Save, Undo2 } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { useConfirm, useToast } from "@/components/UIProvider";
import RolesList, { type RoleRow } from "@/components/roles/RolesList";
import PermissionsMatrix, {
  emptyMatrix,
  type MatrixPage,
  type MatrixState,
} from "@/components/roles/PermissionsMatrix";
import { apiErrorMessage } from "@/lib/api-client";
import PrinterLoader from "@/components/PrinterLoader";

interface Diff {
  pagesOn: number;
  pagesOff: number;
  actionsOn: number;
  actionsOff: number;
}

/**
 * The general manager is the only role the API protects, so it is also the one
 * worth landing on last: opening the screen should show an editable matrix, not
 * a screen of switches that refuse to move.
 */
function preferredRole(roles: RoleRow[]): string | null {
  return roles.find((r) => !r.isSystem)?.id ?? roles[0]?.id ?? null;
}

export default function RolesPermissionsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const confirmAction = useConfirm();

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pages, setPages] = useState<MatrixPage[]>([]);
  const [roleMeta, setRoleMeta] = useState<{ name: string; isSystem: boolean } | null>(null);

  /** The saved state, so a diff can be computed and Discard can restore it. */
  const [saved, setSaved] = useState<MatrixState>({ pages: {}, actions: {} });
  const [draft, setDraft] = useState<MatrixState>({ pages: {}, actions: {} });
  const [loading, setLoading] = useState(true);
  /** Which role's matrix is on screen, so the swap shows a loader. */
  const [matrixFor, setMatrixFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const applyRoles = useCallback((data: RoleRow[]) => {
    setRoles(data);
    setSelectedId((current) =>
      current && data.some((r) => r.id === current) ? current : preferredRole(data)
    );
    setLoading(false);
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/roles", { cache: "no-store" });
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      applyRoles((await res.json()) as RoleRow[]);
    } catch {
      setLoadError(true);
    }
  }, [applyRoles]);

  useEffect(() => {
    let cancelled = false;
    // The setState calls live in the continuation, not the effect body.
    fetch("/api/roles", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("forbidden");
        return (await res.json()) as RoleRow[];
      })
      .then((data) => {
        if (!cancelled) applyRoles(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyRoles]);

  // Load the matrix whenever the selected role changes.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    fetch(`/api/roles/${selectedId}/permissions`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        return (await res.json()) as { role: { name: string; isSystem: boolean }; pages: MatrixPage[] };
      })
      .then((data) => {
        if (cancelled) return;
        const initial = emptyMatrix(data.pages);
        setPages(data.pages);
        setRoleMeta({ name: data.role.name, isSystem: data.role.isSystem });
        setSaved(initial);
        setDraft(initial);
        setMatrixFor(selectedId);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Derived, not set inside the effect: a role swap shows the loader until the
  // matrix on screen belongs to the role now selected.
  const matrixLoading = Boolean(selectedId) && matrixFor !== selectedId;

  const diff = useMemo<Diff>(() => {
    let pagesOn = 0;
    let pagesOff = 0;
    let actionsOn = 0;
    let actionsOff = 0;

    for (const page of pages) {
      if ((saved.pages[page.key] ?? false) !== (draft.pages[page.key] ?? false)) {
        if (draft.pages[page.key]) pagesOn++;
        else pagesOff++;
      }
      for (const action of page.actions) {
        const ref = `${page.key}:${action.key}`;
        if ((saved.actions[ref] ?? false) !== (draft.actions[ref] ?? false)) {
          if (draft.actions[ref]) actionsOn++;
          else actionsOff++;
        }
      }
    }
    return { pagesOn, pagesOff, actionsOn, actionsOff };
  }, [pages, saved, draft]);

  const dirty = diff.pagesOn + diff.pagesOff + diff.actionsOn + diff.actionsOff > 0;
  const readOnly = roleMeta?.isSystem ?? false;

  const save = async () => {
    if (!selectedId || !dirty) return;

    const changes = diff.pagesOn + diff.pagesOff + diff.actionsOn + diff.actionsOff;
    const ok = await confirmAction({
      title: t("roles.confirmTitle"),
      message: `${t("roles.confirmBody")
        .replace("{count}", String(changes))
        .replace("{role}", roleMeta?.name ?? "")}\n${t("roles.unsavedSummary")
        .replace("{on}", String(diff.pagesOn + diff.actionsOn))
        .replace("{off}", String(diff.pagesOff + diff.actionsOff))}`,
    });
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/roles/${selectedId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: draft.pages, actions: draft.actions }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(data, t, "roles.saveFailed"));
        return;
      }

      // Re-read so the baseline matches what the server actually stored.
      const fresh = await fetch(`/api/roles/${selectedId}/permissions`, { cache: "no-store" });
      if (fresh.ok) {
        const payload = (await fresh.json()) as { pages: MatrixPage[] };
        const next = emptyMatrix(payload.pages);
        setSaved(next);
        setDraft(next);
      }

      const result = data as {
        pagesEnabled: number;
        pagesDisabled: number;
        actionsEnabled: number;
        actionsDisabled: number;
      };
      const parts = [
        t("roles.savedPages")
          .replace("{on}", String(result.pagesEnabled))
          .replace("{off}", String(result.pagesDisabled)),
        t("roles.savedActions")
          .replace("{on}", String(result.actionsEnabled))
          .replace("{off}", String(result.actionsDisabled)),
      ].join(" — ");
      toast.success(
        result.pagesEnabled + result.actionsEnabled + result.pagesDisabled + result.actionsDisabled === 0
          ? t("roles.savedNothing")
          : parts
      );
      void loadRoles();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PrinterLoader fullScreen label={t("roles.loading")} />;
  }

  if (loadError) {
    return (
      <div className="p-6">
        <p
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700
            dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {t("roles.unauthorized")} — {t("roles.loadFailed")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">{t("roles.title")}</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t("roles.subtitle")}</p>
        </div>

        {roles.length > 0 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="roles-role-picker"
              className="text-sm text-slate-500 dark:text-slate-400"
            >
              {t("roles.roleLabel")}
            </label>
            <select
              id="roles-role-picker"
              value={selectedId ?? ""}
              onChange={(event) => setSelectedId(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium
                text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-950"
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name} ({role.pageCount})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {matrixLoading ? (
        <PrinterLoader label={t("roles.matrixLoading")} />
      ) : roles.length === 0 || !selectedId ? (
        <p
          className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm
            text-slate-500 dark:border-slate-700 dark:text-slate-400"
        >
          {t("roles.noPagesInRole")}
        </p>
      ) : (
        <>
          <PermissionsMatrix
            pages={pages}
            state={draft}
            onChange={setDraft}
            readOnly={readOnly}
          />

          {/* Sticky save bar — the matrix is long enough that a save button at
              the top would scroll out of reach. */}
          {dirty && !readOnly && (
            <div
              className="sticky bottom-0 z-30 mt-2 rounded-xl border border-amber-300 bg-amber-50/95
                p-3 shadow-lg backdrop-blur dark:border-amber-700 dark:bg-amber-950/95"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  {t("roles.unsavedChanges")} —{" "}
                  {t("roles.unsavedSummary")
                    .replace("{on}", String(diff.pagesOn + diff.actionsOn))
                    .replace("{off}", String(diff.pagesOff + diff.actionsOff))}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft(saved)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300
                      bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50
                      dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Undo2 size={15} />
                    {t("roles.discard")}
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg
                      bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition
                      hover:bg-emerald-700 disabled:opacity-50 sm:flex-none"
                  >
                    <Save size={15} />
                    {saving ? t("roles.saving") : t("roles.save")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Role administration sits below the matrix so the most-used screen —
          adjusting permissions — stays at the top. */}
      <details className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <summary
          className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm
            font-semibold text-slate-800 dark:text-slate-200"
        >
          <ArrowRight size={15} className="text-slate-400 dark:text-slate-500 rtl:rotate-180" />
          {t("roles.manageRoles")}
        </summary>
        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          <RolesList roles={roles} onOpen={(role) => setSelectedId(role.id)} onChanged={loadRoles} />
        </div>
      </details>
    </div>
  );
}
