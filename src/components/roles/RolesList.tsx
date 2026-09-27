"use client";

import { useState } from "react";
import { Plus, Shield, Trash2, Users, Pencil } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { useConfirm, useToast } from "@/components/UIProvider";

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  pageCount: number;
  actionCount: number;
}

export default function RolesList({
  roles,
  onOpen,
  onChanged,
}: {
  roles: RoleRow[];
  onOpen: (role: RoleRow) => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const confirmAction = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);

  const remove = async (role: RoleRow) => {
    const ok = await confirmAction({
      title: t("roles.deleteRole"),
      message: t("roles.deleteRoleConfirm").replace("{role}", role.name),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;

    setBusy(role.id);
    try {
      const res = await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || t("common.error"));
        return;
      }
      toast.success(t("roles.roleDeleted"));
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("roles.subtitle")}</p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2
            text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus size={16} />
          {t("roles.addRole")}
        </button>
      </div>

      {adding && (
        <RoleForm
          roles={roles}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}

      {editing && (
        <RoleForm
          role={editing}
          roles={roles}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {roles.map((role) => (
          <li key={role.id}>
            <div
              className={`flex h-full flex-col rounded-xl border p-4 transition ${
                role.isSystem
                  ? "border-blue-200 bg-blue-50/50 hover:border-blue-300 dark:border-blue-900 dark:bg-blue-950/30"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                    role.isSystem
                      ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  <Shield size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className={`truncate text-sm font-semibold ${
                        role.isSystem
                          ? "text-blue-900 dark:text-blue-100"
                          : "text-slate-900 dark:text-slate-50"
                      }`}
                    >
                      {role.name}
                    </h3>
                    {role.isSystem && (
                      <span
                        className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium
                          text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                      >
                        {t("roles.systemRole")}
                      </span>
                    )}
                  </div>
                  {role.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                      {role.description}
                    </p>
                  )}
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/70">
                  <dt className="text-[11px] text-slate-500 dark:text-slate-400">{t("roles.userCount")}</dt>
                  <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {role.userCount}
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/70">
                  <dt className="text-[11px] text-slate-500 dark:text-slate-400">{t("roles.pageCount")}</dt>
                  <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {role.pageCount}
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/70">
                  <dt className="text-[11px] text-slate-500 dark:text-slate-400">{t("roles.actionCount")}</dt>
                  <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {role.actionCount}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(role)}
                  className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white
                    transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  {t("roles.managePermissions")}
                </button>
                {role.isSystem ? (
                  <span
                    title={t("roles.systemRoleHint")}
                    className="rounded-lg border border-blue-200 p-2 text-blue-400
                      dark:border-blue-900 dark:text-blue-400"
                  >
                    <Pencil size={15} className="opacity-50" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(role)}
                    aria-label={t("common.edit")}
                    className="rounded-lg border border-slate-300 p-2 text-slate-600 transition
                      hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Pencil size={15} />
                  </button>
                )}
                {!role.isSystem && (
                  <button
                    type="button"
                    disabled={busy === role.id}
                    onClick={() => remove(role)}
                    aria-label={t("common.delete")}
                    className="rounded-lg border border-red-200 p-2 text-red-600 transition
                      hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {role.isSystem && (
                <p
                  className="mt-2 flex items-start gap-1 text-[11px] text-blue-700/80
                    dark:text-blue-300/80"
                >
                  <Users size={11} className="mt-0.5 shrink-0" />
                  {t("roles.systemRoleHint")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoleForm({
  role,
  roles,
  onCancel,
  onDone,
}: {
  role?: RoleRow;
  roles: RoleRow[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(role?.name ?? "");
  const [key, setKey] = useState(role?.key ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [copyFrom, setCopyFrom] = useState("");
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(role);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(isEdit ? `/api/roles/${role!.id}` : "/api/roles", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit ? { name, description } : { name, key, description, copyFromKey: copyFrom || null }
        ),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || t("common.error"));
        return;
      }
      toast.success(isEdit ? t("roles.roleUpdated") : t("roles.roleCreated"));
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none " +
    "placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 " +
    "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-950";

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4
        dark:border-slate-800 dark:bg-slate-900"
    >
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {isEdit ? t("common.edit") : t("roles.addRoleTitle")}
      </h3>

      <div>
        <label htmlFor="role-name" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
          {t("roles.roleName")}
        </label>
        <input
          id="role-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={t("roles.roleNamePlaceholder")}
          className={field}
        />
      </div>

      {!isEdit && (
        <>
          <div>
            <label htmlFor="role-key" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              {t("roles.roleKey")}
            </label>
            <input
              id="role-key"
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              required
              placeholder="sales_lead"
              dir="ltr"
              className={`${field} text-start`}
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t("roles.roleKeyHint")}</p>
          </div>

          <div>
            <label htmlFor="role-copy" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              {t("roles.copyFrom")}
            </label>
            <select
              id="role-copy"
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
              className={field}
            >
              <option value="">{t("roles.copyFromNone")}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div>
        <label
          htmlFor="role-description"
          className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
        >
          {t("roles.roleDescription")}
        </label>
        <textarea
          id="role-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={field}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white
            transition hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? t("roles.saving") : t("common.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm
            font-medium text-slate-700 transition hover:bg-slate-50
            dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
