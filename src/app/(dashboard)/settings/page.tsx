"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/i18n/context";
import { useSession } from "next-auth/react";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import Pagination from "@/components/Pagination";
import PrinterLoader from "@/components/PrinterLoader";
import StatsCards from "@/components/StatsCards";
import { useConfirm } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import { Plus, Pencil, Power, Eye, EyeOff, X, Trash2, Save, AlertTriangle, Users, UserCheck, Wrench, UserX } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import FormModal from "@/components/FormModal";
import { DateTimeCell } from "@/components/DateTimeCell";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId: string | null;
  isActive: boolean;
  createdAt: string;
}

const ROLE_BADGES: Record<string, string> = {
  GENERAL_MANAGER: "bg-purple-100 text-purple-800",
  COMPANY_MANAGER: "bg-blue-100 text-blue-800",
  ACCOUNTANT: "bg-green-100 text-green-800",
  MAINTENANCE_MANAGER: "bg-yellow-100 text-yellow-800",
  WORKSHOP_MANAGER: "bg-orange-100 text-orange-800",
  ENGINEER: "bg-cyan-100 text-cyan-800",
  SALES_EMPLOYEE: "bg-pink-100 text-pink-800",
};

const ALL_ROLES = Object.keys(ROLE_BADGES);

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "SALES_EMPLOYEE",
  companyId: "",
};

export default function SettingsPage() {
  const { t, locale, dir } = useI18n();
  const confirmAction = useConfirm();

  const { data: session } = useSession();
  const meId = (session?.user as { id?: string })?.id;

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const loading = !usersLoaded;
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const PAGE_SIZE = 10;

const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (res.ok) setUsers(Array.isArray(data) ? data : []);
    } finally {
setUsersLoaded(true);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchUsers, ["users", "engineers"]);

  useEffect(() => {
    if (usersLoaded) return;
    let cancelled = false;
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setUsers(Array.isArray(data) ? data : []);
        setUsersLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setUsersLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [usersLoaded]);

  const filteredUsers = users.filter(
    (user) =>
      (!roleFilter || user.role === roleFilter) &&
      (matchesQuery(user.name, search) ||
        matchesQuery(user.email, search) ||
        matchesQuery(t(`roles.${user.role}`), search))
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setShowPassword(false);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      companyId: user.companyId || "",
    });
    setShowPassword(false);
    setFormError("");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError("");
    try {
      const isEdit = Boolean(editingUser);
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        role: form.role,
        companyId: form.companyId || null,
      };
      if (!isEdit || form.password !== "") payload.password = form.password;

      const res = await fetch(isEdit ? `/api/users/${editingUser!.id}` : "/api/users", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError(apiErrorMessage(data, t, "settings.actionFailed"));
        return;
      }

setModalOpen(false);
      refresh();
      notifyDataChanged(["users", "engineers"]);
      setBanner({ type: "success", text: t(isEdit ? "settings.userUpdated" : "settings.userCreated") });
    } catch {
      setFormError(t("settings.actionFailed"));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (user: User) => {
    if (
      !(await confirmAction({
        message: `${t("settings.toggleStatusConfirm")}\n${user.name} — ${user.email}`,
      }))
    )
      return;
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        setBanner({ type: "error", text: apiErrorMessage(data, t, "settings.actionFailed") });
        return;
      }
setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: !user.isActive } : u)));
      notifyDataChanged(["users", "engineers"]);
      setBanner({ type: "success", text: t("settings.statusChanged") });
    } catch {
      setBanner({ type: "error", text: t("settings.actionFailed") });
    }
  };

  const handleDelete = async (user: User) => {
    if (user.id === meId) {
      setBanner({ type: "error", text: t("settings.cannotDeleteSelf") });
      return;
    }

    if (!(await confirmAction({ message: `${t("common.deleteConfirm")}\n${user.name} — ${user.email}` }))) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setBanner({
          type: "error",
          text: apiErrorMessage(data, t, "settings.actionFailed"),
        });
        return;
      }

setUsers((prev) => prev.filter((u) => u.id !== user.id));
      notifyDataChanged(["users", "engineers"]);
      setBanner({ type: "success", text: t("common.deletedSuccessfully") });
    } catch {
      setBanner({ type: "error", text: t("settings.actionFailed") });
    }
  };

  const handleReset = async () => {
    if (resetSaving) return;
    if (resetText.trim().toUpperCase() !== "RESET") return;
    setResetSaving(true);
    try {
      const res = await fetch("/api/dev/reset-transactions", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setBanner({ type: "error", text: apiErrorMessage(data, t, "settings.resetData.failed") });
        return;
      }
      setResetOpen(false);
      setResetText("");
      setBanner({ type: "success", text: t("settings.resetData.success") });
    } catch {
      setBanner({ type: "error", text: t("settings.resetData.failed") });
    } finally {
      setResetSaving(false);
    }
  };

  return (
    <div dir={dir}>
      <h1 className="text-xl sm:text-2xl font-bold mb-6">{t("users.title")}</h1>

      {users.length > 0 && (
        <div className="mb-6">
          <StatsCards
            columns={4}
            stats={[
              { label: t("settings.stats.totalUsers"), value: users.length.toLocaleString("ar-EG"), icon: <Users size={18} />, tone: "sky" },
              { label: t("settings.stats.activeUsers"), value: users.filter((u) => u.isActive).length.toLocaleString("ar-EG"), icon: <UserCheck size={18} />, tone: "green" },
              { label: t("settings.stats.engineers"), value: users.filter((u) => u.role === "ENGINEER").length.toLocaleString("ar-EG"), icon: <Wrench size={18} />, tone: "amber" },
              { label: t("settings.stats.inactiveUsers"), value: users.filter((u) => !u.isActive).length.toLocaleString("ar-EG"), icon: <UserX size={18} />, tone: "rose" },
            ]}
          />
        </div>
      )}

      <div className="space-y-3">
          {banner && (
            <div
              className={`rounded-lg px-4 py-3 text-sm flex items-center justify-between ${
                banner.type === "success"
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
              role="status"
            >
              <span>{banner.text}</span>
              <button onClick={() => setBanner(null)} className="shrink-0 opacity-60 hover:opacity-100" aria-label="close">
                <X size={16} />
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="p-4 border-b flex flex-col gap-2 md:flex-row md:items-center md:flex-wrap">
              <SearchInput value={search} onChange={setSearch} placeholder={t("settings.usersSearchPlaceholder")} className="md:max-w-md" />
              <FilterSelect
                value={roleFilter}
                onChange={(v) => { setRoleFilter(v); setPage(1); }}
                options={ALL_ROLES.map((role) => ({ value: role, label: t(`roles.${role}`) }))}
                allLabel={`${t("settings.roleFilter")} — ${t("common.all")}`}
                className="md:w-48"
              />
              {(search !== "" || roleFilter !== "") && (
                <button onClick={() => { setSearch(""); setRoleFilter(""); setPage(1); }} className="text-sm text-gray-500 hover:text-gray-700 underline">
                  {t("common.resetFilters")}
                </button>
              )}
<button
                onClick={openCreate}
                className="md:ms-auto inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <Plus size={18} />
                {t("settings.addUser")}
              </button>
              <RefreshButton onRefresh={refresh} refreshing={refreshing} className="md:ms-2" />
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-12">
                <PrinterLoader size="sm" label={t("common.loading")} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("settings.colUser")}</th>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("settings.colRole")}</th>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("settings.colStatus")}</th>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.date")}</th>
                      <th className="px-4 py-3 text-start text-sm font-medium text-gray-500 w-28">{t("common.actions") || ""}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {pagedUsers.map((user) => {
                      const isSelf = user.id === meId;
                      const initials = user.name.trim().slice(0, 2);
                      return (
                        <tr key={user.id} className={`hover:bg-gray-50 ${!user.isActive ? "opacity-60" : ""}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ROLE_BADGES[user.role] || "bg-gray-100 text-gray-700"}`}>
                                {initials}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {user.name}
                                  {isSelf && (
                                    <span className="ms-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 align-middle">
                                      {t("settings.you")}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-gray-500 truncate" dir="ltr">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_BADGES[user.role] || "bg-gray-100 text-gray-700"}`}>
                              {t(`roles.${user.role}`)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                              user.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${user.isActive ? "bg-green-500" : "bg-gray-400"}`} />
                              {t(user.isActive ? "settings.active" : "settings.inactive")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                            <DateTimeCell value={user.createdAt} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openEdit(user)}
                                title={t("settings.editUser")}
                                aria-label={t("settings.editUser")}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-blue-50 hover:text-blue-600"
                              >
                                <Pencil size={18} />
                              </button>
                              {!isSelf && (
                                <>
                                  <button
                                    onClick={() => toggleStatus(user)}
                                    title={t(user.isActive ? "settings.suspendAction" : "settings.activateAction")}
                                    aria-label={t(user.isActive ? "settings.suspendAction" : "settings.activateAction")}
                                    className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${
                                      user.isActive
                                        ? "text-gray-500 hover:bg-red-50 hover:text-red-600"
                                        : "text-gray-500 hover:bg-green-50 hover:text-green-600"
                                    }`}
                                  >
                                    <Power size={18} />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(user)}
                                    title={t("common.delete")}
                                    aria-label={t("common.delete")}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400">{t("common.noData")}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
)}
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={filteredUsers.length}
              pageSize={PAGE_SIZE}
            />
          </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-5 sm:p-6 border-b bg-red-50/50">
            <h2 className="text-base font-bold text-red-700 flex items-center gap-2">
              <AlertTriangle size={18} className="shrink-0" />
              {t("settings.resetData.title")}
            </h2>
            <p className="mt-1 text-sm text-gray-600 whitespace-pre-line">{t("settings.resetData.description")}</p>
            <button
              onClick={() => setResetOpen(true)}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              <Trash2 size={18} className="shrink-0" />
              {t("settings.resetData.button")}
            </button>
          </div>
        </div>
        </div>

      <FormModal
        open={resetOpen}
        onClose={() => { setResetOpen(false); setResetText(""); }}
        title={t("settings.resetData.confirmTitle")}
      >
        <form onSubmit={(e) => { e.preventDefault(); handleReset(); }}>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mt-1 text-sm leading-6 text-gray-600 whitespace-pre-line">{t("settings.resetData.confirmMessage")}</p>
            </div>
          </div>

            <div className="mt-5">
              <label htmlFor="reset-confirm" className="mb-1 block text-sm font-medium text-red-700">
                {t("settings.resetData.typeConfirm")}
              </label>
              <input
                id="reset-confirm"
                type="text"
                dir="ltr"
                autoComplete="off"
                placeholder={t("settings.resetData.placeholder")}
                value={resetText}
                onChange={(e) => setResetText(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => { setResetOpen(false); setResetText(""); }}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <SubmitButton
                loading={resetSaving}
                label={t("settings.resetData.button")}
                loadingLabel={t("settings.resetData.running")}
                disabled={resetText.trim().toUpperCase() !== "RESET"}
                className="bg-red-600 hover:bg-red-700 text-white"
              ><Trash2 size={16} /></SubmitButton>
            </div>
          </form>
      </FormModal>

      <FormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingUser ? t("settings.editUser") : t("settings.newUser")}
      >
        <form onSubmit={handleSave}>
          <div className="space-y-4">
            <div>
              <label htmlFor="user-name" className="mb-1 block text-sm font-medium text-gray-700">{t("settings.fullName")}</label>
                <input
                  id="user-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="user-email" className="mb-1 block text-sm font-medium text-gray-700">{t("customers.email")}</label>
                <input
                  id="user-email"
                  type="email"
                  required
                  dir="ltr"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={Boolean(editingUser)}
                  className={`w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none ${
                    editingUser ? "cursor-not-allowed bg-gray-100 text-gray-500" : ""
                  }`}
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="user-password" className="mb-1 block text-sm font-medium text-gray-700">
                  {t("settings.password")}
                  {editingUser && <span className="block text-xs font-normal text-gray-400">{t("settings.passwordNewHint")}</span>}
                </label>
                <div className="relative">
                  <input
                    id="user-password"
                    type={showPassword ? "text" : "password"}
                    required={!editingUser}
                    minLength={editingUser ? undefined : 6}
                    dir="ltr"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-10 text-sm focus:border-blue-500 focus:outline-none"
                    autoComplete="new-password"
                    placeholder={editingUser ? "••••••••" : ""}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    title={t(showPassword ? "settings.hidePassword" : "settings.showPassword")}
                    aria-label={t(showPassword ? "settings.hidePassword" : "settings.showPassword")}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {!editingUser && <p className="mt-1 text-xs text-gray-400">{t("settings.passwordMin")}</p>}
              </div>

              <div>
                <label htmlFor="user-role" className="mb-1 block text-sm font-medium text-gray-700">{t("settings.colRole")}</label>
                <select
                  id="user-role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  disabled={Boolean(editingUser) && editingUser!.id === meId}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  {ALL_ROLES.map((role) => (
                    <option key={role} value={role}>{t(`roles.${role}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            {formError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
                {formError}
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
</div>
        </form>
      </FormModal>
    </div>
  );
}
