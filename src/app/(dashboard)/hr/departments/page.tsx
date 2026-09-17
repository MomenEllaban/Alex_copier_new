"use client";

import { useEffect, useState, useTransition } from "react";
import { useI18n } from "@/i18n/context";
import PrinterLoader from "@/components/PrinterLoader";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import RefreshButton from "@/components/RefreshButton";
import StatsCards from "@/components/StatsCards";
import { useToast } from "@/components/UIProvider";
import { Building2, Plus, Briefcase, Users } from "lucide-react";

interface Department {
  id: string;
  code: string;
  name: string;
  nameAr?: string | null;
  _count?: { Employees: number };
}

interface JobTitle {
  id: string;
  code: string;
  title: string;
  titleAr?: string | null;
  Department?: { name: string; nameAr?: string | null } | null;
}

export default function DepartmentsPage() {
  const { t } = useI18n();
  const { success: toastSuccess, error: toastError } = useToast();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [loading, setLoading] = useState(true);

  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showJobModal, setShowJobModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState("");

  const [deptForm, setDeptForm] = useState({ code: "", name: "", nameAr: "" });
  const [jobForm, setJobForm] = useState({ code: "", title: "", titleAr: "", departmentId: "" });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [dRes, jRes] = await Promise.all([
        fetch("/api/hr/departments"),
        fetch("/api/hr/job-titles"),
      ]);

      if (dRes.ok) setDepartments(await dRes.json());
      if (jRes.ok) setJobTitles(await jRes.json());
    } catch (err) {
      console.error("Error loading departments & job titles:", err);
      toastError("فشل تحميل بيانات الأقسام والمسميات الوظيفية");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateDept = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!deptForm.code || !deptForm.name) {
      setFormError("كود واسم القسم مطلوبان");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/hr/departments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(deptForm),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "فشل إضافة القسم");

        toastSuccess("تم إضافة القسم بنجاح");
        setShowDeptModal(false);
        setDeptForm({ code: "", name: "", nameAr: "" });
        fetchData();
      } catch (err: any) {
        setFormError(err.message || "حدث خطأ في الإضافة");
      }
    });
  };

  const handleCreateJob = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!jobForm.code || !jobForm.title) {
      setFormError("كود والمسمى الوظيفي مطلوبان");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/hr/job-titles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(jobForm),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "فشل إضافة المسمى الوظيفي");

        toastSuccess("تم إضافة المسمى الوظيفي بنجاح");
        setShowJobModal(false);
        setJobForm({ code: "", title: "", titleAr: "", departmentId: "" });
        fetchData();
      } catch (err: any) {
        setFormError(err.message || "حدث خطأ في الإضافة");
      }
    });
  };

  if (loading) return <PrinterLoader label="جاري تحميل الأقسام والمسميات الوظيفية..." />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="text-blue-600" size={28} />
            الأقسام والمسميات الوظيفية
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            الهيكل التنظيمي للشركة وإدارة مسميات الوظائف والأقسام.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchData} refreshing={loading} />
          <button
            onClick={() => { setFormError(""); setShowDeptModal(true); }}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
          >
            <Plus size={18} />
            إضافة قسم
          </button>
          <button
            onClick={() => { setFormError(""); setShowJobModal(true); }}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
          >
            <Plus size={18} />
            إضافة مسمى وظيفي
          </button>
        </div>
      </div>

      <StatsCards
        columns={3}
        stats={[
          { label: "الأقسام", value: departments.length.toLocaleString("ar-EG"), icon: <Building2 size={18} />, tone: "sky" },
          { label: "المسميات الوظيفية", value: jobTitles.length.toLocaleString("ar-EG"), icon: <Briefcase size={18} />, tone: "green" },
          { label: "الموظفون", value: departments.reduce((sum, d) => sum + (d._count?.Employees || 0), 0).toLocaleString("ar-EG"), icon: <Users size={18} />, tone: "purple" },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Departments List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
            <Building2 className="text-blue-600" size={20} />
            أقسام الشركة
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="p-2.5 font-semibold">كود القسم</th>
                  <th className="p-2.5 font-semibold">اسم القسم (عربي/إنجليزي)</th>
                  <th className="p-2.5 font-semibold">عدد الموظفين</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {departments.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-gray-500">
                      لا توجد أقسام مسجلة. اضغط "إضافة قسم" للبدء.
                    </td>
                  </tr>
                ) : (
                  departments.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="p-2.5 font-bold text-gray-900">{d.code}</td>
                      <td className="p-2.5">
                        <div className="font-semibold text-gray-900">{d.nameAr || d.name}</div>
                        {d.nameAr && <div className="text-xs text-gray-500">{d.name}</div>}
                      </td>
                      <td className="p-2.5">
                        <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded text-xs">
                          {d._count?.Employees || 0} موظف
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Job Titles List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
            <Briefcase className="text-emerald-600" size={20} />
            المسميات الوظيفية
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="p-2.5 font-semibold">الكود</th>
                  <th className="p-2.5 font-semibold">المسمى الوظيفي</th>
                  <th className="p-2.5 font-semibold">القسم التابع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobTitles.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-gray-500">
                      لا توجد مسميات وظيفية مسجلة.
                    </td>
                  </tr>
                ) : (
                  jobTitles.map((j) => (
                    <tr key={j.id} className="hover:bg-gray-50">
                      <td className="p-2.5 font-bold text-gray-900">{j.code}</td>
                      <td className="p-2.5">
                        <div className="font-semibold text-gray-900">{j.titleAr || j.title}</div>
                        {j.titleAr && <div className="text-xs text-gray-500">{j.title}</div>}
                      </td>
                      <td className="p-2.5 text-gray-600">
                        {j.Department?.nameAr || j.Department?.name || "عام"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Department Modal */}
      {showDeptModal && (
        <FormModal
          open={showDeptModal}
          onClose={() => setShowDeptModal(false)}
          title="إضافة قسم جديد"
        >
          <form onSubmit={handleCreateDept} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">كود القسم *</label>
              <input
                type="text"
                required
                value={deptForm.code}
                onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="مثال: HR, IT, ENG, MKT"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">اسم القسم (بالإنجليزي/العام) *</label>
              <input
                type="text"
                required
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="Human Resources"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">اسم القسم (بالعربي)</label>
              <input
                type="text"
                value={deptForm.nameAr}
                onChange={(e) => setDeptForm({ ...deptForm, nameAr: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="الموارد البشرية"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowDeptModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <SubmitButton loading={isPending} label="حفظ القسم" />
            </div>
          </form>
        </FormModal>
      )}

      {/* Add Job Title Modal */}
      {showJobModal && (
        <FormModal
          open={showJobModal}
          onClose={() => setShowJobModal(false)}
          title="إضافة مسمى وظيفي جديد"
        >
          <form onSubmit={handleCreateJob} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">كود المسمى الوظيفي *</label>
              <input
                type="text"
                required
                value={jobForm.code}
                onChange={(e) => setJobForm({ ...jobForm, code: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="مثال: MGR, ENG, ACC"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">المسمى الوظيفي (إنجليزي) *</label>
              <input
                type="text"
                required
                value={jobForm.title}
                onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="Senior Maintenance Engineer"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">المسمى الوظيفي (عربي)</label>
              <input
                type="text"
                value={jobForm.titleAr}
                onChange={(e) => setJobForm({ ...jobForm, titleAr: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="مهندس صيانة أول"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">القسم التابع له</label>
              <select
                value={jobForm.departmentId}
                onChange={(e) => setJobForm({ ...jobForm, departmentId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">بدون قسم (عام)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nameAr || d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowJobModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <SubmitButton loading={isPending} label="حفظ المسمى" className="bg-emerald-600 hover:bg-emerald-700 text-white" />
            </div>
          </form>
        </FormModal>
      )}
    </div>
  );
}
