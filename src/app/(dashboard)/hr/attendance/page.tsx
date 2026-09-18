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
  const { t, dir, locale } = useI18n();
  const { success: toastSuccess, error: toastError } = useToast();

  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 10;

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
      toastError(t("hr.attendance.toastLoadFailed"));
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
      setFormError(t("hr.attendance.validSelect"));
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
        if (!res.ok) throw new Error(data.error || t("hr.attendance.toastSubmitFailed"));

        toastSuccess(t("hr.attendance.toastSaved"));
        setShowModal(false);
        fetchData();
      } catch (err: any) {
        setFormError(err.message || t("hr.attendance.toastSaveError"));
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const filteredTodayEmployees = useMemo(() => {
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
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 whitespace-nowrap">{t("hr.attendance.badgePresent")}</span>;
      case "LATE":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 whitespace-nowrap">{t("hr.attendance.badgeLate")}</span>;
      case "ABSENT":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 whitespace-nowrap">{t("hr.attendance.badgeAbsent")}</span>;
      case "ON_LEAVE":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 whitespace-nowrap">{t("hr.attendance.badgeOnLeave")}</span>;
      case "HOLIDAY":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 whitespace-nowrap">{t("hr.attendance.badgeHoliday")}</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const formatTime = (isoStr?: string | null) => {
    if (!isoStr) return "--:--";
    const d = new Date(isoStr);
    return d.toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) return <PrinterLoader label={t("hr.attendance.loading")} />;

  return (
    <div dir={dir} className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="text-blue-600 shrink-0" size={28} />
            {t("hr.attendance.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("hr.attendance.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchData} refreshing={loading} />
          <ExportButton
            filename={`attendance_${date}`}
            getExport={() => ({
              headers: [t("hr.attendance.exportCode"), t("hr.attendance.exportName"), t("hr.attendance.exportIn"), t("hr.attendance.exportOut"), t("hr.attendance.exportLateMinutes"), t("hr.attendance.exportStatus")],
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
            <Plus size={18} className="shrink-0" />
            {t("hr.attendance.manualAdd")}
          </button>
        </div>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("hr.attendance.statToday"), value: filteredTodayEmployees.total.toLocaleString("en-US"), icon: <Users size={18} />, tone: "sky" },
          { label: t("hr.attendance.statPresent"), value: filteredTodayEmployees.present.toLocaleString("en-US"), icon: <UserCheck size={18} />, tone: "green" },
          { label: t("hr.attendance.statLate"), value: filteredTodayEmployees.late.toLocaleString("en-US"), icon: <Clock3 size={18} />, tone: "amber" },
          { label: t("hr.attendance.statAbsent"), value: filteredTodayEmployees.absent.toLocaleString("en-US"), icon: <XCircle size={18} />, tone: "rose" },
        ]}
      />

      {/* Date Filter & Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="text-xs font-bold text-gray-700 whitespace-nowrap flex items-center gap-1">
            <Calendar size={16} className="text-blue-600 shrink-0" />
            {t("hr.attendance.todayLabel")}
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder={t("hr.attendance.searchPlaceholder")}
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t("hr.attendance.allStatuses")}</option>
            <option value="PRESENT">{t("hr.attendance.statusPresent")}</option>
            <option value="LATE">{t("hr.attendance.statusLate")}</option>
            <option value="ABSENT">{t("hr.attendance.statusAbsent")}</option>
            <option value="ON_LEAVE">{t("hr.attendance.statusOnLeave")}</option>
          </select>
        </div>
      </div>

      {/* Attendance Records Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
              <tr>
                <th className="p-3 font-semibold text-start">{t("hr.attendance.thEmployee")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.attendance.thDepartment")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.attendance.thInTime")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.attendance.thOutTime")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.attendance.thWorkHours")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.attendance.thLate")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.attendance.thStatus")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.attendance.thManual")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    {t("hr.attendance.noRecords")}
                  </td>
                </tr>
              ) : (
                paged.map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-gray-900">
                        {rec.Employee?.fullNameAr || rec.Employee?.fullName}
                      </div>
                      <div className="text-xs text-gray-500"><span dir="ltr">{rec.Employee?.code}</span></div>
                    </td>
                    <td className="p-3 text-gray-600">
                      {rec.Employee?.Department?.nameAr || rec.Employee?.Department?.name || "-"}
                    </td>
                    <td className="p-3 font-medium text-emerald-700">
                      <span dir="ltr">{formatTime(rec.firstIn)}</span>
                    </td>
                    <td className="p-3 font-medium text-rose-700">
                      <span dir="ltr">{formatTime(rec.lastOut)}</span>
                    </td>
                    <td className="p-3 text-gray-900 font-semibold">
                      {(rec.workMinutes / 60).toFixed(1)} {t("hr.attendance.hours")}
                    </td>
                    <td className="p-3">
                      {rec.lateMinutes > 0 ? (
                        <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded text-xs whitespace-nowrap">
                          {rec.lateMinutes} {t("hr.attendance.minutes")}
                        </span>
                      ) : (
                        <span className="text-emerald-600 text-xs font-medium whitespace-nowrap">{t("hr.attendance.onTime")}</span>
                      )}
                    </td>
                    <td className="p-3">{getStatusBadge(rec.status)}</td>
                    <td className="p-3 text-xs text-gray-500">
                      {rec.isManual ? (
                        <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded whitespace-nowrap">{t("hr.attendance.manualSource")}</span>
                      ) : (
                        <span className="text-gray-400 whitespace-nowrap">{t("hr.attendance.deviceSource")}</span>
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

      {/* Manual Attendance Modal */}
      {showModal && (
        <FormModal
          open={showModal}
          onClose={() => setShowModal(false)}
          title={t("hr.attendance.modalTitle")}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.attendance.labelEmployee")}</label>
              <select
                required
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t("hr.attendance.selectEmployee")}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} - {e.fullNameAr || e.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.attendance.labelDate")}</label>
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
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.attendance.labelInTime")}</label>
                <input
                  type="time"
                  value={formData.inTime}
                  onChange={(e) => setFormData({ ...formData, inTime: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.attendance.labelOutTime")}</label>
                <input
                  type="time"
                  value={formData.outTime}
                  onChange={(e) => setFormData({ ...formData, outTime: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.attendance.labelStatus")}</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="PRESENT">{t("hr.attendance.statusPresent")}</option>
                <option value="LATE">{t("hr.attendance.statusLate")}</option>
                <option value="ABSENT">{t("hr.attendance.statusAbsent")}</option>
                <option value="ON_LEAVE">{t("hr.attendance.statusOnLeave")}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.attendance.labelNotes")}</label>
              <textarea
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder={t("hr.attendance.notesPlaceholder")}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <SubmitButton loading={isPending} label={t("hr.attendance.saveRecord")} />
            </div>
          </form>
        </FormModal>
      )}
    </div>
  );
}
