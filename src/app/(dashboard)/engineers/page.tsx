"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import { Pencil, Plus, Trash2, Package, Eye, Save, ScrollText, Link2, Users, UserCheck, Wallet, ClipboardList } from "lucide-react";
import { AddFormBoundary, useAutoAddForm } from "@/hooks/useAutoAddForm";
import { useConfirm, useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import FormModal from "@/components/FormModal";
import StatsCards from "@/components/StatsCards";
import SubmitButton from "@/components/SubmitButton";
import { DateTimeCell } from "@/components/DateTimeCell";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface EngineerArea {
  id: string;
  areaName: string;
}

interface EngineerSkill {
  id: string;
  modelType: string;
  skillLevel: number;
}

interface LinkedUser {
  id: string;
  name: string;
  email: string;
}

interface SalesOrder {
  id: string;
  orderNumber: string;
  total: number;
  orderDate: string;
  status: string;
  customer?: { id: string; name: string } | null;
  company?: { id: string; name: string; nameAr?: string | null } | null;
  items?: { id: string; quantity: number; unitPrice: number; product?: { id: string; name: string } | null }[];
}

interface Engineer {
  id: string;
  name: string;
  phone: string;
  email: string;
  baseSalary: number;
  transportAllowance: number;
  commissionRate: number;
  isActive: boolean;
  areas: EngineerArea[];
  skills: EngineerSkill[];
  user?: LinkedUser | null;
  openAssignedCount?: number;
  assignedCustomersCount?: number;
  createdAt: string;
}

interface LinkableUser {
  id: string;
  name: string;
  email: string;
  linkedEngineerId: string | null;
}

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  baseSalary: "",
  transportAllowance: "",
  commissionRate: "",
  areas: "",
  userId: "",
};

export default function EngineersPage() {
  const { t, dir, locale } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [linkableUsers, setLinkableUsers] = useState<LinkableUser[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedAccount, setSelectedAccount] = useState<LinkableUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Engineer | null>(null);
  const [engineerSales, setEngineerSales] = useState<SalesOrder[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const fetchEngineers = async () => {
    try {
      const res = await fetch("/api/engineers");
      const data = await res.json();
      setEngineers(data);
    } finally {
      setLoading(false);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchEngineers, ["engineers", "users", "service-requests", "sales"]);

  const fetchEngineerSales = async (engineerId: string) => {
    setSalesLoading(true);
    try {
      const res = await fetch(`/api/engineers/${engineerId}/sales`);
      const data = await res.json();
      setEngineerSales(Array.isArray(data) ? data : []);
    } catch {
      setEngineerSales([]);
    } finally {
      setSalesLoading(false);
    }
  };

  const openEngineerDetail = (engineer: Engineer) => {
    setSelected(engineer);
    fetchEngineerSales(engineer.id);
  };

  const getStatementToken = async (engineer: Engineer): Promise<string | null> => {
    try {
      const res = await fetch(`/api/engineers/${engineer.id}/statement-token`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) {
        toastError(apiErrorMessage(data, t));
        return null;
      }
      return data.token as string;
    } catch {
      toastError(t("common.error"));
      return null;
    }
  };

  const openStatement = async (engineer: Engineer) => {
    const token = await getStatementToken(engineer);
    if (!token) return;
    const origin = window.location.origin;
    window.open(`${origin}/e/${encodeURIComponent(token)}`, "_blank", "noopener,noreferrer");
  };

  const copyStatementLink = async (engineer: Engineer) => {
    const token = await getStatementToken(engineer);
    if (!token) return;
    const url = `${window.location.origin}/e/${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      toastSuccess(t("statement.linkCopied"));
    } catch {
      toastError(t("common.error"));
    }
  };

  const openEditEngineer = (engineer: Engineer) => {
    setSelected(null);
    setForm({
      name: engineer.name,
      phone: engineer.phone || "",
      email: engineer.email || "",
      baseSalary: String(engineer.baseSalary || ""),
      transportAllowance: String(engineer.transportAllowance || ""),
      commissionRate: String(engineer.commissionRate || ""),
      areas: engineer.areas?.map((a) => a.areaName).join(", ") || "",
      userId: engineer.user?.id || "",
    });
    setEditingId(engineer.id);
    setShowForm(true);
  };

  const fetchLinkableUsers = async () => {
    const res = await fetch("/api/engineers/linkable-users");
    const data = await res.json();
    setLinkableUsers(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/engineers").then((res) => res.json()),
      fetch("/api/engineers/linkable-users")
        .then((res) => res.json())
        .catch(() => []),
    ])
      .then(([engineerData, userData]) => {
        if (cancelled) return;
        setEngineers(engineerData);
        if (Array.isArray(userData)) setLinkableUsers(userData);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const autoAddOpen = useAutoAddForm();
  useEffect(() => {
    if (autoAddOpen) setShowForm(true);
  }, [autoAddOpen]);

  const filtered = engineers.filter(
    (e) =>
      matchesQuery(e.name, search) ||
      matchesQuery(e.email, search) ||
      matchesQuery(e.areas.map((a) => a.areaName).join(" "), search) ||
      matchesQuery(e.skills.map((s) => s.modelType).join(" "), search) ||
      (Boolean(e.phone) && e.phone.includes(search))
  );
  const hasActiveFilters = search !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    const totalSalaries = engineers.reduce((sum, e) => sum + (e.baseSalary || 0), 0);
    const openRequests = engineers.reduce((sum, e) => sum + (e.openAssignedCount || 0), 0);
    return {
      total: engineers.length,
      active: engineers.filter((e) => e.isActive).length,
      salaries: totalSalaries,
      openRequests,
    };
  }, [engineers]);

  const exportEngineers = () => ({
    headers: [
      t("engineers.name"),
      t("customers.phone"),
      t("customers.email"),
      t("engineers.baseSalary"),
      t("engineers.transportAllowance"),
      t("engineers.commissionRate"),
      t("engineers.areas"),
      t("engineers.skills"),
      t("engineers.linkedAccount"),
      t("engineers.workload"),
      t("engineers.assignedCustomers"),
      t("common.status"),
    ],
    rows: filtered.map((e) => [
      e.name,
      e.phone || "",
      e.email || "",
      String(e.baseSalary),
      String(e.transportAllowance),
      String(e.commissionRate),
      e.areas.map((a) => a.areaName).join("، "),
      e.skills.map((s) => `${s.modelType} (${s.skillLevel})`).join("، "),
      e.user?.name || "",
      String(e.openAssignedCount ?? 0),
      String(e.assignedCustomersCount ?? 0),
      e.isActive ? "نعم" : "لا",
    ]),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      baseSalary: form.baseSalary ? parseFloat(form.baseSalary) : 8000,
      transportAllowance: form.transportAllowance ? parseFloat(form.transportAllowance) : 2000,
      commissionRate: form.commissionRate ? parseFloat(form.commissionRate) : 25,
      userId: form.userId || null,
      areas: form.areas
        ? form.areas.split(",").map((a) => a.trim()).filter(Boolean)
        : [],
    };
    await fetch(editingId ? `/api/engineers/${editingId}` : "/api/engineers", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    setForm(emptyForm);
    setSelectedAccount(null);
    setEditingId(null);
    setShowForm(false);
    refresh();
    fetchLinkableUsers();
    notifyDataChanged(["engineers", "users", "sales"]);
  };

  const handleUserSelection = (userId: string) => {
    const selectedUser = linkableUsers.find((user) => user.id === userId) ?? null;
    setSelectedAccount(selectedUser);
    setForm((prev) => ({
      ...prev,
      userId,
      name: prev.name || selectedUser?.name || "",
      email: prev.email || selectedUser?.email || "",
    }));
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("engineers.deleteConfirm") }))) return;
    const res = await fetch(`/api/engineers/${id}`, { method: "DELETE" });
    if (res.ok) {
      const payload = await res.json().catch(() => null);
      toastSuccess(payload?.deactivated ? payload.message : t("common.deletedSuccessfully"));
    } else {
      const payload = await res.json().catch(() => null);
      toastError(apiErrorMessage(payload, t));
    }
    refresh();
    notifyDataChanged(["engineers", "users", "sales", "service-requests", "settlements"]);
    setSelected(null);
  };

  const setField = (field: string, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "userId" && value === "") {
        setSelectedAccount(null);
      }
      return next;
    });
  };

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">{t("engineers.title")}</h1>
        </div>
        <button
          onClick={() => { setShowForm(true); setSelected(null); setSelectedAccount(null); setForm(emptyForm); }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
        >
          <Plus size={16} />{t("engineers.addEngineer")}
        </button>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("engineers.stats.total"), value: stats.total.toLocaleString("ar-EG"), icon: <Users size={18} />, tone: "sky" },
          { label: t("engineers.stats.active"), value: stats.active.toLocaleString("ar-EG"), icon: <UserCheck size={18} />, tone: "green" },
          { label: t("engineers.stats.salaries"), value: `${stats.salaries.toLocaleString("ar-EG")} ج.م`, icon: <Wallet size={18} />, tone: "purple" },
          { label: t("engineers.stats.openRequests"), value: stats.openRequests.toLocaleString("ar-EG"), icon: <ClipboardList size={18} />, tone: "amber" },
        ]}
      />

      <FormModal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? t("engineers.editEngineer") : t("engineers.addEngineer")} wide>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("engineers.name")}</label>
            <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.phone")}</label>
            <input type="text" value={form.phone} onChange={(e) => setField("phone", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.email")}</label>
            <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("engineers.linkedAccount")}</label>
            <select
              value={form.userId}
              onChange={(e) => handleUserSelection(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t("engineers.selectAccountOptional")}</option>
              {linkableUsers.filter((u) => !u.linkedEngineerId).map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
              ))}
            </select>
          </div>

          {selectedAccount && (
            <div className="md:col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <div className="font-medium mb-1">{t("engineers.selectedAccount")}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div><span className="font-medium">{t("engineers.name")}: </span>{selectedAccount.name}</div>
                <div><span className="font-medium">{t("customers.email")}: </span>{selectedAccount.email}</div>
                <div className="md:col-span-2"><span className="font-medium">{t("settings.password")}: </span>{t("engineers.passwordHidden")}</div>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("engineers.baseSalary")}</label>
            <input type="number" value={form.baseSalary} onChange={(e) => setField("baseSalary", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("engineers.transportAllowance")}</label>
            <input type="number" value={form.transportAllowance} onChange={(e) => setField("transportAllowance", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("engineers.commissionRate")} %</label>
            <input type="number" value={form.commissionRate} onChange={(e) => setField("commissionRate", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-sm font-medium text-slate-700">{t("engineers.areas")}</label>
            <input
              type="text"
              placeholder={locale === "ar" ? "مفصولة بفاصلة" : "comma separated"}
              value={form.areas}
              onChange={(e) => setField("areas", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end md:col-span-2 lg:col-span-3">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      <FormModal open={!!selected} onClose={() => { setSelected(null); setEngineerSales([]); }} title={selected ? selected.name : ""} wide>
        {selected && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-sm mb-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.phone")}</span><span className="mt-1 block font-medium text-slate-800" dir="ltr">{selected.phone || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.email")}</span><span className="mt-1 block font-medium text-slate-800">{selected.email || selected.user?.email || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("engineers.baseSalary")}</span><span className="mt-1 block font-medium text-slate-800">{selected.baseSalary.toLocaleString()}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("engineers.transportAllowance")}</span><span className="mt-1 block font-medium text-slate-800">{selected.transportAllowance.toLocaleString()}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("engineers.commissionRate")}</span><span className="mt-1 block font-medium text-slate-800">{selected.commissionRate}%</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("engineers.workload")}</span><span className="mt-1 block font-medium text-slate-800">{selected.openAssignedCount ?? 0}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("engineers.assignedCustomers")}</span><span className="mt-1 block font-medium text-slate-800">{selected.assignedCustomersCount ?? 0}</span></div>
            </div>

            {selected.areas.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-2">{t("engineers.areas")}</h3>
                <div className="flex flex-wrap gap-2">
                  {selected.areas.map((area) => (
                    <span key={area.id} className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{area.areaName}</span>
                  ))}
                </div>
              </div>
            )}

            {selected.skills.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-2">{t("engineers.skills")}</h3>
                <div className="flex flex-wrap gap-2">
                  {selected.skills.map((skill) => (
                    <span key={skill.id} className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {skill.modelType} ({locale === "ar" ? "مستوى" : "level"} {skill.skillLevel})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {salesLoading ? (
              <div className="flex items-center justify-center py-6">
                <PrinterLoader size="sm" label={t("common.loading")} />
              </div>
            ) : engineerSales.length > 0 ? (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">{t("engineers.salesHistory")}</h3>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      <Package size={13} />{engineerSales.length}
                    </span>
                    {engineerSales.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {t("engineerStatement.totalSales")}: {engineerSales.reduce((sum, s) => sum + (s.total || 0), 0).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2.5 text-start text-xs font-medium text-gray-500">{t("sales.orderNumber")}</th>
                        <th className="px-4 py-2.5 text-start text-xs font-medium text-gray-500">{t("serviceRequests.customer")}</th>
                        <th className="px-4 py-2.5 text-start text-xs font-medium text-gray-500">{t("warehouses.company")}</th>
                        <th className="px-4 py-2.5 text-start text-xs font-medium text-gray-500">{t("sales.items")}</th>
                        <th className="px-4 py-2.5 text-start text-xs font-medium text-gray-500">{t("sales.total")}</th>
                        <th className="px-4 py-2.5 text-start text-xs font-medium text-gray-500">{t("warehouses.date")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {engineerSales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-sm font-medium">{sale.orderNumber}</td>
                          <td className="px-4 py-2.5 text-sm">{sale.customer?.name || "—"}</td>
                          <td className="px-4 py-2.5 text-sm">{sale.company?.nameAr || sale.company?.name || "—"}</td>
                          <td className="px-4 py-2.5 text-sm">{sale.items?.map((item) => item.product?.name).filter(Boolean).join(", ") || "—"}</td>
                          <td className="px-4 py-2.5 text-sm font-semibold">{sale.total.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-500"><DateTimeCell value={sale.orderDate} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.close")}</button>
              <button onClick={() => openStatement(selected)} className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100" title={t("statement.openStatement")}>
                <ScrollText size={14} />{t("statement.openStatement")}
              </button>
              <button onClick={() => copyStatementLink(selected)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100" title={t("statement.copyLink")}>
                <Link2 size={14} />{t("statement.copyLink")}
              </button>
              <button onClick={() => openEditEngineer(selected)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                <Pencil size={14} />{t("common.edit")}
              </button>
              <button onClick={() => { handleDelete(selected.id); setSelected(null); }} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700">
                <Trash2 size={14} />{t("common.delete")}
              </button>
            </div>
          </>
        )}
      </FormModal>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none"><SearchInput value={search} onChange={setSearch} placeholder={t("engineers.searchPlaceholder")} /></div>
          {hasActiveFilters && (
            <button onClick={() => setSearch("")} className="text-sm text-gray-500 hover:text-gray-700 underline">
              {t("common.resetFilters")}
            </button>
          )}
          <div className="md:ms-auto mt-2 md:mt-0 flex gap-2">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton filename="engineers" getExport={exportEngineers} disabled={filtered.length === 0} />
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : engineers.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineers.name")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.email")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.phone")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineers.baseSalary")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineers.transportAllowance")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineers.commissionRate")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineers.workload")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineers.assignedCustomers")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineers.linkedAccount")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.status")}</th>
                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paged.map((engineer) => (
                  <tr
                    key={engineer.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => openEngineerDetail(engineer)}
                  >
                    <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{engineer.name}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap"><span dir="ltr">{engineer.email || engineer.user?.email || "—"}</span></td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap"><span dir="ltr">{engineer.phone || "—"}</span></td>
                    <td className="px-4 py-3 text-sm">{engineer.baseSalary.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm">{engineer.transportAllowance.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm">{engineer.commissionRate}%</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        (engineer.openAssignedCount ?? 0) >= 5
                          ? "bg-red-100 text-red-800"
                          : (engineer.openAssignedCount ?? 0) >= 3
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-700"
                      }`}>
                        {engineer.openAssignedCount ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-800">
                        {engineer.assignedCustomersCount ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{engineer.user?.name || engineer.user?.email || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${engineer.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${engineer.isActive ? "bg-green-500" : "bg-red-500"}`} />
                        {engineer.isActive ? t("common.active") : t("common.inactive")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); openEngineerDetail(engineer); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-100" title={t("common.view")}>
                          <Eye size={14} />{t("common.view")}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); openStatement(engineer); }} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs font-medium text-sky-700 transition hover:bg-sky-100" title={t("statement.openStatement")}>
                          <ScrollText size={14} />{t("statement.openStatement")}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); openEditEngineer(engineer); }} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-100" title={t("common.edit")}>
                          <Pencil size={14} />{t("common.edit")}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(engineer.id); }} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100" title={t("common.delete")}>
                          <Trash2 size={14} />{t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        )}
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
        />
      </div>
    </div>
  );
}
