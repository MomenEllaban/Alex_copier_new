"use client";

import { useEffect, useState, useTransition, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useI18n } from "@/i18n/context";
import PrinterLoader from "@/components/PrinterLoader";
import SearchInput from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import Pagination from "@/components/Pagination";
import FormModal from "@/components/FormModal";
import SubmitButton from "@/components/SubmitButton";
import ExportButton from "@/components/ExportButton";
import RefreshButton from "@/components/RefreshButton";
import StatsCards from "@/components/StatsCards";
import { useConfirm, useToast } from "@/components/UIProvider";
import { Plus, Eye, Pencil, Trash2, Users, UserCheck, Wallet, Briefcase } from "lucide-react";

interface JobTitle { id: string; title: string; titleAr?: string | null; }
interface Shift { id: string; name: string; startTime: string; endTime: string; }
interface Company { id: string; name: string; }

interface Employee {
  id: string;
  code: string;
  fingerprintId?: string | null;
  fullName: string;
  fullNameAr?: string | null;
  nationalId?: string | null;
  phone?: string | null;
  email?: string | null;
  hireDate: string;
  employmentType: string;
  status: string;
  baseSalary: number;
  jobTitleId?: string | null;
  shiftId?: string | null;
  companyId: string;
  notes?: string | null;
  JobTitle?: JobTitle | null;
  Shift?: Shift | null;
}

function EmployeesContent() {
  const { t, dir, locale } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState("");

  const [formData, setFormData] = useState({
    code: "",
    fingerprintId: "",
    fullName: "",
    fullNameAr: "",
    nationalId: "",
    phone: "",
    email: "",
    hireDate: new Date().toISOString().split("T")[0],
    employmentType: "FULL_TIME",
    status: "ACTIVE",
    baseSalary: "0",
    jobTitleId: "",
    shiftId: "",
    companyId: "",
    notes: "",
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [empRes, jtRes, compRes] = await Promise.all([
        fetch("/api/hr/employees"),
        fetch("/api/hr/job-titles"),
        fetch("/api/companies"),
      ]);

      if (empRes.ok) setEmployees(await empRes.json());
      if (jtRes.ok) setJobTitles(await jtRes.json());
      if (compRes.ok) setCompanies(await compRes.json());
    } catch (err) {
      console.error("Error loading employees:", err);
      toastError(t("hr.employees.toastLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle ?add=1 from query param
  useEffect(() => {
    if (searchParams.get("add") === "1") {
      openAddModal();
    }
  }, [searchParams]);

  const openAddModal = () => {
    setEditingEmployee(null);
    setFormError("");
    const nextCode = `EMP-${String(employees.length + 1).padStart(3, "0")}`;
    setFormData({
      code: nextCode,
      fingerprintId: String(employees.length + 1),
      fullName: "",
      fullNameAr: "",
      nationalId: "",
      phone: "",
      email: "",
      hireDate: new Date().toISOString().split("T")[0],
      employmentType: "FULL_TIME",
      status: "ACTIVE",
      baseSalary: "0",
      jobTitleId: jobTitles[0]?.id || "",
      shiftId: "",
      companyId: companies[0]?.id || "",
      notes: "",
    });
    setShowModal(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormError("");
    setFormData({
      code: emp.code,
      fingerprintId: emp.fingerprintId || "",
      fullName: emp.fullName,
      fullNameAr: emp.fullNameAr || "",
      nationalId: emp.nationalId || "",
      phone: emp.phone || "",
      email: emp.email || "",
      hireDate: emp.hireDate ? new Date(emp.hireDate).toISOString().split("T")[0] : "",
      employmentType: emp.employmentType || "FULL_TIME",
      status: emp.status || "ACTIVE",
      baseSalary: String(emp.baseSalary || 0),
      jobTitleId: emp.jobTitleId || "",
      shiftId: emp.shiftId || "",
      companyId: emp.companyId || "",
      notes: emp.notes || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formData.fullName || !formData.code || !formData.hireDate) {
      setFormError(t("hr.employees.validRequired"));
      return;
    }

    startTransition(async () => {
      try {
        const payload = {
          ...formData,
          baseSalary: parseFloat(formData.baseSalary) || 0,
        };

        const url = editingEmployee ? `/api/hr/employees/${editingEmployee.id}` : "/api/hr/employees";
        const method = editingEmployee ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || t("hr.employees.toastSaveError"));
        }

        toastSuccess(editingEmployee ? t("hr.employees.toastUpdated") : t("hr.employees.toastAdded"));
        setShowModal(false);
        fetchData();
      } catch (err: any) {
        setFormError(err.message || t("hr.employees.toastUnexpected"));
      }
    });
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmAction({
      title: t("hr.employees.deleteTitle"),
      message: t("hr.employees.deleteConfirm"),
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/hr/employees/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("hr.employees.toastDeleteFailed"));
      toastSuccess(t("hr.employees.toastDeleted"));
      fetchData();
    } catch (err: any) {
      toastError(err.message || t("hr.employees.toastDeleteError"));
    }
  };

  const filtered = employees.filter((emp) => {
    const matchesSearch =
      !search ||
      emp.fullName.toLowerCase().includes(search.toLowerCase()) ||
      emp.code.toLowerCase().includes(search.toLowerCase()) ||
      (emp.phone && emp.phone.includes(search)) ||
      (emp.fingerprintId && emp.fingerprintId.includes(search));
    const matchesStatus = !statusFilter || emp.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    const totalBaseSalary = employees.reduce((sum, e) => sum + (e.baseSalary || 0), 0);
    const jobTitlesCount = new Set(employees.filter((e) => e.jobTitleId).map((e) => e.jobTitleId)).size;
    return {
      total: employees.length,
      active: employees.filter((e) => e.status === "ACTIVE").length,
      totalBaseSalary,
      jobTitlesCount,
    };
  }, [employees]);

  if (loading) return <PrinterLoader label={t("hr.employees.loading")} />;

  return (
    <div dir={dir} className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-blue-600 shrink-0" size={28} />
            {t("hr.employees.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("hr.employees.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchData} refreshing={loading} />
          <ExportButton
            filename="employees_export"
            getExport={() => ({
              headers: [t("hr.employees.exportCode"), t("hr.employees.exportName"), t("hr.employees.exportFingerprint"), t("hr.employees.exportJobTitle"), t("hr.employees.exportBaseSalary"), t("hr.employees.exportStatus")],
              rows: filtered.map((e) => [
                e.code,
                e.fullNameAr || e.fullName,
                e.fingerprintId || "",
                e.JobTitle?.titleAr || e.JobTitle?.title || "",
                String(e.baseSalary || 0),
                e.status,
              ]),
            })}
          />
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
          >
            <Plus size={18} className="shrink-0" />
            {t("hr.employees.addButton")}
          </button>
        </div>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("hr.employees.statTotal"), value: stats.total.toLocaleString("en-US"), icon: <Users size={18} />, tone: "sky" },
          { label: t("hr.employees.statActive"), value: stats.active.toLocaleString("en-US"), icon: <UserCheck size={18} />, tone: "green" },
          { label: t("hr.employees.statBaseTotal"), value: `${stats.totalBaseSalary.toLocaleString("en-US")} ${t("hr.currency")}`, icon: <Wallet size={18} />, tone: "emerald" },
          { label: t("hr.employees.statTitles"), value: stats.jobTitlesCount.toLocaleString("en-US"), icon: <Briefcase size={18} />, tone: "purple" },
        ]}
      />

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder={t("hr.employees.searchPlaceholder")}
        />
        <FilterSelect
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          allLabel={t("hr.employees.allStatuses")}
          options={[
            { label: t("hr.employees.statusActive"), value: "ACTIVE" },
            { label: t("hr.employees.statusOnLeave"), value: "ON_LEAVE" },
            { label: t("hr.employees.statusSuspended"), value: "SUSPENDED" },
            { label: t("hr.employees.statusTerminated"), value: "TERMINATED" },
          ]}
        />
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
              <tr>
                <th className="p-3 font-semibold text-start">{t("hr.employees.thCodeFp")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.employees.thName")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.employees.thJobTitle")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.employees.thPhoneNid")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.employees.thBaseSalary")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.employees.thStatus")}</th>
                <th className="p-3 font-semibold text-center">{t("hr.employees.thActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    {t("hr.employees.noMatch")}
                  </td>
                </tr>
              ) : (
                paginated.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-gray-900"><span dir="ltr">{emp.code}</span></div>
                      {emp.fingerprintId && (
                        <div className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded inline-block mt-0.5 whitespace-nowrap">
                          {t("hr.employees.fingerprintBadgePrefix")}<span dir="ltr">{emp.fingerprintId}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{emp.fullName}</div>
                      {emp.fullNameAr && <div className="text-xs text-gray-500">{emp.fullNameAr}</div>}
                    </td>
                    <td className="p-3">
                      <div className="text-gray-900 font-medium">{emp.JobTitle?.titleAr || emp.JobTitle?.title || t("hr.employees.noTitle")}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-gray-900"><span dir="ltr">{emp.phone || "-"}</span></div>
                      <div className="text-xs text-gray-400"><span dir="ltr">{emp.nationalId || "-"}</span></div>
                    </td>
                    <td className="p-3 font-semibold text-emerald-700">
                      {(emp.baseSalary || 0).toLocaleString("en-US")} {t("hr.currency")}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                          emp.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : emp.status === "ON_LEAVE"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {emp.status === "ACTIVE"
                          ? t("hr.employees.badgeActive")
                          : emp.status === "ON_LEAVE"
                          ? t("hr.employees.badgeOnLeave")
                          : emp.status === "SUSPENDED"
                          ? t("hr.employees.badgeSuspended")
                          : t("hr.employees.badgeTerminated")}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setSelectedEmployee(emp)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title={t("hr.employees.actionView")}
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() => openEditModal(emp)}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title={t("hr.employees.actionEdit")}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(emp.id)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title={t("hr.employees.actionDelete")}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100">
            <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
          </div>
        )}
      </div>

      {/* Modal Add / Edit Employee */}
      {showModal && (
        <FormModal
          open={showModal}
          onClose={() => setShowModal(false)}
          title={editingEmployee ? t("hr.employees.editTitle") : t("hr.employees.addTitle")}
          xl
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelCode")}</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelFingerprint")}</label>
                <input
                  type="text"
                  value={formData.fingerprintId}
                  onChange={(e) => setFormData({ ...formData, fingerprintId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder={t("hr.employees.fingerprintPlaceholder")}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelCompany")}</label>
                <select
                  value={formData.companyId}
                  onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t("hr.employees.selectCompany")}</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelFullName")}</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelFullNameAr")}</label>
                <input
                  type="text"
                  value={formData.fullNameAr}
                  onChange={(e) => setFormData({ ...formData, fullNameAr: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelNationalId")}</label>
                <input
                  type="text"
                  value={formData.nationalId}
                  onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelPhone")}</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelEmail")}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelHireDate")}</label>
                <input
                  type="date"
                  required
                  value={formData.hireDate}
                  onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelJobTitle")}</label>
                <select
                  value={formData.jobTitleId}
                  onChange={(e) => setFormData({ ...formData, jobTitleId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t("hr.employees.noTitle")}</option>
                  {jobTitles.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.titleAr || j.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelBaseSalary")}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={formData.baseSalary}
                  onChange={(e) => setFormData({ ...formData, baseSalary: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-emerald-700 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelEmploymentType")}</label>
                <select
                  value={formData.employmentType}
                  onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="FULL_TIME">{t("hr.employees.empFullTime")}</option>
                  <option value="PART_TIME">{t("hr.employees.empPartTime")}</option>
                  <option value="CONTRACT">{t("hr.employees.empContract")}</option>
                  <option value="TRAINEE">{t("hr.employees.empTrainee")}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelWorkStatus")}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ACTIVE">{t("hr.employees.statusActiveForm")}</option>
                  <option value="ON_LEAVE">{t("hr.employees.statusOnLeaveForm")}</option>
                  <option value="SUSPENDED">{t("hr.employees.statusSuspendedForm")}</option>
                  <option value="TERMINATED">{t("hr.employees.statusTerminatedForm")}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.employees.labelNotes")}</label>
              <textarea
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
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
              <SubmitButton loading={isPending} label={editingEmployee ? t("hr.employees.saveUpdate") : t("hr.employees.saveAdd")} />
            </div>
          </form>
        </FormModal>
      )}

      {/* Modal View Employee Details */}
      {selectedEmployee && (
        <FormModal
          open={!!selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
          title={`${t("hr.employees.detailTitlePrefix")}${selectedEmployee.fullName}`}
          wide
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div>
                <span className="text-xs text-gray-500 block">{t("hr.employees.detailCode")}</span>
                <span className="font-bold text-gray-900"><span dir="ltr">{selectedEmployee.code}</span></span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">{t("hr.employees.detailFingerprint")}</span>
                <span className="font-bold text-blue-600"><span dir="ltr">{selectedEmployee.fingerprintId || t("hr.employees.detailUnknown")}</span></span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">{t("hr.employees.detailJobTitle")}</span>
                <span className="font-bold text-gray-900">{selectedEmployee.JobTitle?.titleAr || selectedEmployee.JobTitle?.title || "-"}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">{t("hr.employees.detailHireDate")}</span>
                <span className="font-bold text-gray-900">{new Date(selectedEmployee.hireDate).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB")}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">{t("hr.employees.detailBaseSalary")}</span>
                <span className="font-bold text-emerald-700">{selectedEmployee.baseSalary.toLocaleString("en-US")} {t("hr.currency")}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-gray-900 text-xs">{t("hr.employees.detailContact")}</h4>
              <p className="text-gray-700"><strong>{t("hr.employees.detailPhone")}</strong> <span dir="ltr">{selectedEmployee.phone || t("hr.employees.detailNotRegistered")}</span></p>
              <p className="text-gray-700"><strong>{t("hr.employees.detailEmail")}</strong> <span dir="ltr">{selectedEmployee.email || t("hr.employees.detailNotRegistered")}</span></p>
              <p className="text-gray-700"><strong>{t("hr.employees.detailNationalId")}</strong> <span dir="ltr">{selectedEmployee.nationalId || t("hr.employees.detailNotRegistered")}</span></p>
            </div>

            {selectedEmployee.notes && (
              <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-900 border border-amber-200">
                <strong>{t("hr.employees.detailNotes")}</strong> {selectedEmployee.notes}
              </div>
            )}
          </div>
        </FormModal>
      )}
    </div>
  );
}

export default function EmployeesPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<PrinterLoader label={t("hr.employees.loading")} />}>
      <EmployeesContent />
    </Suspense>
  );
}
