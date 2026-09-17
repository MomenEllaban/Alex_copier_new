"use client";

import { useEffect, useState, useTransition, useMemo } from "react";
import { useI18n } from "@/i18n/context";
import PrinterLoader from "@/components/PrinterLoader";
import SearchInput from "@/components/SearchInput";
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
  const { t } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

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
      toastError("فشل تحميل طلبات الإجازات");
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
      setFormError("رجاء تعبئة بيانات الإجازة والتواريخ بشكل صحيح");
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
        if (!res.ok) throw new Error(data.error || "فشل تقديم طلب الإجازة");

        toastSuccess("تم تقديم طلب الإجازة بنجاح");
        setShowAddModal(false);
        fetchData();
      } catch (err: any) {
        setFormError(err.message || "حدث خطأ أثناء تقديم الطلب");
      }
    });
  };

  const handleApprove = async (id: string) => {
    const ok = await confirmAction({
      title: "الموافقة على الإجازة",
      message: "هل أنت متأكد من موافقتك على طلب الإجازة؟",
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
        throw new Error(data.error || "فشل إكمال الموافقة");
      }

      toastSuccess("تمت الموافقة على طلب الإجازة وتحديث الرصيد");
      fetchData();
    } catch (err: any) {
      toastError(err.message || "خطأ في عملية الموافقة");
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
          throw new Error(data.error || "فشل عملية الرفض");
        }

        toastSuccess("تم رفض طلب الإجازة بنجاح");
        setShowRejectModal(null);
        setRejectReasonInput("");
        fetchData();
      } catch (err: any) {
        toastError(err.message || "حدث خطأ في الرفض");
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
      case "ANNUAL": return "سنوية (Annual)";
      case "SICK": return "مرضية (Sick)";
      case "UNPAID": return "بدون أجر (Unpaid)";
      case "EMERGENCY": return "عارضة / طارئة (Emergency)";
      case "MATERNITY": return "وضع / أمومة (Maternity)";
      case "OTHER": return "أخرى (Other)";
      default: return cat;
    }
  };

  if (loading) return <PrinterLoader label="جاري تحميل طلبات الإجازات..." />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="text-blue-600" size={28} />
            طلبات الإجازات والاستئذانات
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            تقديم طلبات الإجازة، ومراجعتها، والموافقة أو الرفض مع خصم الأرصدة التلقائي.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchData} refreshing={loading} />
          <ExportButton
            filename="leaves_export"
            getExport={() => ({
              headers: ["كود الموظف", "الاسم", "نوع الإجازة", "من", "إلى", "عدد الأيام", "الحالة"],
              rows: filtered.map((l) => [
                l.Employee?.code || "",
                l.Employee?.fullNameAr || l.Employee?.fullName || "",
                getLeaveTypeLabel(l.category),
                new Date(l.startDate).toLocaleDateString("ar-EG"),
                new Date(l.endDate).toLocaleDateString("ar-EG"),
                String(l.daysCount),
                l.status,
              ]),
            })}
          />
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
          >
            <Plus size={18} />
            طلب إجازة جديد
          </button>
        </div>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: "إجمالي الطلبات", value: stats.total.toLocaleString("ar-EG"), icon: <Calendar size={18} />, tone: "sky" },
          { label: "معلقة", value: stats.pending.toLocaleString("ar-EG"), icon: <Clock size={18} />, tone: "amber" },
          { label: "مقبولة", value: stats.approved.toLocaleString("ar-EG"), icon: <CheckCircle2 size={18} />, tone: "green" },
          { label: "مرفوضة", value: stats.rejected.toLocaleString("ar-EG"), icon: <XCircle size={18} />, tone: "rose" },
        ]}
      />

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="بحث باسم الموظف أو الكود..."
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500"
        >
          <option value="">جميع الحالات (معلقة، مأذونة، مرفوضة)</option>
          <option value="PENDING">معلقة (Pending)</option>
          <option value="APPROVED">مقبولة (Approved)</option>
          <option value="REJECTED">مرفوضة (Rejected)</option>
        </select>
      </div>

      {/* Leaves Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
              <tr>
                <th className="p-3 font-semibold">الموظف</th>
                <th className="p-3 font-semibold">نوع الإجازة</th>
                <th className="p-3 font-semibold">فترة الإجازة</th>
                <th className="p-3 font-semibold">عدد الأيام</th>
                <th className="p-3 font-semibold">السبب / الملاحظات</th>
                <th className="p-3 font-semibold">الحالة</th>
                <th className="p-3 font-semibold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    لا توجد طلبات إجازة متطابقة.
                  </td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-gray-900">{l.Employee?.fullNameAr || l.Employee?.fullName}</div>
                      <div className="text-xs text-gray-500">{l.Employee?.code}</div>
                    </td>
                    <td className="p-3 font-medium text-gray-800">
                      {getLeaveTypeLabel(l.category)}
                    </td>
                    <td className="p-3 text-gray-700">
                      <div>من: {new Date(l.startDate).toLocaleDateString("ar-EG")}</div>
                      <div>إلى: {new Date(l.endDate).toLocaleDateString("ar-EG")}</div>
                    </td>
                    <td className="p-3">
                      <span className="font-extrabold text-blue-700 bg-blue-50 px-2.5 py-1 rounded">
                        {l.daysCount} يوم
                      </span>
                    </td>
                    <td className="p-3 text-gray-600 max-w-xs truncate">
                      {l.reason || "-"}
                      {l.rejectReason && (
                        <div className="text-xs text-rose-600 mt-0.5">سبب الرفض: {l.rejectReason}</div>
                      )}
                    </td>
                    <td className="p-3">
                      {l.status === "PENDING" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 flex items-center gap-1 w-fit">
                          <Clock size={14} /> معلقة
                        </span>
                      )}
                      {l.status === "APPROVED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit">
                          <CheckCircle2 size={14} /> مقبول
                        </span>
                      )}
                      {l.status === "REJECTED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 flex items-center gap-1 w-fit">
                          <XCircle size={14} /> مرفوض
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
                            موافقة
                          </button>
                          <button
                            onClick={() => { setShowRejectModal(l); setRejectReasonInput(""); }}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-colors"
                          >
                            رفض
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">تمت المراجعة</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Leave Modal */}
      {showAddModal && (
        <FormModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="تقديم طلب إجازة جديد"
        >
          <form onSubmit={handleAddSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">الموظف *</label>
              <select
                required
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">اختر الموظف...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} - {e.fullNameAr || e.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">نوع الإجازة *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="ANNUAL">سنوية (Annual)</option>
                <option value="SICK">مرضية (Sick)</option>
                <option value="EMERGENCY">عارضة / طارئة (Emergency)</option>
                <option value="UNPAID">بدون أجر (Unpaid)</option>
                <option value="MATERNITY">أمومة / وضع (Maternity)</option>
                <option value="OTHER">أخرى (Other)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">تاريخ البداية *</label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">تاريخ النهاية *</label>
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
              <label className="block text-xs font-bold text-gray-700 mb-1">سبب الإجازة / ملاحظات</label>
              <textarea
                rows={3}
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="اكتب سبب طلب الإجازة هنا..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <SubmitButton loading={isPending} label="تقديم الطلب" />
            </div>
          </form>
        </FormModal>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <FormModal
          open={!!showRejectModal}
          onClose={() => setShowRejectModal(null)}
          title="رفض طلب الإجازة"
        >
          <form onSubmit={handleRejectSubmit} className="space-y-4">
            <p className="text-sm text-gray-700">
              أنت على وشك رفض إجازة الموظف: <strong>{showRejectModal.Employee?.fullNameAr || showRejectModal.Employee?.fullName}</strong>
            </p>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">سبب الرفض</label>
              <textarea
                rows={3}
                required
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500"
                placeholder="وضح للموظف سبب عدم موافقة الإدارة..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowRejectModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <SubmitButton loading={isPending} label="تأكيد الرفض" className="bg-rose-600 hover:bg-rose-700 text-white" />
            </div>
          </form>
        </FormModal>
      )}
    </div>
  );
}
