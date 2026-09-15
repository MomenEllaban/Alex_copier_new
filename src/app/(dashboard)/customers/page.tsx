"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import { Camera, Pencil, Plus, Save, Trash2, Upload, Wallet } from "lucide-react";
import ExportButton from "@/components/ExportButton";
import ImportDialog from "@/components/ImportDialog";
import PrinterLoader from "@/components/PrinterLoader";
import { useConfirm, useToast } from "@/components/UIProvider";
import { useUrlParams, useSearchWithDefault } from "@/hooks/useUrlParams";
import { apiErrorMessage } from "@/lib/api-client";
import FormModal from "@/components/FormModal";
import CopierTests from "@/components/CopierTests";
import SubmitButton from "@/components/SubmitButton";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface CustomerLocation {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  governorate?: string | null;
  phone?: string | null;
  isActive?: boolean;
}

interface Company { id: string; name: string; nameAr?: string | null; }

interface Customer {
  id: string;
  name: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  governorate: string;
  taxNumber: string;
  creditLimit: number;
  paymentTerms: string;
  customerType: string;
  isActive: boolean;
  totalDebt: number;
  remainingDebt: number;
  lastPaymentDate: string | null;
  locations: CustomerLocation[];
  payments?: { id: string; amount: number; paymentDate: string; notes?: string | null; company?: { id: string; name: string } | null }[];
  createdAt: string;
  machines?: { id: string; serialNumber: string; manufacturer?: string | null; model?: string | null; currentStatus: string }[];
  serviceRequests?: { id: string; requestNumber: string; status: string; priority: string; createdAt: string; machine?: { serialNumber: string } | null }[];
  contracts?: { id: string; contractNumber: string; status: string; endDate: string; value: number }[];
  orders?: { id: string; total: number; status: string; orderDate: string }[];
  ledgers?: { balance: number }[];
}

const emptyForm = {
  name: "",
  companyName: "",
  companyId: "",
  contactPerson: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  city: "",
  governorate: "",
  taxNumber: "",
  creditLimit: "",
  paymentTerms: "",
  customerType: "INDIVIDUAL",
  totalDebt: "",
  remainingDebt: "",
};

const TYPE_BADGES: Record<string, string> = {
  INDIVIDUAL: "bg-blue-100 text-blue-800",
  COMPANY: "bg-purple-100 text-purple-800",
};

const TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "فرد",
  COMPANY: "شركة",
};

export default function CustomersPage() {
  const { t, dir } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const urlParams = useUrlParams(["q"]);
  const [search, setSearchInput] = useSearchWithDefault(urlParams.q ?? "");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [testsCustomer, setTestsCustomer] = useState<{
    id: string;
    name: string;
    machines: { id: string; serialNumber: string; model?: string | null }[];
  } | null>(null);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showLocForm, setShowLocForm] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [locForm, setLocForm] = useState({ name: "", address: "", city: "", governorate: "", phone: "" });
  const [locError, setLocError] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentCompanyId, setPaymentCompanyId] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const PAGE_SIZE = 15;

  const fetchCustomers = async () => {
    try {
      const [customersRes, companiesRes] = await Promise.all([
        fetch("/api/customers"),
        fetch("/api/companies"),
      ]);
      const [customersData, companiesData] = await Promise.all([
        customersRes.json(),
        companiesRes.json(),
      ]);
      setCustomers(customersData);
      setCompanies(Array.isArray(companiesData) ? companiesData : []);
    } finally {
      setLoading(false);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchCustomers, ["customers", "sales", "payments"]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filtered = customers.filter(
    (c) =>
      (matchesQuery(c.name, search) ||
        matchesQuery(c.companyName, search) ||
        matchesQuery(c.email, search) ||
        (Boolean(c.phone) && c.phone.includes(search))) &&
      (!typeFilter || c.customerType === typeFilter)
  );

  const hasActiveFilters = typeFilter !== "" || search !== "";

  const stats = useMemo(() => {
    const totalRemaining = filtered.reduce((sum, c) => sum + (c.remainingDebt || 0), 0);
    const debtorsCount = filtered.filter((c) => (c.remainingDebt || 0) > 0).length;
    const creditCount = filtered.filter((c) => (c.remainingDebt || 0) < 0).length;
    const totalCredit = filtered.reduce((sum, c) => sum + Math.max(0, -(c.remainingDebt || 0)), 0);
    return { totalRemaining, debtorsCount, creditCount, totalCredit };
  }, [filtered]);

  const resetFilters = () => {
    setSearchInput(null);
    setTypeFilter("");
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportCustomers = () => ({
    headers: [
      t("customers.name"),
      t("customers.companyName"),
      t("customers.phone"),
      t("customers.email"),
      t("customers.city"),
      t("customers.governorate"),
      t("customers.creditLimit"),
      t("customers.type"),
      t("common.status"),
    ],
    rows: filtered.map((c) => [
      c.name,
      c.companyName || "",
      c.phone || "",
      c.email || "",
      c.city || "",
      c.governorate || "",
      String(c.creditLimit),
      TYPE_LABELS[c.customerType] || c.customerType,
      c.isActive ? t("common.yes") : t("common.no"),
    ]),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setShowForm(!showForm);
  };

  const openEdit = (customer: Customer) => {
    setSelected(null);
    setForm({
      name: customer.name,
      companyName: customer.companyName || "",
      companyId: "",
      contactPerson: customer.contactPerson || "",
      phone: customer.phone || "",
      whatsapp: customer.whatsapp || "",
      email: customer.email || "",
      address: customer.address || "",
      city: customer.city || "",
      governorate: customer.governorate || "",
      taxNumber: customer.taxNumber || "",
      creditLimit: String(customer.creditLimit || ""),
      paymentTerms: customer.paymentTerms || "",
      customerType: customer.customerType,
      totalDebt: String(customer.totalDebt || ""),
      remainingDebt: String(customer.remainingDebt || ""),
    });
    setEditingId(customer.id);
    setError("");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(editingId ? `/api/customers/${editingId}` : "/api/customers", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          companyId: form.companyId || undefined,
          creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : 0,
          totalDebt: form.totalDebt ? parseFloat(form.totalDebt) : 0,
          remainingDebt: form.remainingDebt ? parseFloat(form.remainingDebt) : (form.totalDebt ? parseFloat(form.totalDebt) : 0),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(data, t));
        return;
      }
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      refresh();
      notifyDataChanged(["customers", "sales"]);
      toastSuccess(t("common.savedSuccessfully"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("common.deleteConfirm") }))) return;
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toastError(apiErrorMessage(data, t));
      return;
    }
    refresh();
    notifyDataChanged(["customers", "sales"]);
    setSelected(null);
    toastSuccess(t("common.deletedSuccessfully"));
  };

  const setField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openDetails = async (id: string) => {
    const res = await fetch(`/api/customers/${id}`);
    if (res.ok) setSelected(await res.json());
  };

  const openTests = async (customer: Customer) => {
    try {
      const res = await fetch(`/api/customers/${customer.id}`);
      if (res.ok) {
        const data = await res.json();
        setTestsCustomer({
          id: data.id,
          name: data.name,
          machines: (data.machines || []).map(
            (m: { id: string; serialNumber: string; model?: string | null }) => ({
              id: m.id,
              serialNumber: m.serialNumber,
              model: m.model ?? null,
            }),
          ),
        });
        return;
      }
    } catch {
      /* fall through to row-data fallback */
    }
    setTestsCustomer({ id: customer.id, name: customer.name, machines: [] });
  };

  const resetLocForm = () => {
    setLocForm({ name: "", address: "", city: "", governorate: "", phone: "" });
    setEditingLocationId(null);
    setShowLocForm(false);
    setLocError("");
  };

  const openLocationCreate = () => {
    setLocForm({ name: "", address: "", city: "", governorate: "", phone: "" });
    setEditingLocationId(null);
    setShowLocForm(true);
    setLocError("");
  };

  const openLocationEdit = (loc: CustomerLocation) => {
    setLocForm({
      name: loc.name,
      address: loc.address || "",
      city: loc.city || "",
      governorate: loc.governorate || "",
      phone: loc.phone || "",
    });
    setEditingLocationId(loc.id);
    setShowLocForm(true);
    setLocError("");
  };

  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setLocError("");
    setSavingLocation(true);
    const res = await fetch(
      editingLocationId ? `/api/locations/${editingLocationId}` : `/api/customers/${selected.id}/locations`,
      {
        method: editingLocationId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(locForm),
      },
    );
    const data = await res.json().catch(() => null);
    setSavingLocation(false);
    if (!res.ok) {
      setLocError(apiErrorMessage(data, t));
      return;
    }
    resetLocForm();
    await openDetails(selected.id);
  };

  const handleLocationDelete = async (locationId: string) => {
    if (!selected) return;
    if (!(await confirmAction({ message: t("customers.deleteLocationConfirm") }))) return;
    const res = await fetch(`/api/locations/${locationId}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setLocError(apiErrorMessage(data, t));
      return;
    }
    await openDetails(selected.id);
  };

  const openPaymentModal = (customer: Customer) => {
    setPaymentCustomer(customer);
    setPaymentAmount("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentNotes("");
    setPaymentCompanyId("");
    setShowPaymentModal(true);
  };

  const getStatementToken = async (customer: Customer): Promise<string | null> => {
    try {
      const res = await fetch(`/api/customers/${customer.id}/statement-token`, { method: "POST" });
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

  const openStatement = async (customer: Customer) => {
    const token = await getStatementToken(customer);
    if (!token) return;
    const origin = window.location.origin;
    window.open(`${origin}/s/${encodeURIComponent(token)}`, "_blank", "noopener,noreferrer");
  };

  const copyStatementLink = async (customer: Customer) => {
    const token = await getStatementToken(customer);
    if (!token) return;
    const url = `${window.location.origin}/s/${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      toastSuccess(t("statement.linkCopied"));
    } catch {
      toastError(t("common.error"));
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCustomer) return;
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) { toastError("المبلغ يجب أن يكون أكبر من صفر"); return; }
    setSavingPayment(true);
    try {
      const res = await fetch(`/api/customers/${paymentCustomer.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, paymentDate, notes: paymentNotes || undefined, companyId: paymentCompanyId || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toastError(apiErrorMessage(data, t)); return; }
      toastSuccess("تم تسجيل الدفعة بنجاح");
      setShowPaymentModal(false);
      setPaymentCustomer(null);
      refresh();
      notifyDataChanged(["customers", "payments", "sales", "companies", "notifications"]);
    } finally {
      setSavingPayment(false);
    }
  };

  const date = (value: string) => value ? `${new Date(value).toLocaleDateString("en-GB")} ${new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "—";
  const isOpen = (status: string) => !["RESOLVED", "CLOSED"].includes(status);

  return (
    <div dir={dir} className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">
            {t("customers.title")}
            <span className="ms-2 text-sm font-medium text-gray-400">({filtered.length})</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/customers/balances"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 shadow-sm transition hover:bg-amber-100"
          >
            <Wallet size={16} />{t("customers.balancesBtn")}
          </Link>
          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          >
            <Plus size={16} />{t("customers.addCustomer")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-600">{t("customers.statsTotalRemaining")}</p>
          <p className="mt-1 text-lg font-bold text-amber-700">{stats.totalRemaining.toLocaleString("ar-EG")} ج.م</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-medium text-red-500">{t("customers.statsDebtors")}</p>
          <p className="mt-1 text-lg font-bold text-red-600">{stats.debtorsCount}</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-medium text-green-600">{t("customers.statsTotalCredit")}</p>
          <p className="mt-1 text-lg font-bold text-green-700">
            {stats.creditCount > 0 ? `${stats.totalCredit.toLocaleString("ar-EG")} ج.م (${stats.creditCount})` : "—"}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label={t("common.close")} className="text-inherit">✕</button>
        </div>
      )}

      <FormModal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? t("customers.editCustomer") : t("customers.addCustomer")} wide>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.name")}</label>
            <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.companyName")}</label>
            <input type="text" value={form.companyName} onChange={(e) => setField("companyName", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("warehouses.company")}</label>
            <select value={form.companyId} onChange={(e) => setField("companyId", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">{t("common.selectOption")}</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.nameAr || company.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.contactPerson")}</label>
            <input type="text" value={form.contactPerson} onChange={(e) => setField("contactPerson", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.phone")}</label>
            <input type="text" value={form.phone} onChange={(e) => setField("phone", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">واتساب</label>
            <input type="text" value={form.whatsapp} onChange={(e) => setField("whatsapp", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.email")}</label>
            <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.address")}</label>
            <input type="text" value={form.address} onChange={(e) => setField("address", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.city")}</label>
            <input type="text" value={form.city} onChange={(e) => setField("city", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.governorate")}</label>
            <input type="text" value={form.governorate} onChange={(e) => setField("governorate", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.taxNumber")}</label>
            <input type="text" value={form.taxNumber} onChange={(e) => setField("taxNumber", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.creditLimit")}</label>
            <input type="number" value={form.creditLimit} onChange={(e) => setField("creditLimit", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.paymentTerms")}</label>
            <input type="text" value={form.paymentTerms} onChange={(e) => setField("paymentTerms", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("customers.type")}</label>
            <select value={form.customerType} onChange={(e) => setField("customerType", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="INDIVIDUAL">{TYPE_LABELS.INDIVIDUAL}</option>
              <option value="COMPANY">{TYPE_LABELS.COMPANY}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">الدين الكلي (ج.م)</label>
            <input type="number" min="0" step="0.01" value={form.totalDebt} onChange={(e) => setField("totalDebt", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
          </div>
          {editingId && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">المتبقي من الدين (ج.م)</label>
              <input type="number" min="0" step="0.01" value={form.remainingDebt} onChange={(e) => setField("remainingDebt", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
            </div>
          )}
          <div className="md:col-span-3 flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      <FormModal open={!!selected} onClose={() => { setSelected(null); setShowLocForm(false); setLocError(""); }} title={selected ? selected.name : ""} wide>
        {selected && (
          <>
            <div className="mb-4 grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.companyName")}</span><span className="mt-1 block font-medium text-slate-800">{selected.companyName || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.contactPerson")}</span><span className="mt-1 block font-medium text-slate-800">{selected.contactPerson || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.phone")}</span><span className="mt-1 block font-medium text-slate-800" dir="ltr">{selected.phone || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.email")}</span><span className="mt-1 block font-medium text-slate-800">{selected.email || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.address")}</span><span className="mt-1 block font-medium text-slate-800">{selected.address || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.city")}</span><span className="mt-1 block font-medium text-slate-800">{selected.city || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.governorate")}</span><span className="mt-1 block font-medium text-slate-800">{selected.governorate || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.taxNumber")}</span><span className="mt-1 block font-medium text-slate-800" dir="ltr">{selected.taxNumber || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.creditLimit")}</span><span className="mt-1 block font-medium text-slate-800">{selected.creditLimit.toLocaleString()}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.paymentTerms")}</span><span className="mt-1 block font-medium text-slate-800">{selected.paymentTerms || "—"}</span></div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-xs text-gray-500">{t("customers.type")}</span><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${TYPE_BADGES[selected.customerType] || ""}`}>{TYPE_LABELS[selected.customerType] || selected.customerType}</span></div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Summary label={t("customers.machines")} value={selected.machines?.length || 0} />
              <Summary label={t("customers.openRequests")} value={selected.serviceRequests?.filter(r => isOpen(r.status)).length || 0} />
              <Summary label={t("customers.contracts")} value={selected.contracts?.filter(c => c.status === "ACTIVE").length || 0} />
              <Summary label={t("customers.sales")} value={selected.orders?.length || 0} />
              <Summary label={t("customers.outstandingBalance")} value={(selected.ledgers || []).reduce((total, ledger) => total + ledger.balance, 0).toLocaleString()} />
            </div>

            {/* Debt & Payment Section */}
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-amber-800">حساب العميل</h3>
                <div className="flex gap-2">
                  <button onClick={() => openPaymentModal(selected)} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700">
                    تسجيل دفعة
                  </button>
                  <button onClick={() => openStatement(selected)} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700" title={t("statement.openStatement")}>
                    {t("statement.openStatement")}
                  </button>
                  <button onClick={() => copyStatementLink(selected)} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100" title={t("statement.copyLink")}>
                    {t("statement.copyLink")}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-3">
                <div className="rounded-lg bg-white p-3 border border-amber-200">
                  <span className="block text-xs text-gray-500">الدين الكلي</span>
                  <span className="mt-1 block text-lg font-bold text-slate-800">{selected.totalDebt.toLocaleString("ar-EG")} ج.م</span>
                </div>
                <div className="rounded-lg bg-white p-3 border border-amber-200">
                  <span className="block text-xs text-gray-500">{selected.remainingDebt < 0 ? t("customers.underAccount") : "المتبقي"}</span>
                  <span className={`mt-1 block text-lg font-bold ${selected.remainingDebt > 0 ? "text-red-600" : "text-green-600"}`}>
                    {(selected.remainingDebt < 0 ? Math.abs(selected.remainingDebt) : selected.remainingDebt).toLocaleString("ar-EG")} ج.م
                  </span>
                </div>
                <div className="rounded-lg bg-white p-3 border border-amber-200">
                  <span className="block text-xs text-gray-500">آخر دفعة</span>
                  <span className="mt-1 block text-sm font-medium text-slate-800">{selected.lastPaymentDate ? date(selected.lastPaymentDate) : "—"}</span>
                </div>
              </div>
              {selected.remainingDebt > 0 && selected.totalDebt > 0 && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>تم السداد</span>
                    <span>{Math.round(((selected.totalDebt - selected.remainingDebt) / selected.totalDebt) * 100)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div className="h-2 rounded-full bg-green-500" style={{ width: `${Math.min(100, ((selected.totalDebt - selected.remainingDebt) / selected.totalDebt) * 100)}%` }} />
                  </div>
                </div>
              )}
              {selected.payments && selected.payments.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-amber-700 mb-2">سجل الدفعات ({selected.payments.length})</h4>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {selected.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs border border-amber-100">
                        <span className="text-gray-600">{date(p.paymentDate)}</span>
                        <span className="font-bold text-green-700">+{p.amount.toLocaleString("ar-EG")} ج.م</span>
                        {p.company && <span className="text-blue-600 truncate max-w-[100px]">{p.company.name}</span>}
                        {p.notes && <span className="text-gray-400 truncate max-w-[120px]">{p.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selected.remainingDebt === 0 && selected.totalDebt > 0 && (
                <div className="rounded-lg bg-green-100 p-2 text-center text-sm font-semibold text-green-700">
                  تم السداد بالكامل
                </div>
              )}
              {selected.remainingDebt < 0 && (
                <div className="rounded-lg bg-emerald-100 p-2 text-center text-sm font-semibold text-emerald-700">
                  {t("customers.creditAvailable")}: {Math.abs(selected.remainingDebt).toLocaleString("ar-EG")} ج.م — {t("customers.creditHint")}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-900">{t("customers.locations")}</h3>
                {!showLocForm && (
                  <button onClick={openLocationCreate} className="border border-blue-600 text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-medium">
                    + {t("customers.addLocation")}
                  </button>
                )}
              </div>

              {locError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{locError}</div>
              )}

              {showLocForm && (
                <form onSubmit={handleLocationSubmit} className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t("customers.locationName")}</label>
                    <input type="text" value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t("customers.address")}</label>
                    <input type="text" value={locForm.address} onChange={(e) => setLocForm({ ...locForm, address: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t("customers.phone")}</label>
                    <input type="text" dir="ltr" value={locForm.phone} onChange={(e) => setLocForm({ ...locForm, phone: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t("customers.city")}</label>
                    <input type="text" value={locForm.city} onChange={(e) => setLocForm({ ...locForm, city: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t("customers.governorate")}</label>
                    <input type="text" value={locForm.governorate} onChange={(e) => setLocForm({ ...locForm, governorate: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="flex items-end justify-end gap-2">
                    <button type="button" onClick={resetLocForm} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100">{t("common.cancel")}</button>
                    <SubmitButton loading={savingLocation} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
                  </div>
                </form>
              )}

              {selected.locations.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("customers.locationName")}</th>
                        <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("customers.address")}</th>
                        <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("customers.city")}</th>
                        <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("customers.governorate")}</th>
                        <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("customers.phone")}</th>
                        <th className="px-4 py-2 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selected.locations.map((loc) => (
                        <tr key={loc.id} className={loc.isActive === false ? "opacity-50" : ""}>
                          <td className="px-4 py-2 font-medium">{loc.name}{loc.isActive === false && ` (${t("common.inactive")})`}</td>
                          <td className="px-4 py-2">{loc.address || "—"}</td>
                          <td className="px-4 py-2">{loc.city || "—"}</td>
                          <td className="px-4 py-2">{loc.governorate || "—"}</td>
                          <td className="px-4 py-2"><span dir="ltr">{loc.phone || "—"}</span></td>
                          <td className="px-4 py-2">
                            <div className="flex gap-2">
                              <button onClick={() => openLocationEdit(loc)} className="text-blue-600 hover:text-blue-800"><Pencil size={14} className="inline-block me-1" />{t("common.edit")}</button>
                              {loc.isActive !== false && (
                                <button onClick={() => handleLocationDelete(loc.id)} className="text-red-600 hover:text-red-800"><Trash2 size={14} className="inline-block me-1" />{t("common.delete")}</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                !showLocForm && <p className="text-sm text-gray-400">{t("customers.noLocations")}</p>
              )}
            </div>

            <div className="grid gap-4 mt-5 lg:grid-cols-2">
              <CustomerPanel title={t("customers.machines")}>
                {selected.machines?.length ? selected.machines.map(machine => <div key={machine.id} className="flex justify-between border-b border-gray-100 py-2 text-sm"><Link href={`/machines?serial=${encodeURIComponent(machine.serialNumber)}`} className="font-mono font-medium text-blue-600 hover:underline">{machine.serialNumber}</Link><span>{[machine.manufacturer, machine.model].filter(Boolean).join(" ") || "—"} · {machine.currentStatus}</span></div>) : <p className="text-sm text-gray-400">{t("common.noData")}</p>}
              </CustomerPanel>
              <CustomerPanel title={t("customers.serviceHistory")}>
                {selected.serviceRequests?.length ? selected.serviceRequests.slice(0, 6).map(request => <div key={request.id} className="flex justify-between border-b border-gray-100 py-2 text-sm"><Link href={`/service-requests?focus=${request.id}`} className="font-medium text-blue-600 hover:underline">{request.requestNumber}</Link><span>{request.machine?.serialNumber || "—"} · {request.status} · {date(request.createdAt)}</span></div>) : <p className="text-sm text-gray-400">{t("common.noData")}</p>}
              </CustomerPanel>
              <CustomerPanel title={t("customers.contracts")}>
                {selected.contracts?.length ? selected.contracts.map(contract => <div key={contract.id} className="flex justify-between border-b border-gray-100 py-2 text-sm"><Link href={`/contracts?focus=${contract.id}`} className="font-medium text-blue-600 hover:underline">{contract.contractNumber}</Link><span>{contract.status} · {date(contract.endDate)}</span></div>) : <p className="text-sm text-gray-400">{t("common.noData")}</p>}
              </CustomerPanel>
              <CustomerPanel title={t("customers.sales")}>
                {selected.orders?.length ? selected.orders.slice(0, 6).map(order => <div key={order.id} className="flex justify-between border-b border-gray-100 py-2 text-sm"><span>{date(order.orderDate)}</span><span>{order.total.toLocaleString()} · {order.status}</span></div>) : <p className="text-sm text-gray-400">{t("common.noData")}</p>}
              </CustomerPanel>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.close")}</button>
              <button onClick={() => openEdit(selected)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                <Pencil size={14} />{t("common.edit")}
              </button>
              <button onClick={() => handleDelete(selected.id)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700">
                <Trash2 size={14} />{t("common.delete")}
              </button>
            </div>
          </>
        )}
      </FormModal>

      <FormModal
        open={!!testsCustomer}
        onClose={() => setTestsCustomer(null)}
        title={testsCustomer ? `${t("copierTests.title")} — ${testsCustomer.name}` : ""}
        wide
      >
        {testsCustomer && (
          <CopierTests customerId={testsCustomer.id} machines={testsCustomer.machines} />
        )}
      </FormModal>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none">
            <SearchInput
              value={search}
              onChange={setSearchInput}
              placeholder={t("customers.searchPlaceholder")}
            />
          </div>
          <FilterSelect
            value={typeFilter}
            onChange={(v) => { setTypeFilter(v); setPage(1); }}
            options={[
              { value: "INDIVIDUAL", label: TYPE_LABELS.INDIVIDUAL },
              { value: "COMPANY", label: TYPE_LABELS.COMPANY },
            ]}
            allLabel={`${t("customers.typeFilter")} — ${t("common.all")}`}
            className="md:w-44"
          />
          {hasActiveFilters && (
            <button onClick={resetFilters} className="text-sm text-gray-500 hover:text-gray-700 underline">
              {t("common.resetFilters")}
            </button>
          )}
          <div className="flex gap-2 md:ms-auto mt-2 md:mt-0">
            <RefreshButton onRefresh={refresh} refreshing={refreshing} />
            <ExportButton filename="customers" getExport={exportCustomers} disabled={filtered.length === 0} />
            <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-1.5 border border-gray-300 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 transition hover:bg-gray-50">
              <Upload size={14} />{t("common.import")}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : customers.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.name")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.companyName")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("customers.phone")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">الدين الكلي</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">المتبقي</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">آخر دفعة</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paged.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetails(customer.id)}>
                    <td className="px-4 py-3 text-sm font-medium">{customer.name}</td>
                    <td className="px-4 py-3 text-sm">{customer.companyName || "—"}</td>
                    <td className="px-4 py-3 text-sm">{customer.phone || "—"}</td>
                    <td className="px-4 py-3 text-sm font-medium">{customer.totalDebt > 0 ? `${customer.totalDebt.toLocaleString("ar-EG")} ج.م` : "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      {customer.remainingDebt !== 0 ? (
                        <span className={`inline-flex items-center gap-1.5 ${customer.remainingDebt > 0 ? "font-semibold text-red-600" : "font-semibold text-green-600"}`}>
                          {customer.remainingDebt > 0 ? (
                            <>{customer.remainingDebt.toLocaleString("ar-EG")} ج.م</>
                          ) : (
                            <>
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">{t("customers.underAccount")}</span>
                              {Math.abs(customer.remainingDebt).toLocaleString("ar-EG")} ج.م
                            </>
                          )}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">{customer.lastPaymentDate ? date(customer.lastPaymentDate) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => openPaymentModal(customer)} className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100" title="تسجيل دفعة">
                          دفع
                        </button>
                        <button onClick={() => openTests(customer)} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100" title={t("copierTests.title")}>
                          <Camera size={14} />{t("copierTests.title")}
                        </button>
                        <button onClick={() => openStatement(customer)} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100" title={t("statement.openStatement")}>
                          كشف حساب
                        </button>
                        <button onClick={() => openDetails(customer.id)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100">
                          {t("common.view")}
                        </button>
                        <button onClick={() => openEdit(customer)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100" title={t("common.edit")}>
                          <Pencil size={14} />{t("common.edit")}
                        </button>
                        <button onClick={() => handleDelete(customer.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100" title={t("common.delete")}>
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

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        entity="customers"
        title={`${t("common.import")} — ${t("customers.title")}`}
        onImported={refresh}
      />

      <FormModal open={showPaymentModal} onClose={() => { setShowPaymentModal(false); setPaymentCustomer(null); }} title={`تسجيل دفعة — ${paymentCustomer?.name || ""}`}>
        <form onSubmit={handleRecordPayment} className="space-y-4">
          {paymentCustomer && paymentCustomer.totalDebt > 0 && (
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">الدين الكلي:</span><span className="font-medium">{paymentCustomer.totalDebt.toLocaleString("ar-EG")} ج.م</span></div>
              <div className="flex justify-between">
                <span className="text-gray-500">{paymentCustomer.remainingDebt < 0 ? t("customers.underAccount") : "المتبقي:"}</span>
                <span className={`font-bold ${paymentCustomer.remainingDebt > 0 ? "text-red-600" : "text-green-600"}`}>
                  {(paymentCustomer.remainingDebt < 0 ? Math.abs(paymentCustomer.remainingDebt) : paymentCustomer.remainingDebt).toLocaleString("ar-EG")} ج.م
                </span>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">الشركة</label>
            <select value={paymentCompanyId} onChange={(e) => setPaymentCompanyId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">بدون شركة</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">المبلغ *</label>
            <input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" required />
            {paymentCustomer && paymentAmount && (
              (() => {
                const after = paymentCustomer.remainingDebt - parseFloat(paymentAmount || "0");
                if (after > 0) {
                  return <p className="text-xs text-gray-500">المتبقي بعد الدفع: {after.toLocaleString("ar-EG")} ج.م</p>;
                }
                if (after < 0) {
                  return (
                    <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700">
                      {t("customers.creditHint")}: {Math.abs(after).toLocaleString("ar-EG")} ج.م
                    </p>
                  );
                }
                return <p className="text-xs text-green-600">تم تسديد كامل المديونية</p>;
              })()
            )}
            {paymentCustomer && <p className="text-xs text-gray-400">{t("customers.paymentExcessHint")}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">تاريخ الدفع</label>
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">ملاحظات</label>
            <input type="text" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="اختياري" />
          </div>
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => { setShowPaymentModal(false); setPaymentCustomer(null); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            <SubmitButton loading={savingPayment} label="تسجيل الدفعة" loadingLabel={t("common.saving")} className="bg-green-600 hover:bg-green-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-gray-50 border border-gray-200 p-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p></div>;
}

function CustomerPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-gray-200 p-4"><h3 className="mb-2 font-semibold text-sm">{title}</h3>{children}</section>;
}
