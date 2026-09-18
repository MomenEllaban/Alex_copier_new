"use client";

import { useEffect, useState, useTransition, useMemo } from "react";
import { useI18n } from "@/i18n/context";
import PrinterLoader from "@/components/PrinterLoader";
import SearchInput from "@/components/SearchInput";
import Pagination from "@/components/Pagination";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import ExportButton from "@/components/ExportButton";
import RefreshButton from "@/components/RefreshButton";
import StatsCards from "@/components/StatsCards";
import { useConfirm, useToast } from "@/components/UIProvider";
import { Calendar, Plus, CheckCircle2, XCircle, Clock } from "lucide-react";

interface Employee {
  id: string;
  code: string;
  fullName: string;
  fullNameAr?: string | null;
}

interface LeaveRequest {
  id: string;
  employeeId: string;
  category: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason?: string | null;
  status: string;
  rejectReason?: string | null;
  approvedBy?: string | null;
  createdAt: string;
  Employee?: Employee | null;
}

export default function LeavesPage() {
  const { t, dir, locale } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 10;

  const [showAddModal, setShowAddModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState<LeaveRequest | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState("");

  const [formData, setFormData] = useState({
    employeeId: "",
    category: "ANNUAL",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    reason: "",
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [lRes, eRes] = await Promise.all([
        fetch("/api/hr/leaves"),
        fetch("/api/hr/employees"),
      ]);

      if (lRes.ok) setLeaves(await lRes.json());
      if (eRes.ok) setEmployees(await eRes.json());
    } catch (err) {
      console.error("Error loading leaves:", err);
      toastError(t("hr.leaves.toastLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAddModal = () => {
    setFormError("");
    setFormData({
      employeeId: employees[0]?.id || "",
      category: "ANNUAL",
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date().toISOString().split("T")[0],
      reason: "",
    });
    setShowAddModal(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formData.employeeId || !formData.startDate || !formData.endDate) {
      setFormError(t("hr.leaves.validFill"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/hr/leaves", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t("hr.leaves.toastAddFailed"));

        toastSuccess(t("hr.leaves.toastAdded"));
        setShowAddModal(false);
        fetchData();
      } catch (err: any) {
        setFormError(err.message || t("hr.leaves.toastAddError"));
      }
    });
  };

  const handleApprove = async (id: string) => {
    const ok = await confirmAction({
      title: t("hr.leaves.approveConfirmTitle"),
      message: t("hr.leaves.approveConfirmMsg"),
    });
    if (!ok) return;

    try {
      const res = await fetch("/api/hr/leaves", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "approve" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("hr.leaves.toastApproveFailed"));
      }

      toastSuccess(t("hr.leaves.toastApproved"));
      fetchData();
    } catch (err: any) {
      toastError(err.message || t("hr.leaves.toastApproveError"));
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showRejectModal) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/hr/leaves", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: showRejectModal.id,
            action: "reject",
            rejectReason: rejectReasonInput,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || t("hr.leaves.toastRejectFailed"));
        }

        toastSuccess(t("hr.leaves.toastRejected"));
        setShowRejectModal(null);
        setRejectReasonInput("");
        fetchData();
      } catch (err: any) {
        toastError(err.message || t("hr.leaves.toastRejectError"));
      }
    });
  };

  const filtered = leaves.filter((l) => {
    const empName = l.Employee?.fullNameAr || l.Employee?.fullName || "";
    const empCode = l.Employee?.code || "";
    const matchesSearch = !search || empName.toLowerCase().includes(search.toLowerCase()) || empCode.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    return {
      total: leaves.length,
      pending: leaves.filter((l) => l.status === "PENDING").length,
      approved: leaves.filter((l) => l.status === "APPROVED").length,
      rejected: leaves.filter((l) => l.status === "REJECTED").length,
    };
  }, [leaves]);

  const getLeaveTypeLabel = (cat: string) => {
    switch (cat) {
      case "ANNUAL": return t("hr.leaves.typeAnnual");
      case "SICK": return t("hr.leaves.typeSick");
      case "UNPAID": return t("hr.leaves.typeUnpaid");
      case "EMERGENCY": return t("hr.leaves.typeEmergency");
      case "MATERNITY": return t("hr.leaves.typeMaternity");
      case "OTHER": return t("hr.leaves.typeOther");
      default: return cat;
    }
  };

  if (loading) return <PrinterLoader label={t("hr.leaves.loading")} />;

  return (
    <div dir={dir} className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="text-blue-600 shrink-0" size={28} />
            {t("hr.leaves.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("hr.leaves.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchData} refreshing={loading} />
          <ExportButton
            filename="leaves_export"
            getExport={() => ({
              headers: [t("hr.leaves.exportCode"), t("hr.leaves.exportName"), t("hr.leaves.exportType"), t("hr.leaves.exportFrom"), t("hr.leaves.exportTo"), t("hr.leaves.exportDays"), t("hr.leaves.exportStatus")],
              rows: filtered.map((l) => [
                l.Employee?.code || "",
                l.Employee?.fullNameAr || l.Employee?.fullName || "",
                getLeaveTypeLabel(l.category),
                new Date(l.startDate).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB"),
                new Date(l.endDate).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB"),
                String(l.daysCount),
                l.status,
              ]),
            })}
          />
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
          >
            <Plus size={18} className="shrink-0" />
            {t("hr.leaves.newRequest")}
          </button>
        </div>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("hr.leaves.statTotal"), value: stats.total.toLocaleString("en-US"), icon: <Calendar size={18} />, tone: "sky" },
          { label: t("hr.leaves.statPending"), value: stats.pending.toLocaleString("en-US"), icon: <Clock size={18} />, tone: "amber" },
          { label: t("hr.leaves.statApproved"), value: stats.approved.toLocaleString("en-US"), icon: <CheckCircle2 size={18} />, tone: "green" },
          { label: t("hr.leaves.statRejected"), value: stats.rejected.toLocaleString("en-US"), icon: <XCircle size={18} />, tone: "rose" },
        ]}
      />

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder={t("hr.leaves.searchPlaceholder")}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{t("hr.leaves.allStatuses")}</option>
          <option value="PENDING">{t("hr.leaves.filterPending")}</option>
          <option value="APPROVED">{t("hr.leaves.filterApproved")}</option>
          <option value="REJECTED">{t("hr.leaves.filterRejected")}</option>
        </select>
      </div>

      {/* Leaves Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
              <tr>
                <th className="p-3 font-semibold text-start">{t("hr.leaves.thEmployee")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.leaves.thType")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.leaves.thPeriod")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.leaves.thDays")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.leaves.thReason")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.leaves.thStatus")}</th>
                <th className="p-3 font-semibold text-center">{t("hr.leaves.thActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    {t("hr.leaves.noMatch")}
                  </td>
                </tr>
              ) : (
                paged.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-gray-900">{l.Employee?.fullNameAr || l.Employee?.fullName}</div>
                      <div className="text-xs text-gray-500"><span dir="ltr">{l.Employee?.code}</span></div>
                    </td>
                    <td className="p-3 font-medium text-gray-800">
                      {getLeaveTypeLabel(l.category)}
                    </td>
                    <td className="p-3 text-gray-700">
                      <div>{t("hr.leaves.from")} <span dir="ltr">{new Date(l.startDate).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB")}</span></div>
                      <div>{t("hr.leaves.to")} <span dir="ltr">{new Date(l.endDate).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB")}</span></div>
                    </td>
                    <td className="p-3">
                      <span className="font-extrabold text-blue-700 bg-blue-50 px-2.5 py-1 rounded whitespace-nowrap">
                        {l.daysCount} {t("hr.leaves.day")}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600 max-w-xs truncate">
                      {l.reason || "-"}
                      {l.rejectReason && (
                        <div className="text-xs text-rose-600 mt-0.5">{t("hr.leaves.rejectReasonPrefix")}{l.rejectReason}</div>
                      )}
                    </td>
                    <td className="p-3">
                      {l.status === "PENDING" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 flex items-center gap-1 w-fit whitespace-nowrap">
                          <Clock size={14} className="shrink-0" /> {t("hr.leaves.badgePending")}
                        </span>
                      )}
                      {l.status === "APPROVED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit whitespace-nowrap">
                          <CheckCircle2 size={14} className="shrink-0" /> {t("hr.leaves.badgeApproved")}
                        </span>
                      )}
                      {l.status === "REJECTED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 flex items-center gap-1 w-fit whitespace-nowrap">
                          <XCircle size={14} className="shrink-0" /> {t("hr.leaves.badgeRejected")}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {l.status === "PENDING" ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleApprove(l.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-colors"
                          >
                            {t("hr.leaves.actionApprove")}
                          </button>
                          <button
                            onClick={() => { setShowRejectModal(l); setRejectReasonInput(""); }}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-colors"
                          >
                            {t("hr.leaves.actionReject")}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">{t("hr.leaves.reviewed")}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
        />
      </div>

      {/* Add Leave Modal */}
      {showAddModal && (
        <FormModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          title={t("hr.leaves.addModalTitle")}
        >
          <form onSubmit={handleAddSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.leaves.labelEmployee")}</label>
              <select
                required
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t("hr.leaves.selectEmployee")}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} - {e.fullNameAr || e.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.leaves.labelType")}</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="ANNUAL">{t("hr.leaves.typeAnnual")}</option>
                <option value="SICK">{t("hr.leaves.typeSick")}</option>
                <option value="EMERGENCY">{t("hr.leaves.typeEmergency")}</option>
                <option value="UNPAID">{t("hr.leaves.typeUnpaid")}</option>
                <option value="MATERNITY">{t("hr.leaves.typeMaternity")}</option>
                <option value="OTHER">{t("hr.leaves.typeOther")}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.leaves.labelStartDate")}</label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.leaves.labelEndDate")}</label>
                <input
                  type="date"
                  required
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.leaves.labelReason")}</label>
              <textarea
                rows={3}
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder={t("hr.leaves.reasonPlaceholder")}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <SubmitButton loading={isPending} label={t("hr.leaves.submitRequest")} />
            </div>
          </form>
        </FormModal>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <FormModal
          open={!!showRejectModal}
          onClose={() => setShowRejectModal(null)}
          title={t("hr.leaves.rejectModalTitle")}
        >
          <form onSubmit={handleRejectSubmit} className="space-y-4">
            <p className="text-sm text-gray-700">
              {t("hr.leaves.rejectIntro")} <strong>{showRejectModal.Employee?.fullNameAr || showRejectModal.Employee?.fullName}</strong>
            </p>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.leaves.rejectReasonLabel")}</label>
              <textarea
                rows={3}
                required
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500"
                placeholder={t("hr.leaves.rejectReasonPlaceholder")}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowRejectModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <SubmitButton loading={isPending} label={t("hr.leaves.confirmReject")} className="bg-rose-600 hover:bg-rose-700 text-white" />
            </div>
          </form>
        </FormModal>
      )}
    </div>
  );
}
