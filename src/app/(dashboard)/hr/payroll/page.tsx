"use client";

import { useEffect, useState, useTransition } from "react";
import { useI18n } from "@/i18n/context";
import PrinterLoader from "@/components/PrinterLoader";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import ExportButton from "@/components/ExportButton";
import RefreshButton from "@/components/RefreshButton";
import StatsCards from "@/components/StatsCards";
import { useConfirm, useToast } from "@/components/UIProvider";
import { Banknote, Calculator, Lock, Eye, Users, Wallet } from "lucide-react";

interface Period {
  id: string;
  month: number;
  year: number;
}

interface PayrollRun {
  id: string;
  periodId: string;
  companyId: string;
  status: "CALCULATED" | "APPROVED" | "LOCKED";
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount: number;
  calculatedAt: string;
  approvedAt?: string | null;
  lockedAt?: string | null;
  Period: Period;
  _count?: { Items: number };
}

interface PayrollItem {
  id: string;
  employeeId: string;
  basicSalary: number;
  totalEarnings: number;
  totalDeductions: number;
  grossSalary: number;
  netSalary: number;
  workedDays: number;
  absentDays: number;
  lateDays: number;
  overtimeHours: number;
  flag: string;
  notes?: string | null;
  Employee?: { code: string; fullName: string; fullNameAr?: string | null };
}

export default function PayrollPage() {
  const { t } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRunItems, setSelectedRunItems] = useState<PayrollItem[] | null>(null);
  const [selectedRunDetails, setSelectedRunDetails] = useState<PayrollRun | null>(null);

  const [showCalcModal, setShowCalcModal] = useState(false);
  const [calcMonth, setCalcMonth] = useState<number>(new Date().getMonth() + 1);
  const [calcYear, setCalcYear] = useState<number>(new Date().getFullYear());
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState("");

  const fetchRuns = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/hr/payroll");
      if (res.ok) setRuns(await res.json());
    } catch (err) {
      console.error("Error fetching payroll runs:", err);
      toastError("فشل تحميل مسيرات الرواتب");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleCalculatePayroll = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/hr/payroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "calculate",
            month: Number(calcMonth),
            year: Number(calcYear),
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "فشل احتساب مسير الرواتب");

        toastSuccess("تم احتساب الرواتب للشهر المحدد بنجاح");
        setShowCalcModal(false);
        fetchRuns();
      } catch (err: any) {
        setFormError(err.message || "حدث خطأ في الاحتساب");
      }
    });
  };

  const handleApproveRun = async (runId: string) => {
    const ok = await confirmAction({
      title: "اعتماد كشف الرواتب",
      message: "هل أنت متأكد من اعتماد هذا المسير المالي وتثبيته للاعتماد النهائي؟",
    });
    if (!ok) return;

    try {
      const res = await fetch("/api/hr/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", runId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "فشل اعتماد المسير");
      }

      toastSuccess("تم اعتماد مسير الرواتب بنجاح");
      fetchRuns();
    } catch (err: any) {
      toastError(err.message || "خطأ في الاعتماد");
    }
  };

  const handleLockRun = async (runId: string) => {
    const ok = await confirmAction({
      title: "قفل وصرف الرواتب",
      message: "هل تريد قفل الكشف وإغلاقه نهائياً وتأكيد الخصومات والسلف؟",
    });
    if (!ok) return;

    try {
      const res = await fetch("/api/hr/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lock", runId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "فشل قفل الكشف");
      }

      toastSuccess("تم قفل وصرف مسير الرواتب وإغلاق السلف المقترنة");
      fetchRuns();
    } catch (err: any) {
      toastError(err.message || "خطأ في قفل الكشف");
    }
  };

  const handleViewDetails = async (run: PayrollRun) => {
    setSelectedRunDetails(run);
    try {
      const res = await fetch(`/api/hr/payroll/${run.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedRunItems(data.Items || []);
      } else {
        setSelectedRunItems([]);
      }
    } catch (err) {
      toastError("فشل تحميل تفاصيل مفردات الرواتب");
    }
  };

  if (loading) return <PrinterLoader label="جاري تحميل كشوف ومسيرات الرواتب..." />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Banknote className="text-blue-600" size={28} />
            مسيرات وكشوف الرواتب
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            احتساب الرواتب الشهرية تلقائيًا بناءً على البصمة والإجازات والخصومات والسلف.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchRuns} refreshing={loading} />
          <button
            onClick={() => setShowCalcModal(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
          >
            <Calculator size={18} />
            احتساب مسير رواتب جديد
          </button>
        </div>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: "مسيرات الرواتب", value: runs.length.toLocaleString("ar-EG"), icon: <Banknote size={18} />, tone: "sky" },
          { label: "الموظفون المشمولون", value: runs.reduce((sum, r) => sum + (r.employeeCount || 0), 0).toLocaleString("ar-EG"), icon: <Users size={18} />, tone: "green" },
          { label: "إجمالي الرواتب (Gross)", value: `${runs.reduce((sum, r) => sum + (r.totalGross || 0), 0).toLocaleString("ar-EG")} ج.م`, icon: <Calculator size={18} />, tone: "amber" },
          { label: "صافي الرواتب (Net)", value: `${runs.reduce((sum, r) => sum + (r.totalNet || 0), 0).toLocaleString("ar-EG")} ج.م`, icon: <Wallet size={18} />, tone: "emerald" },
        ]}
      />

      {/* Payroll Runs List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
              <tr>
                <th className="p-3 font-semibold text-start">الشهر / السنة</th>
                <th className="p-3 font-semibold text-start">عدد الموظفين</th>
                <th className="p-3 font-semibold text-start">إجمالي الرواتب (Gross)</th>
                <th className="p-3 font-semibold text-start">إجمالي الخصومات</th>
                <th className="p-3 font-semibold text-start">صافي الرواتب (Net)</th>
                <th className="p-3 font-semibold text-start">الحالة</th>
                <th className="p-3 font-semibold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    لم يتم احتساب أي مسيرات رواتب بعد. اضغط "احتساب مسير رواتب جديد" للبدء.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3 font-bold text-gray-900">
                      شهر {r.Period?.month} / {r.Period?.year}
                    </td>
                    <td className="p-3 font-medium text-gray-700">
                      {r.employeeCount} موظف
                    </td>
                    <td className="p-3 text-gray-900 font-semibold">
                      {r.totalGross.toLocaleString()} ج.م
                    </td>
                    <td className="p-3 text-rose-600 font-semibold">
                      {r.totalDeductions.toLocaleString()} ج.م
                    </td>
                    <td className="p-3 text-emerald-700 font-extrabold text-base">
                      {r.totalNet.toLocaleString()} ج.م
                    </td>
                    <td className="p-3">
                      {r.status === "CALCULATED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                          محسوب (Draft)
                        </span>
                      )}
                      {r.status === "APPROVED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                          معتمد (Approved)
                        </span>
                      )}
                      {r.status === "LOCKED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          مغلق ومصروف (Locked)
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleViewDetails(r)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="عرض تفاصيل المفردات"
                        >
                          <Eye size={18} />
                        </button>
                        {r.status === "CALCULATED" && (
                          <button
                            onClick={() => handleApproveRun(r.id)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1 rounded-md font-bold transition-colors"
                          >
                            اعتماد
                          </button>
                        )}
                        {r.status === "APPROVED" && (
                          <button
                            onClick={() => handleLockRun(r.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1 rounded-md font-bold transition-colors flex items-center gap-1"
                          >
                            <Lock size={12} /> قفل وصرف
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Calculate Modal */}
      {showCalcModal && (
        <FormModal
          open={showCalcModal}
          onClose={() => setShowCalcModal(false)}
          title="احتساب مسير رواتب جديد"
        >
          <form onSubmit={handleCalculatePayroll} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">الشهر *</label>
                <select
                  value={calcMonth}
                  onChange={(e) => setCalcMonth(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                    <option key={m} value={m}>
                      شهر {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">السنة *</label>
                <input
                  type="number"
                  min="2020"
                  max="2035"
                  value={calcYear}
                  onChange={(e) => setCalcYear(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 leading-relaxed">
              سيقوم المحرك تلقائيًا بحساب أيام الحضور والغياب والتأخيرات والسلف المستحقة وتجميع الإجمالي والصافي لكل الموظفين النشطين بالشركة.
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowCalcModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <SubmitButton loading={isPending} label="بدء الاحتساب" />
            </div>
          </form>
        </FormModal>
      )}

      {/* Details / Slip Modal */}
      {selectedRunDetails && selectedRunItems && (
        <FormModal
          open={!!selectedRunDetails}
          onClose={() => { setSelectedRunDetails(null); setSelectedRunItems(null); }}
          title={`مفردات رواتب: شهر ${selectedRunDetails.Period?.month} / ${selectedRunDetails.Period?.year}`}
          xl
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
              <span className="text-xs text-gray-600">إجمالي الموظفين: <strong>{selectedRunItems.length}</strong></span>
              <span className="text-xs text-emerald-800 font-bold">إجمالي الصافي: {selectedRunDetails.totalNet.toLocaleString()} ج.م</span>
              <ExportButton
                filename={`payroll_slip_${selectedRunDetails.Period?.month}_${selectedRunDetails.Period?.year}`}
                getExport={() => ({
                  headers: ["كود الموظف", "الاسم", "الأساسي", "أيام العمل", "الغياب", "التأخير", "الإيراد", "الخصم", "الصافي"],
                  rows: selectedRunItems.map((i) => [
                    i.Employee?.code || "",
                    i.Employee?.fullNameAr || i.Employee?.fullName || "",
                    String(i.basicSalary),
                    String(i.workedDays),
                    String(i.absentDays),
                    String(i.lateDays),
                    String(i.totalEarnings),
                    String(i.totalDeductions),
                    String(i.netSalary),
                  ]),
                })}
              />
            </div>

            <div className="overflow-x-auto max-h-[60vh]">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="bg-gray-100 text-gray-800 sticky top-0">
                  <tr>
                    <th className="p-2 text-start">الموظف</th>
                    <th className="p-2 text-start">الأساسي</th>
                    <th className="p-2 text-start">أيام العمل</th>
                    <th className="p-2 text-start">أيام الغياب</th>
                    <th className="p-2 text-start">التأخير (أيام)</th>
                    <th className="p-2 text-start">إجمالي الإيراد</th>
                    <th className="p-2 text-start">إجمالي الخصم</th>
                    <th className="p-2 text-start">الصافي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedRunItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="p-2 font-bold text-gray-900">
                        {item.Employee?.fullNameAr || item.Employee?.fullName} ({item.Employee?.code})
                      </td>
                      <td className="p-2">{item.basicSalary.toLocaleString()} ج.م</td>
                      <td className="p-2 text-emerald-700 font-semibold">{item.workedDays} يوم</td>
                      <td className="p-2 text-rose-600 font-semibold">{item.absentDays} يوم</td>
                      <td className="p-2 text-amber-700">{item.lateDays} يوم</td>
                      <td className="p-2 font-semibold">{item.totalEarnings.toLocaleString()} ج.م</td>
                      <td className="p-2 text-rose-600 font-semibold">{item.totalDeductions.toLocaleString()} ج.م</td>
                      <td className="p-2 text-emerald-700 font-extrabold text-sm">{item.netSalary.toLocaleString()} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </FormModal>
      )}
    </div>
  );
}
