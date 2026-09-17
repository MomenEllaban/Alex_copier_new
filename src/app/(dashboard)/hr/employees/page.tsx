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
import { Plus, Eye, Pencil, Trash2, Users, UserCheck, Wallet, Building2 } from "lucide-react";

interface Department { id: string; name: string; nameAr?: string | null; }
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
  departmentId?: string | null;
  jobTitleId?: string | null;
  shiftId?: string | null;
  companyId: string;
  notes?: string | null;
  Department?: Department | null;
  JobTitle?: JobTitle | null;
  Shift?: Shift | null;
}

function EmployeesContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

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
    departmentId: "",
    jobTitleId: "",
    shiftId: "",
    companyId: "",
    notes: "",
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [empRes, deptRes, jtRes, compRes] = await Promise.all([
        fetch("/api/hr/employees"),
        fetch("/api/hr/departments"),
        fetch("/api/hr/job-titles"),
        fetch("/api/companies"),
      ]);

      if (empRes.ok) setEmployees(await empRes.json());
      if (deptRes.ok) setDepartments(await deptRes.json());
      if (jtRes.ok) setJobTitles(await jtRes.json());
      if (compRes.ok) setCompanies(await compRes.json());
    } catch (err) {
      console.error("Error loading employees:", err);
      toastError("فشل تحميل بيانات الموظفين");
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
      departmentId: departments[0]?.id || "",
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
      departmentId: emp.departmentId || "",
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
      setFormError("الرجاء ملء الأكواد والاسم وتاريخ التعيين بشكل صحيح");
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
          throw new Error(data.error || "حدث خطأ أثناء حفظ الموظف");
        }

        toastSuccess(editingEmployee ? "تم تعديل بيانات الموظف بنجاح" : "تم إضافة الموظف بنجاح");
        setShowModal(false);
        fetchData();
      } catch (err: any) {
        setFormError(err.message || "خطأ غير متوقع");
      }
    });
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmAction({
      title: "حذف الموظف",
      message: "هل أنت تأكد من رغبتك في حذف هذا الموظف؟ لن يمكنك التراجع.",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/hr/employees/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("فشل حذف الموظف");
      toastSuccess("تم حذف الموظف بنجاح");
      fetchData();
    } catch (err: any) {
      toastError(err.message || "حدث خطأ في الحذف");
    }
  };

  const filtered = employees.filter((emp) => {
    const matchesSearch =
      !search ||
      emp.fullName.toLowerCase().includes(search.toLowerCase()) ||
      emp.code.toLowerCase().includes(search.toLowerCase()) ||
      (emp.phone && emp.phone.includes(search)) ||
      (emp.fingerprintId && emp.fingerprintId.includes(search));
    const matchesDept = !departmentFilter || emp.departmentId === departmentFilter;
    const matchesStatus = !statusFilter || emp.status === statusFilter;
    return matchesSearch && matchesDept && matchesStatus;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    const totalBaseSalary = employees.reduce((sum, e) => sum + (e.baseSalary || 0), 0);
    const departmentsCount = new Set(employees.filter((e) => e.departmentId).map((e) => e.departmentId)).size;
    return {
      total: employees.length,
      active: employees.filter((e) => e.status === "ACTIVE").length,
      totalBaseSalary,
      departmentsCount,
    };
  }, [employees]);

  if (loading) return <PrinterLoader label="جاري تحميل قائمة الموظفين..." />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-blue-600" size={28} />
            إدارة الموظفين
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            عرض وتحديث وإضافة الموظفين ورقم البصمة والرواتب الأساسية.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchData} refreshing={loading} />
          <ExportButton
            filename="employees_export"
            getExport={() => ({
              headers: ["كود الموظف", "الاسم", "رقم البصمة", "القسم", "الراتب الأساسي", "الحالة"],
              rows: filtered.map((e) => [
                e.code,
                e.fullNameAr || e.fullName,
                e.fingerprintId || "",
                e.Department?.nameAr || e.Department?.name || "",
                String(e.baseSalary || 0),
                e.status,
              ]),
            })}
          />
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
          >
            <Plus size={18} />
            إضافة موظف
          </button>
        </div>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: "إجمالي الموظفين", value: stats.total.toLocaleString("ar-EG"), icon: <Users size={18} />, tone: "sky" },
          { label: "موظفون نشطون", value: stats.active.toLocaleString("ar-EG"), icon: <UserCheck size={18} />, tone: "green" },
          { label: "إجمالي الرواتب الأساسية", value: `${stats.totalBaseSalary.toLocaleString("ar-EG")} ج.م`, icon: <Wallet size={18} />, tone: "emerald" },
          { label: "الأقسام", value: stats.departmentsCount.toLocaleString("ar-EG"), icon: <Building2 size={18} />, tone: "purple" },
        ]}
      />

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="بحث باسم الموظف، الكود، أو رقم البصمة..."
        />
        <FilterSelect
          value={departmentFilter}
          onChange={(v) => { setDepartmentFilter(v); setPage(1); }}
          allLabel="جميع الأقسام"
          options={departments.map((d) => ({ label: d.nameAr || d.name, value: d.id }))}
        />
        <FilterSelect
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          allLabel="جميع الحالات"
          options={[
            { label: "نشط (Active)", value: "ACTIVE" },
            { label: "في إجازة (On Leave)", value: "ON_LEAVE" },
            { label: "موقوف (Suspended)", value: "SUSPENDED" },
            { label: "مستقيل / منهى (Terminated)", value: "TERMINATED" },
          ]}
        />
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
              <tr>
                <th className="p-3 font-semibold text-start">الكود / البصمة</th>
                <th className="p-3 font-semibold text-start">اسم الموظف</th>
                <th className="p-3 font-semibold text-start">القسم والوظيفة</th>
                <th className="p-3 font-semibold text-start">الهاتف / الرقم القومي</th>
                <th className="p-3 font-semibold text-start">الراتب الأساسي</th>
                <th className="p-3 font-semibold text-start">الحالة</th>
                <th className="p-3 font-semibold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    لا يوجد موظفون مطابقون للشروط الحالية.
                  </td>
                </tr>
              ) : (
                paginated.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-gray-900">{emp.code}</div>
                      {emp.fingerprintId && (
                        <div className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded inline-block mt-0.5">
                          بصمة #{emp.fingerprintId}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{emp.fullName}</div>
                      {emp.fullNameAr && <div className="text-xs text-gray-500">{emp.fullNameAr}</div>}
                    </td>
                    <td className="p-3">
                      <div className="text-gray-900 font-medium">{emp.Department?.nameAr || emp.Department?.name || "بدون قسم"}</div>
                      <div className="text-xs text-gray-500">{emp.JobTitle?.titleAr || emp.JobTitle?.title || "-"}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-gray-900">{emp.phone || "-"}</div>
                      <div className="text-xs text-gray-400">{emp.nationalId || "-"}</div>
                    </td>
                    <td className="p-3 font-semibold text-emerald-700">
                      {(emp.baseSalary || 0).toLocaleString()} ج.م
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                          emp.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : emp.status === "ON_LEAVE"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {emp.status === "ACTIVE"
                          ? "نشط"
                          : emp.status === "ON_LEAVE"
                          ? "إجازة"
                          : emp.status === "SUSPENDED"
                          ? "موقوف"
                          : "منهى الخدمة"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setSelectedEmployee(emp)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="عرض التفاصيل"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() => openEditModal(emp)}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="تعديل الموظف"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(emp.id)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="حذف"
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
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Modal Add / Edit Employee */}
      {showModal && (
        <FormModal
          open={showModal}
          onClose={() => setShowModal(false)}
          title={editingEmployee ? "تعديل بيانات الموظف" : "إضافة موظف جديد"}
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
                <label className="block text-xs font-bold text-gray-700 mb-1">كود الموظف *</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">رقم البصمة (Fingerprint ID)</label>
                <input
                  type="text"
                  value={formData.fingerprintId}
                  onChange={(e) => setFormData({ ...formData, fingerprintId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="مثال: 101"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">الشركة المسجل بها *</label>
                <select
                  value={formData.companyId}
                  onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">اختر الشركة...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">الاسم الكامل (إنجليزي/عام) *</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">الاسم باللغة العربية</label>
                <input
                  type="text"
                  value={formData.fullNameAr}
                  onChange={(e) => setFormData({ ...formData, fullNameAr: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">الرقم القومي / الهوية</label>
                <input
                  type="text"
                  value={formData.nationalId}
                  onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">تاريخ التعيين *</label>
                <input
                  type="date"
                  required
                  value={formData.hireDate}
                  onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">القسم</label>
                <select
                  value={formData.departmentId}
                  onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">بدون قسم</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nameAr || d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">المسمى الوظيفي</label>
                <select
                  value={formData.jobTitleId}
                  onChange={(e) => setFormData({ ...formData, jobTitleId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">بدون مسمى</option>
                  {jobTitles.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.titleAr || j.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">الراتب الأساسي (ج.م) *</label>
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
                <label className="block text-xs font-bold text-gray-700 mb-1">نوع التوظيف</label>
                <select
                  value={formData.employmentType}
                  onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="FULL_TIME">دوام كامل (Full-Time)</option>
                  <option value="PART_TIME">دوام جزئي (Part-Time)</option>
                  <option value="CONTRACT">عقد مؤقت (Contract)</option>
                  <option value="TRAINEE">متدرب (Trainee)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">حالة العمل</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ACTIVE">نشط (Active)</option>
                  <option value="ON_LEAVE">في إجازة (On Leave)</option>
                  <option value="SUSPENDED">موقوف عن العمل (Suspended)</option>
                  <option value="TERMINATED">منهى الخدمة (Terminated)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">ملاحظات / بيانات إضافية</label>
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
                إلغاء
              </button>
              <SubmitButton loading={isPending} label={editingEmployee ? "تحديث الموظف" : "إضافة الموظف"} />
            </div>
          </form>
        </FormModal>
      )}

      {/* Modal View Employee Details */}
      {selectedEmployee && (
        <FormModal
          open={!!selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
          title={`تفاصيل الموظف: ${selectedEmployee.fullName}`}
          wide
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div>
                <span className="text-xs text-gray-500 block">الكود الوظيفي</span>
                <span className="font-bold text-gray-900">{selectedEmployee.code}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">رقم جهاز البصمة</span>
                <span className="font-bold text-blue-600">{selectedEmployee.fingerprintId || "غير معرف"}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">القسم</span>
                <span className="font-bold text-gray-900">{selectedEmployee.Department?.nameAr || selectedEmployee.Department?.name || "-"}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">المسمى الوظيفي</span>
                <span className="font-bold text-gray-900">{selectedEmployee.JobTitle?.titleAr || selectedEmployee.JobTitle?.title || "-"}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">تاريخ التعيين</span>
                <span className="font-bold text-gray-900">{new Date(selectedEmployee.hireDate).toLocaleDateString("ar-EG")}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">الراتب الأساسي</span>
                <span className="font-bold text-emerald-700">{selectedEmployee.baseSalary.toLocaleString()} ج.م</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-gray-900 text-xs">معلومات الاتصال والهوية</h4>
              <p className="text-gray-700"><strong>الهاتف:</strong> {selectedEmployee.phone || "غير مسجل"}</p>
              <p className="text-gray-700"><strong>البريد:</strong> {selectedEmployee.email || "غير مسجل"}</p>
              <p className="text-gray-700"><strong>الرقم القومي:</strong> {selectedEmployee.nationalId || "غير مسجل"}</p>
            </div>

            {selectedEmployee.notes && (
              <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-900 border border-amber-200">
                <strong>ملاحظات:</strong> {selectedEmployee.notes}
              </div>
            )}
          </div>
        </FormModal>
      )}
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<PrinterLoader label="جاري تحميل قائمة الموظفين..." />}>
      <EmployeesContent />
    </Suspense>
  );
}
