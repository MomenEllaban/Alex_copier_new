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
  const { t, dir } = useI18n();
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
      toastError(t("hr.departments.toastLoadFailed"));
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
      setFormError(t("hr.departments.deptValid"));
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
        if (!res.ok) throw new Error(data.error || t("hr.departments.toastDeptAddFailed"));

        toastSuccess(t("hr.departments.toastDeptAdded"));
        setShowDeptModal(false);
        setDeptForm({ code: "", name: "", nameAr: "" });
        fetchData();
      } catch (err: any) {
        setFormError(err.message || t("hr.departments.toastAddError"));
      }
    });
  };

  const handleCreateJob = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!jobForm.code || !jobForm.title) {
      setFormError(t("hr.departments.jobValid"));
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
        if (!res.ok) throw new Error(data.error || t("hr.departments.toastJobAddFailed"));

        toastSuccess(t("hr.departments.toastJobAdded"));
        setShowJobModal(false);
        setJobForm({ code: "", title: "", titleAr: "", departmentId: "" });
        fetchData();
      } catch (err: any) {
        setFormError(err.message || t("hr.departments.toastAddError"));
      }
    });
  };

  if (loading) return <PrinterLoader label={t("hr.departments.loading")} />;

  return (
    <div dir={dir} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="text-blue-600 shrink-0" size={28} />
            {t("hr.departments.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("hr.departments.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchData} refreshing={loading} />
          <button
            onClick={() => { setFormError(""); setShowDeptModal(true); }}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
          >
            <Plus size={18} className="shrink-0" />
            {t("hr.departments.addDept")}
          </button>
          <button
            onClick={() => { setFormError(""); setShowJobModal(true); }}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
          >
            <Plus size={18} className="shrink-0" />
            {t("hr.departments.addJobTitle")}
          </button>
        </div>
      </div>

      <StatsCards
        columns={3}
        stats={[
          { label: t("hr.departments.statDepartments"), value: departments.length.toLocaleString("en-US"), icon: <Building2 size={18} />, tone: "sky" },
          { label: t("hr.departments.statJobTitles"), value: jobTitles.length.toLocaleString("en-US"), icon: <Briefcase size={18} />, tone: "green" },
          { label: t("hr.departments.statEmployees"), value: departments.reduce((sum, d) => sum + (d._count?.Employees || 0), 0).toLocaleString("en-US"), icon: <Users size={18} />, tone: "purple" },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Departments List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
            <Building2 className="text-blue-600 shrink-0" size={20} />
            {t("hr.departments.deptSection")}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="p-2.5 font-semibold text-start">{t("hr.departments.deptCodeTh")}</th>
                  <th className="p-2.5 font-semibold text-start">{t("hr.departments.deptNameTh")}</th>
                  <th className="p-2.5 font-semibold text-start">{t("hr.departments.deptCountTh")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {departments.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-gray-500">
                      {t("hr.departments.noDepts")}
                    </td>
                  </tr>
                ) : (
                  departments.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="p-2.5 font-bold text-gray-900"><span dir="ltr">{d.code}</span></td>
                      <td className="p-2.5">
                        <div className="font-semibold text-gray-900">{d.nameAr || d.name}</div>
                        {d.nameAr && <div className="text-xs text-gray-500">{d.name}</div>}
                      </td>
                      <td className="p-2.5">
                        <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded text-xs whitespace-nowrap">
                          {d._count?.Employees || 0} {t("hr.departments.empWord")}
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
            <Briefcase className="text-emerald-600 shrink-0" size={20} />
            {t("hr.departments.jobSection")}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="p-2.5 font-semibold text-start">{t("hr.departments.jobCodeTh")}</th>
                  <th className="p-2.5 font-semibold text-start">{t("hr.departments.jobTitleTh")}</th>
                  <th className="p-2.5 font-semibold text-start">{t("hr.departments.jobDeptTh")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobTitles.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-gray-500">
                      {t("hr.departments.noJobs")}
                    </td>
                  </tr>
                ) : (
                  jobTitles.map((j) => (
                    <tr key={j.id} className="hover:bg-gray-50">
                      <td className="p-2.5 font-bold text-gray-900"><span dir="ltr">{j.code}</span></td>
                      <td className="p-2.5">
                        <div className="font-semibold text-gray-900">{j.titleAr || j.title}</div>
                        {j.titleAr && <div className="text-xs text-gray-500">{j.title}</div>}
                      </td>
                      <td className="p-2.5 text-gray-600">
                        {j.Department?.nameAr || j.Department?.name || t("hr.departments.general")}
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
          title={t("hr.departments.deptModalTitle")}
        >
          <form onSubmit={handleCreateDept} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.departments.deptCodeLabel")}</label>
              <input
                type="text"
                required
                value={deptForm.code}
                onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder={t("hr.departments.deptCodePlaceholder")}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.departments.deptNameLabel")}</label>
              <input
                type="text"
                required
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder={t("hr.departments.deptNamePlaceholder")}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.departments.deptNameArLabel")}</label>
              <input
                type="text"
                value={deptForm.nameAr}
                onChange={(e) => setDeptForm({ ...deptForm, nameAr: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder={t("hr.departments.deptNameArPlaceholder")}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowDeptModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <SubmitButton loading={isPending} label={t("hr.departments.saveDept")} />
            </div>
          </form>
        </FormModal>
      )}

      {/* Add Job Title Modal */}
      {showJobModal && (
        <FormModal
          open={showJobModal}
          onClose={() => setShowJobModal(false)}
          title={t("hr.departments.jobModalTitle")}
        >
          <form onSubmit={handleCreateJob} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.departments.jobCodeLabel")}</label>
              <input
                type="text"
                required
                value={jobForm.code}
                onChange={(e) => setJobForm({ ...jobForm, code: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder={t("hr.departments.jobCodePlaceholder")}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.departments.jobTitleLabel")}</label>
              <input
                type="text"
                required
                value={jobForm.title}
                onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder={t("hr.departments.jobTitlePlaceholder")}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.departments.jobTitleArLabel")}</label>
              <input
                type="text"
                value={jobForm.titleAr}
                onChange={(e) => setJobForm({ ...jobForm, titleAr: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder={t("hr.departments.jobTitleArPlaceholder")}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.departments.jobDeptLabel")}</label>
              <select
                value={jobForm.departmentId}
                onChange={(e) => setJobForm({ ...jobForm, departmentId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">{t("hr.departments.noDept")}</option>
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
                {t("common.cancel")}
              </button>
              <SubmitButton loading={isPending} label={t("hr.departments.saveJob")} className="bg-emerald-600 hover:bg-emerald-700 text-white" />
            </div>
          </form>
        </FormModal>
      )}
    </div>
  );
}
