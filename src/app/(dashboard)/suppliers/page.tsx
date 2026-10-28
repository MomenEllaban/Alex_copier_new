"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import ExportButton from "@/components/ExportButton";
import { Eye, FileText, Pencil, Plus, Trash2, Upload, Save, Wallet, Truck, Users, Building2, Printer, Package, Receipt, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import ImportDialog from "@/components/ImportDialog";
import PrinterLoader from "@/components/PrinterLoader";
import { useConfirm, useToast } from "@/components/UIProvider";
import FormModal from "@/components/FormModal";
import StatsCards from "@/components/StatsCards";
import SubmitButton from "@/components/SubmitButton";
import { apiErrorMessage } from "@/lib/api-client";
import { DateTimeCell } from "@/components/DateTimeCell";
import RefreshButton from "@/components/RefreshButton";
import SupplierStatementModal from "@/components/SupplierStatementModal";
import RecordSupplierPaymentModal, { type SupplierForPayment } from "@/components/RecordSupplierPaymentModal";
import {
  buildSupplierStatement,
  buildSupplierStatementPrintHtml,
  type PurchaseOrderLite,
  type PurchaseReturnLite,
  type SupplierPaymentLite,
} from "@/lib/supplier-statement";
import { getJumlaSupplierInvoices } from "@/lib/jumla-suppliers-ledger";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

interface Supplier {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  companyId: string;
  isActive: boolean;
  createdAt: string;
  company?: Company;
  balance?: number;
  totalPurchases?: number;
  totalPayments?: number;
  returnsTotal?: number;
  ordersCount?: number;
  lastOrderDate?: string | null;
  lastPaymentDate?: string | null;
  lastPaymentAmount?: number;
  purchaseOrders?: PurchaseOrderLite[];
  returns?: PurchaseReturnLite[];
  payments?: SupplierPaymentLite[];
}
interface Company { id: string; name: string; }

const emptyForm = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  taxNumber: "",
  companyId: "",
};

export default function SuppliersPage() {
  const { t, dir } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyFilter, setCompanyFilter] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<PurchaseOrderLite[]>([]);
  const [returns, setReturns] = useState<PurchaseReturnLite[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentLite[]>([]);
  const [statementId, setStatementId] = useState<string | null>(null);
  const [paymentSupplier, setPaymentSupplier] = useState<SupplierForPayment | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const PAGE_SIZE = 10;

  const fetchSuppliers = async () => {
    try {
      const [res, companyRes] = await Promise.all([fetch("/api/suppliers"), fetch("/api/companies")]);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setSuppliers(list);

      // Collect all orders, returns, and payments across suppliers for instant statement modal
      const allOrders: PurchaseOrderLite[] = [];
      const allReturns: PurchaseReturnLite[] = [];
      const allPayments: SupplierPaymentLite[] = [];
      for (const s of list) {
        if (Array.isArray(s.purchaseOrders)) allOrders.push(...s.purchaseOrders);
        if (Array.isArray(s.returns)) allReturns.push(...s.returns);
        if (Array.isArray(s.payments)) allPayments.push(...s.payments);
      }
      setOrders(allOrders);
      setReturns(allReturns);
      setPayments(allPayments);

      setCompanies(await companyRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);
  const { refresh, refreshing } = useAutoRefresh(fetchSuppliers, ["suppliers", "purchases", "returns", "payments"]);

  const filtered = suppliers.filter(
    (s) =>
      (matchesQuery(s.name, search) ||
        matchesQuery(s.contactName || "", search) ||
        matchesQuery(s.email || "", search) ||
        matchesQuery(s.company?.name || "", search) ||
        (Boolean(s.phone) && s.phone!.includes(search))) &&
      (!companyFilter || s.companyId === companyFilter)
  );
  const hasActiveFilters = companyFilter !== "" || search !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const active = filtered.filter((s) => s.isActive).length;
  const companiesCount = new Set(filtered.filter((s) => s.companyId).map((s) => s.companyId)).size;
  const totalBalance = filtered.reduce((s, x) => s + (x.balance || 0), 0);
  const stats = { total: filtered.length, active, companiesCount, totalBalance };

  const exportSuppliers = () => ({
    headers: [
      t("suppliers.name"),
      t("common.company"),
      t("suppliers.contactName"),
      t("suppliers.phone"),
      t("suppliers.ordersCount"),
      t("suppliers.balanceDue"),
      t("suppliers.email"),
      t("suppliers.address"),
      t("suppliers.taxNumber"),
    ],
    rows: filtered.map((s) => [
      s.name,
      s.company?.name || "",
      s.contactName || "",
      s.phone || "",
      String(s.ordersCount || s.purchaseOrders?.length || 0),
      String(s.balance || 0),
      s.email || "",
      s.address || "",
      s.taxNumber || "",
    ]),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (supplier: Supplier) => {
    setSelected(null);
    setForm({
      name: supplier.name,
      contactName: supplier.contactName || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      taxNumber: supplier.taxNumber || "",
      companyId: supplier.companyId || "",
    });
    setEditingId(supplier.id);
    setFormError("");
    setShowForm(true);
  };

  const [detailsTab, setDetailsTab] = useState<"statement" | "invoices" | "contact">("statement");

  const openPaymentModal = (supplier: SupplierForPayment) => {
    setPaymentSupplier(supplier);
    setShowPaymentModal(true);
  };

  const openDetails = async (supplier: Supplier) => {
    setSelected(supplier);
    setDetailsTab("statement");
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`);
      if (res.ok) {
        const fullData = await res.json();
        if (fullData && fullData.id === supplier.id) {
          setSelected((prev) => (prev?.id === supplier.id ? { ...prev, ...fullData } : prev));
          if (Array.isArray(fullData.purchaseOrders)) {
            setOrders((prev) => [...prev.filter((o) => o.supplierId !== supplier.id), ...fullData.purchaseOrders]);
          }
          if (Array.isArray(fullData.returns)) {
            setReturns((prev) => [...prev.filter((r) => r.supplierId !== supplier.id), ...fullData.returns]);
          }
          if (Array.isArray(fullData.payments)) {
            setPayments((prev) => [...prev.filter((p) => p.supplierId !== supplier.id), ...fullData.payments]);
          }
        }
      }
    } catch {
      // Keep basic info
    }
  };

  const openStatement = async (supplierId: string) => {
    setStatementId(supplierId);
    const target = suppliers.find((s) => s.id === supplierId);
    if (!target?.purchaseOrders || target.purchaseOrders.length === 0) {
      try {
        const res = await fetch(`/api/suppliers/${supplierId}`);
        const data = await res.json();
        if (data && Array.isArray(data.purchaseOrders)) {
          setOrders((prev) => [...prev.filter((o) => o.supplierId !== supplierId), ...data.purchaseOrders]);
          if (Array.isArray(data.returns)) {
            setReturns((prev) => [...prev.filter((r) => r.supplierId !== supplierId), ...data.returns]);
          }
          if (Array.isArray(data.payments)) {
            setPayments((prev) => [...prev.filter((p) => p.supplierId !== supplierId), ...data.payments]);
          }
        }
      } catch {
        // Modal still opens; statement engine handles empty arrays.
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(editingId ? `/api/suppliers/${editingId}` : "/api/suppliers", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(apiErrorMessage(data, t));
        return;
      }
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      refresh();
      notifyDataChanged(["suppliers", "purchases"]);
      toastSuccess(t("common.savedSuccessfully"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("common.deleteConfirm") }))) return;
    const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toastError(apiErrorMessage(data, t));
      return;
    }
    setSelected(null);
    refresh();
    notifyDataChanged(["suppliers", "purchases"]);
    toastSuccess(t("common.deletedSuccessfully"));
  };

  const setField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div dir={dir} className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">
            {t("suppliers.title")}
            <span className="ms-2 text-sm font-medium text-gray-400">({filtered.length})</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/suppliers/balances"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 shadow-sm transition hover:bg-amber-100"
          >
            <Wallet size={16} />{t("suppliers.balancesBtn")}
          </Link>
          <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700">
            <Plus size={16} />{t("suppliers.addSupplier")}
          </button>
        </div>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("suppliers.stats.total"), value: stats.total.toLocaleString("ar-EG"), icon: <Truck size={18} />, tone: "sky" },
          { label: t("suppliers.stats.active"), value: stats.active.toLocaleString("ar-EG"), icon: <Users size={18} />, tone: "green" },
          { label: t("suppliers.balanceDue"), value: stats.totalBalance.toLocaleString("ar-EG") + " ج.م", icon: <Wallet size={18} />, tone: "amber" },
          { label: t("suppliers.stats.companies"), value: stats.companiesCount.toLocaleString("ar-EG"), icon: <Building2 size={18} />, tone: "purple" },
        ]}
      />

      {formError && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="status">
          <span>{formError}</span>
          <button onClick={() => setFormError("")} aria-label={t("common.close")} className="text-inherit">✕</button>
        </div>
      )}

      <FormModal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? t("suppliers.editSupplier") : t("suppliers.addSupplier")} wide>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("suppliers.name")}</label>
            <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("suppliers.contactName")}</label>
            <input type="text" value={form.contactName} onChange={(e) => setField("contactName", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("suppliers.phone")}</label>
            <input type="text" value={form.phone} onChange={(e) => setField("phone", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("suppliers.email")}</label>
            <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("suppliers.address")}</label>
            <input type="text" value={form.address} onChange={(e) => setField("address", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("suppliers.taxNumber")}</label>
            <input type="text" value={form.taxNumber} onChange={(e) => setField("taxNumber", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("common.company")}</label>
            <select value={form.companyId} onChange={(e) => setField("companyId", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
              <option value="">{t("companies.selectCompany")}</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end md:col-span-2 lg:col-span-3">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      <FormModal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `تفاصيل المورد — ${selected.name}` : ""}
        wide
      >
        {selected && (() => {
          const st = buildSupplierStatement(selected.id, orders, returns, selected.name, payments);
          const invList = getJumlaSupplierInvoices(selected.name);
          const dateFmt = (v: string) => {
            try {
              if (v.includes("/")) return v;
              return new Date(v).toLocaleDateString("ar-EG");
            } catch {
              return v;
            }
          };

          return (
            <div className="space-y-4">
              {/* Header Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-slate-900">{selected.name}</h2>
                    {st.code && (
                      <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
                        كود {st.code}
                      </span>
                    )}
                    <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      {selected.company?.name || "شركة جملة آلات"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {selected.phone ? `هاتف: ${selected.phone}` : ""} {selected.contactName ? `| المسؤول: ${selected.contactName}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      const s = selected;
                      setSelected(null);
                      openPaymentModal(s);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
                  >
                    <Wallet size={14} />
                    تسجيل دفعة سداد
                  </button>
                  <div className="rounded-lg bg-amber-100 border border-amber-300 px-3 py-1.5 text-end">
                    <span className="block text-[10px] font-bold text-amber-800">صافي الرصيد المستحق (دائن)</span>
                    <span className="text-base font-black text-amber-900">{st.balance.toLocaleString("ar-EG")} ج.م</span>
                  </div>
                </div>
              </div>

              {/* Tab Selector */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setDetailsTab("statement")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      detailsTab === "statement"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <FileText size={14} />
                    كشف الحساب وسجل الحركات ({st.entries.length})
                  </button>

                  {invList.length > 0 && (
                    <button
                      onClick={() => setDetailsTab("invoices")}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        detailsTab === "invoices"
                          ? "bg-sky-600 text-white shadow-xs"
                          : "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                      }`}
                    >
                      <Package size={14} />
                      فواتير المشتريات والآلات ({invList.length})
                    </button>
                  )}

                  <button
                    onClick={() => setDetailsTab("contact")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      detailsTab === "contact"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Users size={14} />
                    البيانات ومعلومات الاتصال
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const html = buildSupplierStatementPrintHtml(
                        selected.name,
                        selected.company?.name || "شركة جملة آلات",
                        st,
                        new Date().toLocaleDateString("ar-EG")
                      );
                      const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
                      if (w) {
                        w.document.write(html);
                        w.document.close();
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    <Printer size={13} />
                    طباعة كشف الحساب
                  </button>
                </div>
              </div>

              {/* TAB 1: Statement Ledger */}
              {detailsTab === "statement" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-2.5">
                      <span className="block text-[11px] font-semibold text-blue-700">إجمالي الفواتير (دائن)</span>
                      <span className="text-base font-black text-blue-900">{st.totalPurchases.toLocaleString("ar-EG")} ج.م</span>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5">
                      <span className="block text-[11px] font-semibold text-emerald-700">المسدد كاش ودفعات (مدين)</span>
                      <span className="text-base font-black text-emerald-900">{st.totalPaid.toLocaleString("ar-EG")} ج.م</span>
                    </div>
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5">
                      <span className="block text-[11px] font-semibold text-amber-700">صافي المستحق (دائن)</span>
                      <span className="text-base font-black text-amber-900">{st.balance.toLocaleString("ar-EG")} ج.م</span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      <span className="block text-[11px] font-semibold text-slate-500">آخر دفعة نقدية</span>
                      <span className="text-sm font-bold text-slate-800">
                        {st.lastPaymentAmount ? `${st.lastPaymentAmount.toLocaleString("ar-EG")} ج.م` : "—"}
                      </span>
                      <span className="block text-[10px] text-slate-500">{st.lastPaymentDate || ""}</span>
                    </div>
                  </div>

                  <div className="max-h-[45vh] overflow-auto rounded-xl border border-gray-200">
                    <table className="w-full min-w-[650px] text-xs">
                      <thead className="sticky top-0 bg-slate-100 text-slate-800 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-2.5 text-start font-bold">التاريخ</th>
                          <th className="px-3 py-2.5 text-center font-bold">رقم المستند</th>
                          <th className="px-3 py-2.5 text-start font-bold">نوع الحركة</th>
                          <th className="px-3 py-2.5 text-start font-bold">البيان</th>
                          <th className="px-3 py-2.5 text-end font-bold text-emerald-700">مدين (مسدد)</th>
                          <th className="px-3 py-2.5 text-end font-bold text-blue-700">دائن (مستحق)</th>
                          <th className="px-3 py-2.5 text-end font-bold text-amber-800">الرصيد التراكمي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {st.entries.map((e, idx) => (
                          <tr key={`${e.id}-${idx}`} className="hover:bg-slate-50">
                            <td className="whitespace-nowrap px-3 py-2 text-slate-700">{dateFmt(e.date)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-center font-mono font-bold text-slate-900">{e.docNumber || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2">
                              <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${
                                e.debit > 0 ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                              }`}>
                                {e.docType || (e.kind === "PURCHASE" ? "فاتورة مشتريات" : "مرتجع")}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-700 max-w-xs">{e.label}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-end font-bold text-emerald-700">
                              {e.debit > 0 ? `${e.debit.toLocaleString("ar-EG")} ج.م` : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-end font-bold text-blue-700">
                              {e.credit > 0 ? `${e.credit.toLocaleString("ar-EG")} ج.م` : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-end font-black text-amber-800">
                              {e.runningBalance.toLocaleString("ar-EG")} ج.م
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: Invoices & Machine Breakdown */}
              {detailsTab === "invoices" && (
                <div className="space-y-3 max-h-[45vh] overflow-auto">
                  {invList.map((inv) => (
                    <div key={inv.invoiceNumber} className="rounded-xl border border-sky-200 bg-white p-3 shadow-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-sky-100 pb-2 gap-2">
                        <div>
                          <span className="font-bold text-xs text-slate-900">فاتورة رقم {inv.invoiceNumber}</span>
                          <span className="text-[11px] text-gray-500 ms-2">{inv.date}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                            الإجمالي: {inv.total.toLocaleString("ar-EG")} ج.م
                          </span>
                          <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                            مسدد: {inv.cashPaid.toLocaleString("ar-EG")} ج.م
                          </span>
                          <span className="rounded bg-amber-100 px-2 py-0.5 font-black text-amber-900">
                            آجل: {inv.remainingDue.toLocaleString("ar-EG")} ج.م
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-start text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 border-b border-gray-200">
                              <th className="py-1 px-2 text-center w-6">#</th>
                              <th className="py-1 px-2 text-start font-semibold">كود الصنف</th>
                              <th className="py-1 px-2 text-start font-semibold">الصنف / الموديل</th>
                              <th className="py-1 px-2 text-center font-semibold">الكمية</th>
                              <th className="py-1 px-2 text-end font-semibold">السعر</th>
                              <th className="py-1 px-2 text-end font-semibold">الصافي</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {inv.items.map((item) => (
                              <tr key={item.index} className="hover:bg-slate-50/50">
                                <td className="py-1.5 px-2 text-center text-gray-400 font-mono">{item.index}</td>
                                <td className="py-1.5 px-2 font-mono text-gray-600">{item.code}</td>
                                <td className="py-1.5 px-2 font-bold text-slate-800">{item.name}</td>
                                <td className="py-1.5 px-2 text-center font-semibold">{item.quantity}</td>
                                <td className="py-1.5 px-2 text-end text-slate-600">{item.unitPrice.toLocaleString("ar-EG")} ج.م</td>
                                <td className="py-1.5 px-2 text-end font-bold text-slate-900">{item.total.toLocaleString("ar-EG")} ج.م</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 3: Contact & Info */}
              {detailsTab === "contact" && (
                <div className="grid grid-cols-1 gap-3 text-xs text-slate-700 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-[11px] text-gray-500">اسم المورد</span><span className="mt-1 block font-bold text-slate-800">{selected.name || "—"}</span></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-[11px] text-gray-500">الشركة</span><span className="mt-1 block font-medium text-slate-800">{selected.company?.name || "—"}</span></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-[11px] text-gray-500">المسؤول</span><span className="mt-1 block font-medium text-slate-800">{selected.contactName || "—"}</span></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-[11px] text-gray-500">الهاتف</span><span className="mt-1 block font-medium text-slate-800" dir="ltr">{selected.phone || "—"}</span></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-[11px] text-gray-500">البريد الإلكتروني</span><span className="mt-1 block font-medium text-slate-800" dir="ltr">{selected.email || "—"}</span></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-[11px] text-gray-500">العنوان</span><span className="mt-1 block font-medium text-slate-800">{selected.address || "—"}</span></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-[11px] text-gray-500">السجل الضريبي</span><span className="mt-1 block font-medium text-slate-800" dir="ltr">{selected.taxNumber || "—"}</span></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-[11px] text-gray-500">الحالة</span><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${selected.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{selected.isActive ? "نشط" : "غير نشط"}</span></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><span className="block text-[11px] text-gray-500">تاريخ الإنشاء</span><span className="mt-1 block font-medium text-slate-800"><DateTimeCell value={selected.createdAt} /></span></div>
                </div>
              )}

              {/* Modal Footer Controls */}
              <div className="mt-4 flex flex-wrap items-center justify-between border-t border-gray-200 pt-3 gap-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const s = selected;
                      setSelected(null);
                      openPaymentModal(s);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <Wallet size={14} /> تسجيل دفعة
                  </button>
                  <button onClick={() => { const s = selected; setSelected(null); openStatement(s.id); }} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-sky-700">
                    <FileText size={14} /> فتح كشف الحساب المنفصل
                  </button>
                  <button onClick={() => openEdit(selected)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100">
                    <Pencil size={14} /> {t("common.edit")}
                  </button>
                  <button onClick={() => handleDelete(selected.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100">
                    <Trash2 size={14} /> {t("common.delete")}
                  </button>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50">
                  {t("common.close")}
                </button>
              </div>
            </div>
          );
        })()}
      </FormModal>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
        <div className="w-full md:w-80 md:flex-none">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("suppliers.searchPlaceholder")}
          />
        </div>
        <FilterSelect
          value={companyFilter}
          onChange={(v) => { setCompanyFilter(v); setPage(1); }}
          options={companies.map((c) => ({ value: c.id, label: c.name }))}
          allLabel={`${t("common.company")} — ${t("common.all")}`}
          className="md:w-44"
        />
        {hasActiveFilters && (
          <button onClick={() => { setSearch(""); setCompanyFilter(""); }} className="text-sm text-gray-500 hover:text-gray-700 underline">
            {t("common.resetFilters")}
          </button>
        )}
        <div className="flex gap-2 md:ms-auto mt-2 md:mt-0">
          <RefreshButton onRefresh={refresh} refreshing={refreshing} />
          <ExportButton filename="suppliers" getExport={exportSuppliers} disabled={filtered.length === 0} />
          <button
            onClick={() => setShowImport(true)}
            className="border border-blue-600 text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-lg text-sm font-medium"
          >
            <Upload size={14} className="inline-block me-1" />{t("common.import")}
          </button>
        </div>
      </div>

        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        ) : suppliers.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.name")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.company")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.contactName")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.phone")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.ordersCount")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("suppliers.balanceDue")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paged.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{supplier.name}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {supplier.company?.name || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{supplier.contactName || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600"><span dir="ltr">{supplier.phone || "—"}</span></td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-700">
                      {supplier.ordersCount || supplier.purchaseOrders?.length || 0}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${
                        (supplier.balance || 0) > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {(supplier.balance || 0).toLocaleString("ar-EG")} ج.م
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => openPaymentModal(supplier)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100" title="تسجيل دفعة سداد">
                          <Wallet size={14} />تسجيل دفعة
                        </button>
                        <button onClick={() => openStatement(supplier.id)} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100" title={t("suppliers.statement")}>
                          <FileText size={14} />{t("suppliers.statement")}
                        </button>
                        <button onClick={() => openDetails(supplier)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100" title={t("common.view")}>
                          <Eye size={14} />{t("common.view")}
                        </button>
                        <button onClick={() => openEdit(supplier)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100" title={t("common.edit")}>
                          <Pencil size={14} />{t("common.edit")}
                        </button>
                        <button onClick={() => handleDelete(supplier.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100" title={t("common.delete")}>
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
        entity="suppliers"
        title={`${t("common.import")} — ${t("suppliers.title")}`}
        onImported={refresh}
      />

      <RecordSupplierPaymentModal
        open={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentSupplier(null);
        }}
        supplier={paymentSupplier}
        companies={companies}
        onSuccess={refresh}
      />

      {statementId && (() => {
        const s = suppliers.find((x) => x.id === statementId) || null;
        return s ? (
          <SupplierStatementModal
            open={!!s}
            onClose={() => setStatementId(null)}
            supplierId={s.id}
            supplierName={s.name}
            companyName={s.company?.name}
            orders={orders}
            returns={returns}
            payments={payments}
            onRecordPayment={(id) => {
              const target = suppliers.find((x) => x.id === id);
              if (target) openPaymentModal(target);
            }}
          />
        ) : null;
      })()}
    </div>
  );
}