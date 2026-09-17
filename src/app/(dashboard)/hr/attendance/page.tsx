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
import { useToast } from "@/components/UIProvider";
import { UserCheck, Calendar, Plus, Users, Clock3, XCircle } from "lucide-react";

interface Employee {
  id: string;
  code: string;
  fullName: string;
  fullNameAr?: string | null;
  Department?: { id: string; name: string; nameAr?: string | null } | null;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  firstIn?: string | null;
  lastOut?: string | null;
  workMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  status: string;
  isManual: boolean;
  notes?: string | null;
  Employee?: Employee | null;
}

export default function AttendancePage() {
  const { t } = useI18n();
  const { success: toastSuccess, error: toastError } = useToast();

  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState("");

  const [formData, setFormData] = useState({
    employeeId: "",
    date: new Date().toISOString().split("T")[0],
    inTime: "09:00",
    outTime: "17:00",
    status: "PRESENT",
    notes: "",
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [attRes, empRes] = await Promise.all([
        fetch(`/api/hr/attendance?date=${date}`),
        fetch("/api/hr/employees"),
      ]);

      if (attRes.ok) setRecords(await attRes.json());
      if (empRes.ok) setEmployees(await empRes.json());
    } catch (err) {
      console.error("Error loading attendance:", err);
      toastError("فشل تحميل سجلات البصمة والحضور");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [date]);

  const handleOpenAddModal = () => {
    setFormError("");
    setFormData({
      employeeId: employees[0]?.id || "",
      date: date,
      inTime: "09:00",
      outTime: "17:00",
      status: "PRESENT",
      notes: "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formData.employeeId || !formData.date) {
      setFormError("اختر الموظف والتاريخ بشكل صحيح");
      return;
    }

    startTransition(async () => {
      try {
        let firstInIso = null;
        let lastOutIso = null;

        if (formData.inTime) {
          firstInIso = new Date(`${formData.date}T${formData.inTime}:00`).toISOString();
        }
        if (formData.outTime) {
          lastOutIso = new Date(`${formData.date}T${formData.outTime}:00`).toISOString();
        }

        const res = await fetch("/api/hr/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: formData.employeeId,
            date: formData.date,
            firstIn: firstInIso,
            lastOut: lastOutIso,
            status: formData.status,
            notes: formData.notes,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "فشل تسجيل الحضور");

        toastSuccess("تم تسجيل / تحديث بصمة الموظف بنجاح");
        setShowModal(false);
        fetchData();
      } catch (err: any) {
        setFormError(err.message || "حدث خطأ أثناء الحفظ");
      }
    });
  };

  const filtered = records.filter((rec) => {
    const empName = rec.Employee?.fullName || rec.Employee?.fullNameAr || "";
    const empCode = rec.Employee?.code || "";
    const matchesSearch =
      !search || empName.toLowerCase().includes(search.toLowerCase()) || empCode.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || rec.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = useMemo(() => {
    return {
      total: records.length,
      present: records.filter((r) => r.status === "PRESENT").length,
      late: records.filter((r) => r.status === "LATE").length,
      absent: records.filter((r) => r.status === "ABSENT").length,
    };
  }, [records]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PRESENT":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">حاضر</span>;
      case "LATE":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">متأخر</span>;
      case "ABSENT":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">غائب</span>;
      case "ON_LEAVE":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">إجازة</span>;
      case "HOLIDAY":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">عطلة رسمية</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const formatTime = (isoStr?: string | null) => {
    if (!isoStr) return "--:--";
    const d = new Date(isoStr);
    return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) return <PrinterLoader label="جاري تحميل سجل البصمات والحضور..." />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="text-blue-600" size={28} />
            سجل التحضير والبصمة اليومية
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            متابعة الحضور، الغياب، التأخير، والخروج المبكر للموظفين.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchData} refreshing={loading} />
          <ExportButton
            filename={`attendance_${date}`}
            getExport={() => ({
              headers: ["كود الموظف", "الاسم", "الدخول", "الخروج", "التأخير بالدقائق", "الحالة"],
              rows: filtered.map((r) => [
                r.Employee?.code || "",
                r.Employee?.fullNameAr || r.Employee?.fullName || "",
                formatTime(r.firstIn),
                formatTime(r.lastOut),
                String(r.lateMinutes || 0),
                r.status,
              ]),
            })}
          />
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
          >
            <Plus size={18} />
            تسجيل حضور يدوي
          </button>
        </div>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: "سجلات اليوم", value: stats.total.toLocaleString("ar-EG"), icon: <Users size={18} />, tone: "sky" },
          { label: "حاضرون", value: stats.present.toLocaleString("ar-EG"), icon: <UserCheck size={18} />, tone: "green" },
          { label: "متأخرون", value: stats.late.toLocaleString("ar-EG"), icon: <Clock3 size={18} />, tone: "amber" },
          { label: "غائبون", value: stats.absent.toLocaleString("ar-EG"), icon: <XCircle size={18} />, tone: "rose" },
        ]}
      />

      {/* Date Filter & Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="text-xs font-bold text-gray-700 whitespace-nowrap flex items-center gap-1">
            <Calendar size={16} className="text-blue-600" />
            تاريخ اليوم:
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
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
            <option value="">جميع الحالات</option>
            <option value="PRESENT">حاضر (Present)</option>
            <option value="LATE">متأخر (Late)</option>
            <option value="ABSENT">غائب (Absent)</option>
            <option value="ON_LEAVE">في إجازة (On Leave)</option>
          </select>
        </div>
      </div>

      {/* Attendance Records Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
              <tr>
                <th className="p-3 font-semibold text-start">الموظف</th>
                <th className="p-3 font-semibold text-start">القسم</th>
                <th className="p-3 font-semibold text-start">وقت الدخول</th>
                <th className="p-3 font-semibold text-start">وقت الخروج</th>
                <th className="p-3 font-semibold text-start">ساعات العمل</th>
                <th className="p-3 font-semibold text-start">التأخير</th>
                <th className="p-3 font-semibold text-start">الحالة</th>
                <th className="p-3 font-semibold text-start">إدخال يدوي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    لا توجد سجلات حضور مسجلة لهذا اليوم.
                  </td>
                </tr>
              ) : (
                filtered.map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-gray-900">
                        {rec.Employee?.fullNameAr || rec.Employee?.fullName}
                      </div>
                      <div className="text-xs text-gray-500">{rec.Employee?.code}</div>
                    </td>
                    <td className="p-3 text-gray-600">
                      {rec.Employee?.Department?.nameAr || rec.Employee?.Department?.name || "-"}
                    </td>
                    <td className="p-3 font-medium text-emerald-700">
                      {formatTime(rec.firstIn)}
                    </td>
                    <td className="p-3 font-medium text-rose-700">
                      {formatTime(rec.lastOut)}
                    </td>
                    <td className="p-3 text-gray-900 font-semibold">
                      {(rec.workMinutes / 60).toFixed(1)} ساعة
                    </td>
                    <td className="p-3">
                      {rec.lateMinutes > 0 ? (
                        <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded text-xs">
                          {rec.lateMinutes} دقيقة
                        </span>
                      ) : (
                        <span className="text-emerald-600 text-xs font-medium">في الموعد</span>
                      )}
                    </td>
                    <td className="p-3">{getStatusBadge(rec.status)}</td>
                    <td className="p-3 text-xs text-gray-500">
                      {rec.isManual ? (
                        <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded">يدوي</span>
                      ) : (
                        <span className="text-gray-400">بصمة جهاز</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Attendance Modal */}
      {showModal && (
        <FormModal
          open={showModal}
          onClose={() => setShowModal(false)}
          title="تسجيل حضور / تعديل بصمة يدويًا"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <label className="block text-xs font-bold text-gray-700 mb-1">التاريخ *</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">وقت الدخول (In)</label>
                <input
                  type="time"
                  value={formData.inTime}
                  onChange={(e) => setFormData({ ...formData, inTime: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">وقت الخروج (Out)</label>
                <input
                  type="time"
                  value={formData.outTime}
                  onChange={(e) => setFormData({ ...formData, outTime: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">الحالة *</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="PRESENT">حاضر (Present)</option>
                <option value="LATE">متأخر (Late)</option>
                <option value="ABSENT">غائب (Absent)</option>
                <option value="ON_LEAVE">في إجازة (On Leave)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">سبب التعديل اليدوي / ملاحظات</label>
              <textarea
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="مثال: عطل في جهاز البصمة، أو تصريح رسمي..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <SubmitButton loading={isPending} label="حفظ السجل" />
            </div>
          </form>
        </FormModal>
      )}
    </div>
  );
}
