"use client";

import { useEffect, useState, useTransition } from "react";
import { useI18n } from "@/i18n/context";
import PrinterLoader from "@/components/PrinterLoader";
import Pagination from "@/components/Pagination";
import FormModal from "@/components/FormModal";
import RefreshButton from "@/components/RefreshButton";
import StatsCards from "@/components/StatsCards";
import { useConfirm, useToast } from "@/components/UIProvider";
import {
  Banknote,
  Calculator,
  Lock,
  Eye,
  Users,
  Wallet,
  Coins,
  Gift,
  AlertOctagon,
  Settings,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  DollarSign,
  TrendingDown,
  TrendingUp,
  FileText,
  Building,
  HelpCircle,
} from "lucide-react";

export default function ComprehensivePayrollPage() {
  const { t, dir } = useI18n();
  const confirmAction = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [isPending, startTransition] = useTransition();

  // Active top-level subtab
  const [activeTab, setActiveTab] = useState<"runs" | "loans" | "bonuses" | "settings">("runs");

  // ─────────────────────────────────────────────
  // 1. PAYROLL RUNS STATE
  // ─────────────────────────────────────────────
  const [runs, setRuns] = useState<any[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [runsPage, setRunsPage] = useState(1);
  const PAGE_SIZE = 10;

  const [selectedRunDetails, setSelectedRunDetails] = useState<any | null>(null);
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [calcMonth, setCalcMonth] = useState<number>(new Date().getMonth() + 1);
  const [calcYear, setCalcYear] = useState<number>(new Date().getFullYear());

  // ─────────────────────────────────────────────
  // 2. ADVANCES & LOANS STATE
  // ─────────────────────────────────────────────
  const [advances, setAdvances] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [loansSubTab, setLoansSubTab] = useState<"advances" | "loans">("advances");

  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advEmployeeId, setAdvEmployeeId] = useState("");
  const [advAmount, setAdvAmount] = useState("");
  const [advMonth, setAdvMonth] = useState<number>(new Date().getMonth() + 1);
  const [advYear, setAdvYear] = useState<number>(new Date().getFullYear());
  const [advReason, setAdvReason] = useState("");

  const [showLoanModal, setShowLoanModal] = useState(false);
  const [loanEmployeeId, setLoanEmployeeId] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanCount, setLoanCount] = useState("6");
  const [loanStartDate, setLoanStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [loanReason, setLoanReason] = useState("");

  const [selectedLoanForInstallments, setSelectedLoanForInstallments] = useState<any | null>(null);
  const [showPostponeModal, setShowPostponeModal] = useState(false);
  const [postponeInstallmentId, setPostponeInstallmentId] = useState<string | null>(null);
  const [postponeReason, setPostponeReason] = useState("");

  // ─────────────────────────────────────────────
  // 3. BONUSES & PENALTIES STATE
  // ─────────────────────────────────────────────
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [penalties, setPenalties] = useState<any[]>([]);
  const [loadingBonuses, setLoadingBonuses] = useState(false);
  const [bonusesSubTab, setBonusesSubTab] = useState<"bonuses" | "penalties">("bonuses");

  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusEmployeeId, setBonusEmployeeId] = useState("");
  const [bonusTitle, setBonusTitle] = useState("");
  const [bonusType, setBonusType] = useState("PERFORMANCE");
  const [bonusCalcType, setBonusCalcType] = useState<"FIXED_AMOUNT" | "PERCENTAGE_OF_BASIC">("FIXED_AMOUNT");
  const [bonusPercentage, setBonusPercentage] = useState("");
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusMonth, setBonusMonth] = useState<number>(new Date().getMonth() + 1);
  const [bonusYear, setBonusYear] = useState<number>(new Date().getFullYear());
  const [bonusReason, setBonusReason] = useState("");

  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [penaltyEmployeeId, setPenaltyEmployeeId] = useState("");
  const [penaltyTitle, setPenaltyTitle] = useState("");
  const [penaltyType, setPenaltyType] = useState("ADMINISTRATIVE");
  const [penaltyCalcType, setPenaltyCalcType] = useState<"FIXED_AMOUNT" | "DAILY_RATE">("DAILY_RATE");
  const [penaltyDays, setPenaltyDays] = useState("1");
  const [penaltyAmount, setPenaltyAmount] = useState("");
  const [penaltyMonth, setPenaltyMonth] = useState<number>(new Date().getMonth() + 1);
  const [penaltyYear, setPenaltyYear] = useState<number>(new Date().getFullYear());
  const [penaltyReason, setPenaltyReason] = useState("");

  // ─────────────────────────────────────────────
  // 4. SETTINGS & ACCOUNTS STATE
  // ─────────────────────────────────────────────
  const [settings, setSettings] = useState<any | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [mappingValidation, setMappingValidation] = useState<any | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Common: Employees for Dropdowns
  const [employees, setEmployees] = useState<any[]>([]);

  // ─────────────────────────────────────────────
  // DATA FETCHING
  // ─────────────────────────────────────────────
  const fetchEmployees = async () => {
    try {
      const res = await fetch("/api/hr/employees");
      if (res.ok) setEmployees(await res.json());
    } catch {}
  };

  const fetchRuns = async () => {
    try {
      setLoadingRuns(true);
      const res = await fetch("/api/hr/payroll");
      if (res.ok) setRuns(await res.json());
    } catch {
      toastError("فشل تحميل مسيرات الرواتب");
    } finally {
      setLoadingRuns(false);
    }
  };

  const fetchLoansAndAdvances = async () => {
    try {
      setLoadingLoans(true);
      const [advRes, loansRes] = await Promise.all([
        fetch("/api/hr/advances"),
        fetch("/api/hr/loans"),
      ]);
      if (advRes.ok) setAdvances(await advRes.json());
      if (loansRes.ok) setLoans(await loansRes.json());
    } catch {
      toastError("فشل تحميل بيانات السلف والقروض");
    } finally {
      setLoadingLoans(false);
    }
  };

  const fetchBonusesAndPenalties = async () => {
    try {
      setLoadingBonuses(true);
      const [bonRes, penRes] = await Promise.all([
        fetch("/api/hr/bonuses"),
        fetch("/api/hr/penalties"),
      ]);
      if (bonRes.ok) setBonuses(await bonRes.json());
      if (penRes.ok) setPenalties(await penRes.json());
    } catch {
      toastError("فشل تحميل بيانات الحوافز والجزاءات");
    } finally {
      setLoadingBonuses(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoadingSettings(true);
      const res = await fetch("/api/hr/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setAccounts(data.accounts || []);
        setMappingValidation(data.mappingValidation);
      }
    } catch {
      toastError("فشل تحميل سياسات وإعدادات الـ HR");
    } finally {
      setLoadingSettings(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchRuns();
  }, []);

  useEffect(() => {
    if (activeTab === "runs") fetchRuns();
    if (activeTab === "loans") fetchLoansAndAdvances();
    if (activeTab === "bonuses") fetchBonusesAndPenalties();
    if (activeTab === "settings") fetchSettings();
  }, [activeTab]);

  // ─────────────────────────────────────────────
  // RUNS ACTIONS
  // ─────────────────────────────────────────────
  const handleCalculatePayroll = (e: React.FormEvent) => {
    e.preventDefault();
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

        toastSuccess("تم احتساب مسير الرواتب بنجاح");
        setShowCalcModal(false);
        fetchRuns();
      } catch (err: any) {
        toastError(err.message);
      }
    });
  };

  const handleApproveRun = async (runId: string) => {
    const ok = await confirmAction({
      title: "اعتماد كشف الرواتب",
      message: "هل أنت متأكد من رغبتك في اعتماد هذا الكشف المالي للمراجعة؟",
    });
    if (!ok) return;

    try {
      const res = await fetch("/api/hr/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل اعتماد الكشف");

      toastSuccess("تم اعتماد كشف الرواتب بنجاح");
      fetchRuns();
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const handleLockRun = async (runId: string) => {
    const ok = await confirmAction({
      title: "قفل وصرف مسير الرواتب",
      message: "سيتم قفل الكشف نهائياً، وتحديث السلف والأقساط كمدفوعة، وتوليد القيد المحاسبي المتوازن في شجرة الحسابات. هل تريد المتابعة؟",
    });
    if (!ok) return;

    try {
      const res = await fetch("/api/hr/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lock", runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل قفل الكشف");

      toastSuccess("تم قفل وصرف كشف الرواتب وتوليد القيد المحاسبي بنجاح!");
      fetchRuns();
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const handleViewRunDetails = async (runId: string) => {
    try {
      const res = await fetch(`/api/hr/payroll/${runId}`);
      if (res.ok) {
        const fullRun = await res.json();
        setSelectedRunDetails(fullRun);
      } else {
        toastError("تعذر جلب تفاصيل الكشف");
      }
    } catch {
      toastError("حدث خطأ في جلب التفاصيل");
    }
  };

  // ─────────────────────────────────────────────
  // ADVANCES & LOANS ACTIONS
  // ─────────────────────────────────────────────
  const handleRequestAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/hr/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: advEmployeeId,
          amount: parseFloat(advAmount),
          deductMonth: Number(advMonth),
          deductYear: Number(advYear),
          reason: advReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تسجيل طلب السلفة");

      toastSuccess("تم تسجيل طلب السلفة بنجاح");
      setShowAdvanceModal(false);
      setAdvAmount("");
      setAdvReason("");
      fetchLoansAndAdvances();
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const handleAdvanceAction = async (id: string, action: "approve" | "reject" | "disburse") => {
    const actionLabel = action === "approve" ? "اعتماد" : action === "reject" ? "رفض" : "صرف";
    const ok = await confirmAction({
      title: `${actionLabel} السلفة`,
      message: `هل أنت متأكد من رغبتك في ${actionLabel} هذه السلفة؟`,
    });
    if (!ok) return;

    try {
      const res = await fetch("/api/hr/advances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `فشل ${actionLabel} السلفة`);

      toastSuccess(`تم ${actionLabel} السلفة بنجاح`);
      fetchLoansAndAdvances();
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/hr/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: loanEmployeeId,
          totalAmount: parseFloat(loanAmount),
          installmentCount: parseInt(loanCount),
          startDate: loanStartDate,
          reason: loanReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إنشاء القرض");

      toastSuccess("تم إنشاء القرض وتوليد جدول الأقساط أوتوماتيكياً بنجاح");
      setShowLoanModal(false);
      setLoanAmount("");
      setLoanReason("");
      fetchLoansAndAdvances();
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const handleLoanAction = async (loanId: string, action: "approve" | "reject" | "disburse") => {
    const actionLabel = action === "approve" ? "اعتماد" : action === "reject" ? "رفض" : "صرف";
    const ok = await confirmAction({
      title: `${actionLabel} القرض`,
      message: `هل أنت متأكد من رغبتك في ${actionLabel} هذا القرض؟`,
    });
    if (!ok) return;

    try {
      const res = await fetch("/api/hr/loans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `فشل ${actionLabel} القرض`);

      toastSuccess(`تم ${actionLabel} القرض بنجاح`);
      fetchLoansAndAdvances();
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const handlePostponeInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postponeInstallmentId) return;

    try {
      const res = await fetch("/api/hr/loans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "postponeInstallment",
          installmentId: postponeInstallmentId,
          reason: postponeReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تأجيل القسط");

      toastSuccess("تم تأجيل القسط وإضافة قسط بديل في نهاية الجدول بنجاح");
      setShowPostponeModal(false);
      setPostponeReason("");
      fetchLoansAndAdvances();
      if (selectedLoanForInstallments) {
        // Refresh open loan modal
        const refreshedLoans = await (await fetch("/api/hr/loans")).json();
        const updatedLoan = refreshedLoans.find((l: any) => l.id === selectedLoanForInstallments.id);
        if (updatedLoan) setSelectedLoanForInstallments(updatedLoan);
      }
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const handleEarlyPayoffInstallment = async (installmentId: string) => {
    const ok = await confirmAction({
      title: "سداد مبكر للقسط",
      message: "هل تريد تأكيد سداد هذا القسط مقدماً وإغلاقه؟",
    });
    if (!ok) return;

    try {
      const res = await fetch("/api/hr/loans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "earlyPayoffInstallment",
          installmentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل السداد المبكر");

      toastSuccess("تم سداد القسط بنجاح");
      fetchLoansAndAdvances();
      if (selectedLoanForInstallments) {
        const refreshedLoans = await (await fetch("/api/hr/loans")).json();
        const updatedLoan = refreshedLoans.find((l: any) => l.id === selectedLoanForInstallments.id);
        if (updatedLoan) setSelectedLoanForInstallments(updatedLoan);
      }
    } catch (err: any) {
      toastError(err.message);
    }
  };

  // ─────────────────────────────────────────────
  // BONUSES & PENALTIES ACTIONS
  // ─────────────────────────────────────────────
  const handleCreateBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/hr/bonuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: bonusEmployeeId,
          title: bonusTitle,
          bonusType,
          calcType: bonusCalcType,
          percentage: bonusPercentage ? parseFloat(bonusPercentage) : undefined,
          amount: bonusAmount ? parseFloat(bonusAmount) : undefined,
          targetMonth: Number(bonusMonth),
          targetYear: Number(bonusYear),
          reason: bonusReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تسجيل المكافأة");

      toastSuccess("تم تسجيل المكافأة بنجاح");
      setShowBonusModal(false);
      setBonusTitle("");
      setBonusAmount("");
      setBonusPercentage("");
      fetchBonusesAndPenalties();
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const handleBonusAction = async (id: string, action: "approve" | "reject") => {
    const actionLabel = action === "approve" ? "اعتماد" : "رفض";
    const ok = await confirmAction({
      title: `${actionLabel} المكافأة`,
      message: `هل أنت متأكد من رغبتك في ${actionLabel} هذه المكافأة؟`,
    });
    if (!ok) return;

    try {
      const res = await fetch("/api/hr/bonuses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `فشل ${actionLabel} المكافأة`);

      toastSuccess(`تم ${actionLabel} المكافأة بنجاح`);
      fetchBonusesAndPenalties();
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const handleCreatePenalty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/hr/penalties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: penaltyEmployeeId,
          title: penaltyTitle,
          penaltyType,
          calcType: penaltyCalcType,
          deductionDays: penaltyDays ? parseFloat(penaltyDays) : undefined,
          amount: penaltyAmount ? parseFloat(penaltyAmount) : undefined,
          targetMonth: Number(penaltyMonth),
          targetYear: Number(penaltyYear),
          reason: penaltyReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تسجيل الجزاء");

      toastSuccess("تم تسجيل الجزاء بنجاح");
      setShowPenaltyModal(false);
      setPenaltyTitle("");
      setPenaltyAmount("");
      setPenaltyReason("");
      fetchBonusesAndPenalties();
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const handlePenaltyAction = async (id: string, action: "approve" | "reject") => {
    const actionLabel = action === "approve" ? "اعتماد" : "إلغاء";
    const ok = await confirmAction({
      title: `${actionLabel} الجزاء`,
      message: `هل أنت متأكد من رغبتك في ${actionLabel} هذا الجزاء؟`,
    });
    if (!ok) return;

    try {
      const res = await fetch("/api/hr/penalties", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `فشل ${actionLabel} الجزاء`);

      toastSuccess(`تم ${actionLabel} الجزاء بنجاح`);
      fetchBonusesAndPenalties();
    } catch (err: any) {
      toastError(err.message);
    }
  };

  // ─────────────────────────────────────────────
  // SETTINGS & ACCOUNTS SAVE
  // ─────────────────────────────────────────────
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    try {
      setSavingSettings(true);
      const res = await fetch("/api/hr/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل حفظ الإعدادات");

      toastSuccess("تم تحديث سياسات وإعدادات الـ HR والربط المحاسبي بنجاح");
      fetchSettings();
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div dir={dir} className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Banknote className="text-blue-600 shrink-0" size={28} />
            إدارة مسيرات الرواتب والسلف والحوافز
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            منظومة مالية متكاملة لاحتساب الأجور، الخصومات التلقائية، السلف، الأقساط، والقيود المحاسبية.
          </p>
        </div>

        {/* Subtabs Switcher */}
        <div className="flex bg-gray-100 p-1.5 rounded-xl gap-1 text-sm font-medium w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveTab("runs")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === "runs"
                ? "bg-white text-blue-700 shadow-sm font-semibold"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <Calculator size={16} />
            مسيرات الرواتب
          </button>
          <button
            onClick={() => setActiveTab("loans")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === "loans"
                ? "bg-white text-blue-700 shadow-sm font-semibold"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <Coins size={16} />
            السلف والقروض
          </button>
          <button
            onClick={() => setActiveTab("bonuses")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === "bonuses"
                ? "bg-white text-blue-700 shadow-sm font-semibold"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <Gift size={16} />
            الحوافز والجزاءات
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === "settings"
                ? "bg-white text-blue-700 shadow-sm font-semibold"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <Settings size={16} />
            سياسات HR والحسابات
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────── */}
      {/* TAB 1: PAYROLL RUNS                           */}
      {/* ───────────────────────────────────────────── */}
      {activeTab === "runs" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Calculator size={20} className="text-blue-600" />
              كشوفات ومسيرات الرواتب الشهرية
            </h2>
            <div className="flex items-center gap-2">
              <RefreshButton onRefresh={fetchRuns} refreshing={loadingRuns} />
              <button
                onClick={() => setShowCalcModal(true)}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
              >
                <Calculator size={18} className="shrink-0" />
                احتساب مسير جديد
              </button>
            </div>
          </div>

          <StatsCards
            columns={4}
            stats={[
              { label: "إجمالي المسيرات", value: runs.length.toLocaleString("en-US"), icon: <Banknote size={18} />, tone: "sky" },
              { label: "الموظفون المشمولون", value: runs.reduce((sum, r) => sum + (r.employeeCount || 0), 0).toLocaleString("en-US"), icon: <Users size={18} />, tone: "green" },
              { label: "إجمالي الأجور المحتسبة", value: `${runs.reduce((sum, r) => sum + (r.totalGross || 0), 0).toLocaleString("en-US")} ج.م`, icon: <TrendingUp size={18} />, tone: "amber" },
              { label: "صافي المستحقات المصروفة", value: `${runs.reduce((sum, r) => sum + (r.totalNet || 0), 0).toLocaleString("en-US")} ج.م`, icon: <Wallet size={18} />, tone: "emerald" },
            ]}
          />

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                  <tr>
                    <th className="p-3 font-semibold text-start">الشهر / الفترة</th>
                    <th className="p-3 font-semibold text-start">عدد الموظفين</th>
                    <th className="p-3 font-semibold text-start">إجمالي الأجور</th>
                    <th className="p-3 font-semibold text-start">إجمالي الخصومات</th>
                    <th className="p-3 font-semibold text-start">الصافي للموظفين</th>
                    <th className="p-3 font-semibold text-start">الحالة</th>
                    <th className="p-3 font-semibold text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {runs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500">
                        لم يتم احتساب أي مسيرات رواتب حتى الآن. اضغط "احتساب مسير جديد" للبدء.
                      </td>
                    </tr>
                  ) : (
                    runs.slice((runsPage - 1) * PAGE_SIZE, runsPage * PAGE_SIZE).map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3 font-bold text-gray-900">
                          شهر {r.Period?.month} / {r.Period?.year}
                        </td>
                        <td className="p-3 font-medium text-gray-700">{r.employeeCount} موظف</td>
                        <td className="p-3 font-semibold text-emerald-600">{r.totalGross.toLocaleString("en-US")} ج.م</td>
                        <td className="p-3 font-semibold text-rose-600">{r.totalDeductions.toLocaleString("en-US")} ج.م</td>
                        <td className="p-3 font-extrabold text-blue-700">{r.totalNet.toLocaleString("en-US")} ج.م</td>
                        <td className="p-3">
                          {r.status === "CALCULATED" && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              محسوب (Draft)
                            </span>
                          )}
                          {r.status === "APPROVED" && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              معتمد (Approved)
                            </span>
                          )}
                          {r.status === "LOCKED" && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-fit">
                              <Lock size={12} />
                              مقفل ومصروف (Locked)
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleViewRunDetails(r.id)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors title='عرض المفردات'"
                            >
                              <Eye size={18} />
                            </button>

                            {r.status === "CALCULATED" && (
                              <button
                                onClick={() => handleApproveRun(r.id)}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                              >
                                اعتماد
                              </button>
                            )}

                            {r.status === "APPROVED" && (
                              <button
                                onClick={() => handleLockRun(r.id)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1 transition-colors"
                              >
                                <Lock size={13} />
                                قفل وصرف
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

            {runs.length > PAGE_SIZE && (
              <div className="p-3 border-t border-gray-100 flex justify-end">
                <Pagination
                  currentPage={runsPage}
                  totalPages={Math.ceil(runs.length / PAGE_SIZE)}
                  onPageChange={setRunsPage}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* TAB 2: LOANS & ADVANCES                       */}
      {/* ───────────────────────────────────────────── */}
      {activeTab === "loans" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Sub-navigation */}
            <div className="flex bg-gray-100 p-1 rounded-lg gap-1 text-sm font-semibold">
              <button
                onClick={() => setLoansSubTab("advances")}
                className={`px-4 py-2 rounded-md transition-all ${
                  loansSubTab === "advances" ? "bg-white text-blue-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                السلف الآنية (Advances)
              </button>
              <button
                onClick={() => setLoansSubTab("loans")}
                className={`px-4 py-2 rounded-md transition-all ${
                  loansSubTab === "loans" ? "bg-white text-blue-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                القروض المجدولة والأقساط (Loans)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <RefreshButton onRefresh={fetchLoansAndAdvances} refreshing={loadingLoans} />
              {loansSubTab === "advances" ? (
                <button
                  onClick={() => setShowAdvanceModal(true)}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm shadow-sm"
                >
                  <Plus size={16} />
                  طلب سلفة جديدة
                </button>
              ) : (
                <button
                  onClick={() => setShowLoanModal(true)}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-lg text-sm shadow-sm"
                >
                  <Plus size={16} />
                  إنشاء قرض مجدول
                </button>
              )}
            </div>
          </div>

          {/* ADVANCES SUBTAB TABLE */}
          {loansSubTab === "advances" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                  <tr>
                    <th className="p-3 text-start">الموظف</th>
                    <th className="p-3 text-start">مبلغ السلفة</th>
                    <th className="p-3 text-start">شهر الخصم</th>
                    <th className="p-3 text-start">السبب</th>
                    <th className="p-3 text-start">حالة السلفة</th>
                    <th className="p-3 text-start">حالة الصرف</th>
                    <th className="p-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {advances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500">
                        لا توجد سلف مسجلة حالياً.
                      </td>
                    </tr>
                  ) : (
                    advances.map((adv) => (
                      <tr key={adv.id} className="hover:bg-gray-50">
                        <td className="p-3 font-bold text-gray-900">
                          {adv.Employee?.fullNameAr || adv.Employee?.fullName} ({adv.Employee?.code})
                        </td>
                        <td className="p-3 font-semibold text-blue-700">{adv.amount.toLocaleString()} ج.م</td>
                        <td className="p-3 font-medium">شهر {adv.deductMonth} / {adv.deductYear}</td>
                        <td className="p-3 text-gray-600">{adv.reason}</td>
                        <td className="p-3">
                          {adv.status === "PENDING" && <span className="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 font-bold border border-amber-200">معلقة</span>}
                          {adv.status === "APPROVED" && <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 font-bold border border-blue-200">معتمدة</span>}
                          {adv.status === "REJECTED" && <span className="px-2 py-0.5 rounded text-xs bg-rose-50 text-rose-700 font-bold border border-rose-200">مرفوضة</span>}
                          {adv.status === "COMPLETED" && <span className="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">تم الخصم بالمرتب</span>}
                        </td>
                        <td className="p-3">
                          {adv.disbursedAt ? (
                            <span className="text-xs text-emerald-600 font-medium">تم الصرف ({new Date(adv.disbursedAt).toLocaleDateString()})</span>
                          ) : (
                            <span className="text-xs text-gray-400">لم تصرف بعد</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {adv.status === "PENDING" && (
                              <>
                                <button
                                  onClick={() => handleAdvanceAction(adv.id, "approve")}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold"
                                >
                                  اعتماد
                                </button>
                                <button
                                  onClick={() => handleAdvanceAction(adv.id, "reject")}
                                  className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded text-xs font-semibold"
                                >
                                  رفض
                                </button>
                              </>
                            )}
                            {adv.status === "APPROVED" && !adv.disbursedAt && (
                              <button
                                onClick={() => handleAdvanceAction(adv.id, "disburse")}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
                              >
                                تأكيد الصرف
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
          )}

          {/* LOANS SUBTAB TABLE */}
          {loansSubTab === "loans" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                  <tr>
                    <th className="p-3 text-start">الموظف</th>
                    <th className="p-3 text-start">مبلغ القرض</th>
                    <th className="p-3 text-start">الأقساط</th>
                    <th className="p-3 text-start">القسط الشهري</th>
                    <th className="p-3 text-start">تاريخ البداية</th>
                    <th className="p-3 text-start">الحالة</th>
                    <th className="p-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loans.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500">
                        لا توجد قروض مسجلة حالياً. اضغط "إنشاء قرض مجدول" لجدولة أول قرض.
                      </td>
                    </tr>
                  ) : (
                    loans.map((loan) => {
                      const paidCount = loan.Installments?.filter((i: any) => i.status === "PAID").length || 0;
                      return (
                        <tr key={loan.id} className="hover:bg-gray-50">
                          <td className="p-3 font-bold text-gray-900">
                            {loan.Employee?.fullNameAr || loan.Employee?.fullName} ({loan.Employee?.code})
                          </td>
                          <td className="p-3 font-extrabold text-blue-700">{loan.totalAmount.toLocaleString()} ج.م</td>
                          <td className="p-3 font-medium">
                            <span className="text-emerald-700 font-bold">{paidCount}</span> من {loan.installmentCount} قسط
                          </td>
                          <td className="p-3 font-semibold text-gray-800">{loan.monthlyAmount.toLocaleString()} ج.م</td>
                          <td className="p-3 text-gray-600">{new Date(loan.startDate).toLocaleDateString()}</td>
                          <td className="p-3">
                            {loan.status === "PENDING" && <span className="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 font-bold border border-amber-200">معلق</span>}
                            {loan.status === "APPROVED" && <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 font-bold border border-blue-200">معتمد</span>}
                            {loan.status === "DEDUCTING" && <span className="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">تحت الخصم النشط</span>}
                            {loan.status === "COMPLETED" && <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 font-bold border border-gray-300">مسدد بالكامل</span>}
                            {loan.status === "REJECTED" && <span className="px-2 py-0.5 rounded text-xs bg-rose-50 text-rose-700 font-bold border border-rose-200">مرفوض</span>}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setSelectedLoanForInstallments(loan)}
                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded text-xs font-semibold flex items-center gap-1"
                              >
                                <Calendar size={13} />
                                جدول الأقساط
                              </button>

                              {loan.status === "PENDING" && (
                                <button
                                  onClick={() => handleLoanAction(loan.id, "approve")}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold"
                                >
                                  اعتماد
                                </button>
                              )}

                              {loan.status === "APPROVED" && !loan.disbursedAt && (
                                <button
                                  onClick={() => handleLoanAction(loan.id, "disburse")}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
                                >
                                  صرف
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* TAB 3: BONUSES & PENALTIES                    */}
      {/* ───────────────────────────────────────────── */}
      {activeTab === "bonuses" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex bg-gray-100 p-1 rounded-lg gap-1 text-sm font-semibold">
              <button
                onClick={() => setBonusesSubTab("bonuses")}
                className={`px-4 py-2 rounded-md transition-all ${
                  bonusesSubTab === "bonuses" ? "bg-white text-blue-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                المكافآت والحوافز (Bonuses)
              </button>
              <button
                onClick={() => setBonusesSubTab("penalties")}
                className={`px-4 py-2 rounded-md transition-all ${
                  bonusesSubTab === "penalties" ? "bg-white text-blue-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                الخصومات والجزاءات الإدارية (Penalties)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <RefreshButton onRefresh={fetchBonusesAndPenalties} refreshing={loadingBonuses} />
              {bonusesSubTab === "bonuses" ? (
                <button
                  onClick={() => setShowBonusModal(true)}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-lg text-sm shadow-sm"
                >
                  <Plus size={16} />
                  إضافة مكافأة لموظف
                </button>
              ) : (
                <button
                  onClick={() => setShowPenaltyModal(true)}
                  className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-medium px-4 py-2 rounded-lg text-sm shadow-sm"
                >
                  <Plus size={16} />
                  تسجيل جزاء إداري
                </button>
              )}
            </div>
          </div>

          {/* BONUSES TABLE */}
          {bonusesSubTab === "bonuses" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                  <tr>
                    <th className="p-3 text-start">الموظف</th>
                    <th className="p-3 text-start">عنوان المكافأة</th>
                    <th className="p-3 text-start">النوع / الحسبة</th>
                    <th className="p-3 text-start">المبلغ</th>
                    <th className="p-3 text-start">شهر التطبيق</th>
                    <th className="p-3 text-start">الحالة</th>
                    <th className="p-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bonuses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500">
                        لا توجد مكافآت مسجلة حالياً.
                      </td>
                    </tr>
                  ) : (
                    bonuses.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="p-3 font-bold text-gray-900">
                          {b.Employee?.fullNameAr || b.Employee?.fullName} ({b.Employee?.code})
                        </td>
                        <td className="p-3 font-semibold text-gray-800">{b.title}</td>
                        <td className="p-3 text-gray-600">
                          {b.calcType === "PERCENTAGE_OF_BASIC" ? `نسبة (${b.percentage}%) من الأساسي` : "مبلغ مقطوع"}
                        </td>
                        <td className="p-3 font-bold text-emerald-600">+{b.amount.toLocaleString()} ج.م</td>
                        <td className="p-3 font-medium">شهر {b.targetMonth} / {b.targetYear}</td>
                        <td className="p-3">
                          {b.status === "PENDING" && <span className="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 font-bold border border-amber-200">معلقة</span>}
                          {b.status === "APPROVED" && <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 font-bold border border-blue-200">معتمدة للإدراج بالمسير</span>}
                          {b.status === "COMPLETED" && <span className="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">تم الصرف بالمرتب</span>}
                          {b.status === "REJECTED" && <span className="px-2 py-0.5 rounded text-xs bg-rose-50 text-rose-700 font-bold border border-rose-200">مرفوضة</span>}
                        </td>
                        <td className="p-3 text-center">
                          {b.status === "PENDING" && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleBonusAction(b.id, "approve")}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
                              >
                                اعتماد
                              </button>
                              <button
                                onClick={() => handleBonusAction(b.id, "reject")}
                                className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded text-xs font-semibold"
                              >
                                رفض
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* PENALTIES TABLE */}
          {bonusesSubTab === "penalties" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                  <tr>
                    <th className="p-3 text-start">الموظف</th>
                    <th className="p-3 text-start">نوع الجزاء / السبب</th>
                    <th className="p-3 text-start">الحسبة</th>
                    <th className="p-3 text-start">مبلغ الخصم</th>
                    <th className="p-3 text-start">شهر الخصم</th>
                    <th className="p-3 text-start">الحالة</th>
                    <th className="p-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {penalties.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500">
                        لا توجد جزاءات أو خصومات إدارية مسجلة حالياً.
                      </td>
                    </tr>
                  ) : (
                    penalties.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="p-3 font-bold text-gray-900">
                          {p.Employee?.fullNameAr || p.Employee?.fullName} ({p.Employee?.code})
                        </td>
                        <td className="p-3">
                          <p className="font-semibold text-gray-800">{p.title}</p>
                          <span className="text-xs text-gray-500">{p.reason}</span>
                        </td>
                        <td className="p-3 text-gray-600">
                          {p.calcType === "DAILY_RATE" ? `خصم (${p.deductionDays} يوم عمل)` : "مبلغ نقدي مباشر"}
                        </td>
                        <td className="p-3 font-bold text-rose-600">-{p.amount.toLocaleString()} ج.م</td>
                        <td className="p-3 font-medium">شهر {p.targetMonth} / {p.targetYear}</td>
                        <td className="p-3">
                          {p.status === "PENDING" && <span className="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 font-bold border border-amber-200">معلق</span>}
                          {p.status === "APPROVED" && <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 font-bold border border-blue-200">معتمد للخصم</span>}
                          {p.status === "COMPLETED" && <span className="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">تم الخصم بالمرتب</span>}
                          {p.status === "REJECTED" && <span className="px-2 py-0.5 rounded text-xs bg-rose-50 text-rose-700 font-bold border border-rose-200">ملغي</span>}
                        </td>
                        <td className="p-3 text-center">
                          {p.status === "PENDING" && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handlePenaltyAction(p.id, "approve")}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold"
                              >
                                اعتماد الخصم
                              </button>
                              <button
                                onClick={() => handlePenaltyAction(p.id, "reject")}
                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-semibold"
                              >
                                إلغاء
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* TAB 4: HR SETTINGS & ACCOUNT MAPPING          */}
      {/* ───────────────────────────────────────────── */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Settings size={20} className="text-blue-600" />
                سياسات الموارد البشرية والربط مع شجرة الحسابات
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                جميع النسب والقيم ديناميكية ومحفوظة لكل شركة بدون أي هارد كود.
              </p>
            </div>
            <RefreshButton onRefresh={fetchSettings} refreshing={loadingSettings} />
          </div>

          {loadingSettings || !settings ? (
            <PrinterLoader label="جاري تحميل إعدادات وسياسات الشركة..." />
          ) : (
            <form onSubmit={handleSaveSettings} className="space-y-6">
              {/* Account Mapping Warning Banner if incomplete */}
              {mappingValidation && !mappingValidation.isValid && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                  <AlertOctagon className="text-amber-600 shrink-0 mt-0.5" size={20} />
                  <div>
                    <h4 className="font-bold text-amber-900 text-sm">تنبيه الربط المحاسبي (مطلوب قبل قفل أي مسير):</h4>
                    <ul className="mt-1 list-disc list-inside text-xs text-amber-800 space-y-0.5">
                      {mappingValidation.missingAccounts.map((m: string, i: number) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Chart of Accounts Mapping Card */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2 border-b pb-3">
                  <Building className="text-blue-600" size={18} />
                  ربط الحسابات المالية للرواتب (Chart of Accounts Mapping)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      حساب مصروف الرواتب والأجور (Debit) *
                    </label>
                    <select
                      value={settings.payrollExpenseAccountId || ""}
                      onChange={(e) => setSettings({ ...settings, payrollExpenseAccountId: e.target.value || null })}
                      className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- اختر الحساب من شجرة الحسابات --</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name} ({acc.accountType})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      حساب مستحقات الرواتب الدائنة (Credit) *
                    </label>
                    <select
                      value={settings.salariesPayableAccountId || ""}
                      onChange={(e) => setSettings({ ...settings, salariesPayableAccountId: e.target.value || null })}
                      className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- اختر الحساب من شجرة الحسابات --</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name} ({acc.accountType})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      حساب الخزينة / الصندوق الرئيسي (Treasury) *
                    </label>
                    <select
                      value={settings.treasuryAccountId || ""}
                      onChange={(e) => setSettings({ ...settings, treasuryAccountId: e.target.value || null })}
                      className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- اختر الحساب من شجرة الحسابات --</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name} ({acc.accountType})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      حساب سلف الموظفين (Advances Clearing) *
                    </label>
                    <select
                      value={settings.advancesAccountId || ""}
                      onChange={(e) => setSettings({ ...settings, advancesAccountId: e.target.value || null })}
                      className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- اختر الحساب من شجرة الحسابات --</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name} ({acc.accountType})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      حساب قروض الموظفين (Loans Clearing) *
                    </label>
                    <select
                      value={settings.loansAccountId || ""}
                      onChange={(e) => setSettings({ ...settings, loansAccountId: e.target.value || null })}
                      className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- اختر الحساب من شجرة الحسابات --</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name} ({acc.accountType})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      حساب الهيئة القومية للتأمينات (Social Insurance Authority) *
                    </label>
                    <select
                      value={settings.socialInsuranceAccountId || ""}
                      onChange={(e) => setSettings({ ...settings, socialInsuranceAccountId: e.target.value || null })}
                      className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- اختر الحساب من شجرة الحسابات --</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name} ({acc.accountType})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      حساب مصلحة الضرائب / كسب العمل (Tax Authority) *
                    </label>
                    <select
                      value={settings.taxAuthorityAccountId || ""}
                      onChange={(e) => setSettings({ ...settings, taxAuthorityAccountId: e.target.value || null })}
                      className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- اختر الحساب من شجرة الحسابات --</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name} ({acc.accountType})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Work & Attendance Rules */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2 border-b pb-3">
                  <Clock className="text-emerald-600" size={18} />
                  قواعد وساعات العمل والغياب والتأخير
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">عدد أيام الشهر المعياري</label>
                    <input
                      type="number"
                      value={settings.standardWorkingDays}
                      onChange={(e) => setSettings({ ...settings, standardWorkingDays: parseInt(e.target.value) || 30 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">ساعات العمل اليومية</label>
                    <input
                      type="number"
                      step="0.5"
                      value={settings.dailyWorkingHours}
                      onChange={(e) => setSettings({ ...settings, dailyWorkingHours: parseFloat(e.target.value) || 8 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">مضاعف خصم الغياب بدون إذن</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settings.absenceDeductionMultiplier}
                      onChange={(e) => setSettings({ ...settings, absenceDeductionMultiplier: parseFloat(e.target.value) || 1 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                    <span className="text-[11px] text-gray-400">1.0 = يوم بيوم، 2.0 = يوم بيومين</span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">دقائق سماح التأخير (Grace Min)</label>
                    <input
                      type="number"
                      value={settings.lateGraceMinutes}
                      onChange={(e) => setSettings({ ...settings, lateGraceMinutes: parseInt(e.target.value) || 0 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">مضاعف الإضافي النهاري</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settings.overtimeWeekdayRate}
                      onChange={(e) => setSettings({ ...settings, overtimeWeekdayRate: parseFloat(e.target.value) || 1.5 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">مضاعف الإضافي للعطلات</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settings.overtimeWeekendRate}
                      onChange={(e) => setSettings({ ...settings, overtimeWeekendRate: parseFloat(e.target.value) || 2.0 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Loans and Advances Caps */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2 border-b pb-3">
                  <Coins className="text-amber-600" size={18} />
                  حدود وسقوف السلف والقروض
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">الحد الأقصى للسلفة (% من الراتب)</label>
                    <input
                      type="number"
                      value={settings.maxAdvancePercentOfSalary}
                      onChange={(e) => setSettings({ ...settings, maxAdvancePercentOfSalary: parseFloat(e.target.value) || 50 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">الحد الأقصى للقروض المتزامنة</label>
                    <input
                      type="number"
                      value={settings.maxActiveLoansPerEmployee}
                      onChange={(e) => setSettings({ ...settings, maxActiveLoansPerEmployee: parseInt(e.target.value) || 1 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">الحد الأقصى للقرض (مضاعف الراتب)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={settings.maxLoanSalaryMultiple}
                      onChange={(e) => setSettings({ ...settings, maxLoanSalaryMultiple: parseFloat(e.target.value) || 3 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Social Insurance and Income Tax */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2 border-b pb-3">
                  <DollarSign className="text-blue-600" size={18} />
                  التأمينات الاجتماعية وضريبة كسب العمل
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">نسبة حصة العامل للتأمينات (%)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={settings.insuranceEmployeeRate}
                      onChange={(e) => setSettings({ ...settings, insuranceEmployeeRate: parseFloat(e.target.value) || 11 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">نسبة حصة الشركة للتأمينات (%)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={settings.insuranceCompanyRate}
                      onChange={(e) => setSettings({ ...settings, insuranceCompanyRate: parseFloat(e.target.value) || 18.75 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">الحد الأدنى للأجر التأميني</label>
                    <input
                      type="number"
                      value={settings.insuranceMinSalary}
                      onChange={(e) => setSettings({ ...settings, insuranceMinSalary: parseFloat(e.target.value) || 2000 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">الحد الأقصى للأجر التأميني</label>
                    <input
                      type="number"
                      value={settings.insuranceMaxSalary}
                      onChange={(e) => setSettings({ ...settings, insuranceMaxSalary: parseFloat(e.target.value) || 12600 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">الإعفاء الشخصي السنوي للضرائب (ج.م)</label>
                    <input
                      type="number"
                      value={settings.taxPersonalExemption}
                      onChange={(e) => setSettings({ ...settings, taxPersonalExemption: parseFloat(e.target.value) || 20000 })}
                      className="w-full border rounded-lg p-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm text-sm disabled:opacity-50"
                >
                  {savingSettings ? "جاري الحفظ..." : "حفظ السياسات والربط المحاسبي"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* MODAL 1: CALCULATE PAYROLL RUN                */}
      {/* ───────────────────────────────────────────── */}
      <FormModal
        open={showCalcModal}
        onClose={() => setShowCalcModal(false)}
        title="احتساب مسير رواتب شهري جديد"
      >
        <form onSubmit={handleCalculatePayroll} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">الشهر *</label>
              <select
                value={calcMonth}
                onChange={(e) => setCalcMonth(parseInt(e.target.value))}
                className="w-full border rounded-lg p-2.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    شهر {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">السنة *</label>
              <input
                type="number"
                value={calcYear}
                onChange={(e) => setCalcYear(parseInt(e.target.value))}
                className="w-full border rounded-lg p-2.5 text-sm"
              />
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 space-y-1">
            <p className="font-bold flex items-center gap-1">
              <CheckCircle2 size={14} />
              سيقوم النظام آلياً بـ:
            </p>
            <p>1. قراءة سجلات الحضور والبصمات لحساب ساعات العمل والإضافي والغياب والتأخير.</p>
            <p>2. إدراج كافة أقساط القروض المستحقة في هذا الشهر وخصمها من المرتب.</p>
            <p>3. إدراج السلف المعتمدة المجدول خصمها في هذا الشهر.</p>
            <p>4. إضافة الحوافز المعتمدة واستقطاع الجزاءات الإدارية الصادرة.</p>
            <p>5. احتساب حصص التأمينات الاجتماعية وضريبة كسب العمل.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCalcModal(false)}
              className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm"
            >
              {isPending ? "جاري الحساب..." : "بدء الاحتساب"}
            </button>
          </div>
        </form>
      </FormModal>

      {/* ───────────────────────────────────────────── */}
      {/* MODAL 2: VIEW PAYROLL RUN DETAILS (PAYSLIPS) */}
      {/* ───────────────────────────────────────────── */}
      {selectedRunDetails && (
        <FormModal
          open={true}
          onClose={() => setSelectedRunDetails(null)}
          title={`مفردات مسير رواتب شهر ${selectedRunDetails.Period?.month} / ${selectedRunDetails.Period?.year}`}
        >
          <div className="space-y-4 max-h-[75vh] overflow-y-auto p-1">
            {/* Run summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs">
              <div>
                <span className="text-gray-500">إجمالي الأجور:</span>
                <p className="font-extrabold text-emerald-600 text-sm">{selectedRunDetails.totalGross.toLocaleString()} ج.م</p>
              </div>
              <div>
                <span className="text-gray-500">إجمالي الاستقطاعات:</span>
                <p className="font-extrabold text-rose-600 text-sm">{selectedRunDetails.totalDeductions.toLocaleString()} ج.م</p>
              </div>
              <div>
                <span className="text-gray-500">صافي المستحق:</span>
                <p className="font-extrabold text-blue-700 text-sm">{selectedRunDetails.totalNet.toLocaleString()} ج.م</p>
              </div>
              <div>
                <span className="text-gray-500">الحالة:</span>
                <p className="font-bold text-gray-800 text-sm">{selectedRunDetails.status}</p>
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs min-w-[840px]">
                <thead className="bg-gray-100 text-gray-700 border-b">
                  <tr>
                    <th className="p-2 text-start">الموظف</th>
                    <th className="p-2 text-start">الأساسي</th>
                    <th className="p-2 text-start">البدلات</th>
                    <th className="p-2 text-start">الإضافي</th>
                    <th className="p-2 text-start">الحوافز</th>
                    <th className="p-2 text-start">غياب/تأخير</th>
                    <th className="p-2 text-start">جزاءات</th>
                    <th className="p-2 text-start">سلف/أقساط</th>
                    <th className="p-2 text-start">تأمينات</th>
                    <th className="p-2 text-start">ضرائب</th>
                    <th className="p-2 text-start">الصافي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedRunDetails.Items?.map((item: any) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="p-2 font-bold text-gray-900">
                        {item.Employee?.fullNameAr || item.Employee?.fullName}
                        <span className="block text-[10px] text-gray-400">{item.Employee?.code}</span>
                      </td>
                      <td className="p-2 font-medium">{item.basicSalary.toLocaleString()}</td>
                      <td className="p-2 text-emerald-600">+{item.allowancesAmount.toLocaleString()}</td>
                      <td className="p-2 text-emerald-600">+{item.overtimeAmount.toLocaleString()}</td>
                      <td className="p-2 text-emerald-600 font-bold">+{item.bonusesAmount.toLocaleString()}</td>
                      <td className="p-2 text-rose-600">-{(item.absenceAmount + item.lateAmount).toLocaleString()}</td>
                      <td className="p-2 text-rose-600 font-bold">-{item.penaltiesAmount.toLocaleString()}</td>
                      <td className="p-2 text-rose-600 font-bold">-{(item.advancesAmount + item.loansAmount).toLocaleString()}</td>
                      <td className="p-2 text-gray-600">-{item.employeeInsuranceAmount.toLocaleString()}</td>
                      <td className="p-2 text-gray-600">-{item.taxAmount.toLocaleString()}</td>
                      <td className="p-2 font-black text-blue-700 text-sm">{item.netSalary.toLocaleString()} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedRunDetails(null)}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-xs font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </FormModal>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* MODAL 3: REQUEST ADVANCE                      */}
      {/* ───────────────────────────────────────────── */}
      <FormModal
        open={showAdvanceModal}
        onClose={() => setShowAdvanceModal(false)}
        title="طلب سلفة موظف جديدة"
      >
        <form onSubmit={handleRequestAdvance} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">الموظف *</label>
            <select
              value={advEmployeeId}
              onChange={(e) => setAdvEmployeeId(e.target.value)}
              required
              className="w-full border rounded-lg p-2.5 text-sm"
            >
              <option value="">-- اختر الموظف --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.code} - {emp.fullNameAr || emp.fullName} (الأساسي: {emp.baseSalary} ج.م)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">مبلغ السلفة (ج.م) *</label>
            <input
              type="number"
              step="0.01"
              value={advAmount}
              onChange={(e) => setAdvAmount(e.target.value)}
              required
              placeholder="مثال: 1500"
              className="w-full border rounded-lg p-2.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">شهر الخصم من المرتب *</label>
              <select
                value={advMonth}
                onChange={(e) => setAdvMonth(parseInt(e.target.value))}
                className="w-full border rounded-lg p-2.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    شهر {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">سنة الخصم *</label>
              <input
                type="number"
                value={advYear}
                onChange={(e) => setAdvYear(parseInt(e.target.value))}
                className="w-full border rounded-lg p-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">سبب طلب السلفة</label>
            <input
              type="text"
              value={advReason}
              onChange={(e) => setAdvReason(e.target.value)}
              placeholder="مثال: ظروف شخصية طارئة"
              className="w-full border rounded-lg p-2.5 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanceModal(false)}
              className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm"
            >
              تسجيل السلفة
            </button>
          </div>
        </form>
      </FormModal>

      {/* ───────────────────────────────────────────── */}
      {/* MODAL 4: CREATE SCHEDULED LOAN                */}
      {/* ───────────────────────────────────────────── */}
      <FormModal
        open={showLoanModal}
        onClose={() => setShowLoanModal(false)}
        title="إنشاء قرض مجدول وتوليد الأقساط"
      >
        <form onSubmit={handleCreateLoan} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">الموظف *</label>
            <select
              value={loanEmployeeId}
              onChange={(e) => setLoanEmployeeId(e.target.value)}
              required
              className="w-full border rounded-lg p-2.5 text-sm"
            >
              <option value="">-- اختر الموظف --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.code} - {emp.fullNameAr || emp.fullName} (الأساسي: {emp.baseSalary} ج.م)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">إجمالي مبلغ القرض (ج.م) *</label>
              <input
                type="number"
                step="0.01"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                required
                placeholder="مثال: 12000"
                className="w-full border rounded-lg p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">عدد الأقساط الشهرية *</label>
              <input
                type="number"
                min="1"
                max="60"
                value={loanCount}
                onChange={(e) => setLoanCount(e.target.value)}
                required
                className="w-full border rounded-lg p-2.5 text-sm"
              />
            </div>
          </div>

          {loanAmount && loanCount && Number(loanCount) > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between">
              <span>القسط الشهري المتوقع:</span>
              <span className="font-extrabold text-sm">
                {(parseFloat(loanAmount) / parseInt(loanCount)).toFixed(2)} ج.م / شهر
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">تاريخ استحقاق أول قسط *</label>
            <input
              type="date"
              value={loanStartDate}
              onChange={(e) => setLoanStartDate(e.target.value)}
              required
              className="w-full border rounded-lg p-2.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">السبب / الملاحظات</label>
            <input
              type="text"
              value={loanReason}
              onChange={(e) => setLoanReason(e.target.value)}
              placeholder="مثال: قرض زواج / تجهيز"
              className="w-full border rounded-lg p-2.5 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowLoanModal(false)}
              className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm"
            >
              توليد القرض والأقساط
            </button>
          </div>
        </form>
      </FormModal>

      {/* ───────────────────────────────────────────── */}
      {/* MODAL 5: VIEW LOAN INSTALLMENTS SCHEDULE      */}
      {/* ───────────────────────────────────────────── */}
      {selectedLoanForInstallments && (
        <FormModal
          open={true}
          onClose={() => setSelectedLoanForInstallments(null)}
          title={`جدول أقساط قرض: ${selectedLoanForInstallments.Employee?.fullNameAr || selectedLoanForInstallments.Employee?.fullName}`}
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border text-xs">
              <span>إجمالي القرض: <b>{selectedLoanForInstallments.totalAmount.toLocaleString()} ج.م</b></span>
              <span>عدد الأقساط: <b>{selectedLoanForInstallments.installmentCount}</b></span>
              <span>الحالة: <b>{selectedLoanForInstallments.status}</b></span>
            </div>

            <table className="w-full text-xs">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="p-2 text-start">#</th>
                  <th className="p-2 text-start">تاريخ الاستحقاق</th>
                  <th className="p-2 text-start">مبلغ القسط</th>
                  <th className="p-2 text-start">الحالة</th>
                  <th className="p-2 text-center">إجراءات القسط</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selectedLoanForInstallments.Installments?.map((inst: any) => (
                  <tr key={inst.id} className="hover:bg-gray-50">
                    <td className="p-2 font-bold text-gray-700">قسط {inst.installmentNo}</td>
                    <td className="p-2">{new Date(inst.dueDate).toLocaleDateString()}</td>
                    <td className="p-2 font-bold text-blue-700">{inst.amount.toLocaleString()} ج.م</td>
                    <td className="p-2">
                      {inst.status === "PENDING_PAY" && <span className="px-2 py-0.5 rounded text-[11px] bg-amber-50 text-amber-700 font-bold">بانتظار الخصم</span>}
                      {inst.status === "PAID" && <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-700 font-bold">مسدد بالمرتب</span>}
                      {inst.status === "POSTPONED" && <span className="px-2 py-0.5 rounded text-[11px] bg-purple-50 text-purple-700 font-bold">مؤجل</span>}
                    </td>
                    <td className="p-2 text-center">
                      {inst.status === "PENDING_PAY" && (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setPostponeInstallmentId(inst.id);
                              setShowPostponeModal(true);
                            }}
                            className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded text-[10px] font-bold border border-purple-200"
                          >
                            تأجيل
                          </button>
                          <button
                            onClick={() => handleEarlyPayoffInstallment(inst.id)}
                            className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold border border-emerald-200"
                          >
                            سداد مبكر
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedLoanForInstallments(null)}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-xs font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </FormModal>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* MODAL 6: POSTPONE INSTALLMENT                 */}
      {/* ───────────────────────────────────────────── */}
      <FormModal
        open={showPostponeModal}
        onClose={() => setShowPostponeModal(false)}
        title="تأجيل قسط القرض وإعادة الجدولة"
      >
        <form onSubmit={handlePostponeInstallment} className="space-y-4">
          <p className="text-xs text-gray-600">
            سيتم وسم هذا القسط كمؤجل (POSTPONED)، وإضافة قسط جديد بنفس القيمة في نهاية جدول القرض تلقائياً دون اختلال إجمالي القرض.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">سبب التأجيل *</label>
            <input
              type="text"
              value={postponeReason}
              onChange={(e) => setPostponeReason(e.target.value)}
              required
              placeholder="مثال: بناء على طلب الموظف لظروف عائلية"
              className="w-full border rounded-lg p-2.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowPostponeModal(false)}
              className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold shadow-sm"
            >
              تأكيد التأجيل وإضافة القسط البديل
            </button>
          </div>
        </form>
      </FormModal>

      {/* ───────────────────────────────────────────── */}
      {/* MODAL 7: ADD BONUS MODAL                      */}
      {/* ───────────────────────────────────────────── */}
      <FormModal
        open={showBonusModal}
        onClose={() => setShowBonusModal(false)}
        title="إضافة مكافأة أو حافز لموظف"
      >
        <form onSubmit={handleCreateBonus} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">الموظف *</label>
            <select
              value={bonusEmployeeId}
              onChange={(e) => setBonusEmployeeId(e.target.value)}
              required
              className="w-full border rounded-lg p-2.5 text-sm"
            >
              <option value="">-- اختر الموظف --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.code} - {emp.fullNameAr || emp.fullName} (الأساسي: {emp.baseSalary} ج.م)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">عنوان المكافأة / البند *</label>
            <input
              type="text"
              value={bonusTitle}
              onChange={(e) => setBonusTitle(e.target.value)}
              required
              placeholder="مثال: حافز إنتاج وتميز / مكافأة مبيعات"
              className="w-full border rounded-lg p-2.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">طريقة الاحتساب *</label>
              <select
                value={bonusCalcType}
                onChange={(e) => setBonusCalcType(e.target.value as any)}
                className="w-full border rounded-lg p-2.5 text-sm"
              >
                <option value="FIXED_AMOUNT">مبلغ مالي ثابت (ج.م)</option>
                <option value="PERCENTAGE_OF_BASIC">نسبة مئوية من الراتب الأساسي (%)</option>
              </select>
            </div>
            <div>
              {bonusCalcType === "FIXED_AMOUNT" ? (
                <>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">المبلغ (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={bonusAmount}
                    onChange={(e) => setBonusAmount(e.target.value)}
                    required
                    placeholder="مثال: 500"
                    className="w-full border rounded-lg p-2.5 text-sm"
                  />
                </>
              ) : (
                <>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">النسبة المئوية (%) *</label>
                  <input
                    type="number"
                    step="0.1"
                    value={bonusPercentage}
                    onChange={(e) => setBonusPercentage(e.target.value)}
                    required
                    placeholder="مثال: 10"
                    className="w-full border rounded-lg p-2.5 text-sm"
                  />
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">شهر الصرف *</label>
              <select
                value={bonusMonth}
                onChange={(e) => setBonusMonth(parseInt(e.target.value))}
                className="w-full border rounded-lg p-2.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    شهر {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">السنة *</label>
              <input
                type="number"
                value={bonusYear}
                onChange={(e) => setBonusYear(parseInt(e.target.value))}
                className="w-full border rounded-lg p-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">ملاحظات / سبب الصرف</label>
            <input
              type="text"
              value={bonusReason}
              onChange={(e) => setBonusReason(e.target.value)}
              placeholder="مثال: إنجاز أعمال صيانة استثنائية"
              className="w-full border rounded-lg p-2.5 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowBonusModal(false)}
              className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm"
            >
              تسجيل المكافأة
            </button>
          </div>
        </form>
      </FormModal>

      {/* ───────────────────────────────────────────── */}
      {/* MODAL 8: ADD PENALTY MODAL                    */}
      {/* ───────────────────────────────────────────── */}
      <FormModal
        open={showPenaltyModal}
        onClose={() => setShowPenaltyModal(false)}
        title="تسجيل جزاء أو خصم إداري لموظف"
      >
        <form onSubmit={handleCreatePenalty} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">الموظف *</label>
            <select
              value={penaltyEmployeeId}
              onChange={(e) => setPenaltyEmployeeId(e.target.value)}
              required
              className="w-full border rounded-lg p-2.5 text-sm"
            >
              <option value="">-- اختر الموظف --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.code} - {emp.fullNameAr || emp.fullName} (الأساسي: {emp.baseSalary} ج.م)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">عنوان الجزاء *</label>
            <input
              type="text"
              value={penaltyTitle}
              onChange={(e) => setPenaltyTitle(e.target.value)}
              required
              placeholder="مثال: خصم يوم جزاء إداري / إهمال في فحص ماكينة"
              className="w-full border rounded-lg p-2.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">طريقة الخصم *</label>
              <select
                value={penaltyCalcType}
                onChange={(e) => setPenaltyCalcType(e.target.value as any)}
                className="w-full border rounded-lg p-2.5 text-sm"
              >
                <option value="DAILY_RATE">خصم عدد أيام عمل</option>
                <option value="FIXED_AMOUNT">مبلغ نقدي مباشر (ج.م)</option>
              </select>
            </div>
            <div>
              {penaltyCalcType === "DAILY_RATE" ? (
                <>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">عدد الأيام المخصومة *</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    value={penaltyDays}
                    onChange={(e) => setPenaltyDays(e.target.value)}
                    required
                    className="w-full border rounded-lg p-2.5 text-sm"
                  />
                </>
              ) : (
                <>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">المبلغ المخصوم (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={penaltyAmount}
                    onChange={(e) => setPenaltyAmount(e.target.value)}
                    required
                    placeholder="مثال: 300"
                    className="w-full border rounded-lg p-2.5 text-sm"
                  />
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">شهر الخصم *</label>
              <select
                value={penaltyMonth}
                onChange={(e) => setPenaltyMonth(parseInt(e.target.value))}
                className="w-full border rounded-lg p-2.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    شهر {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">السنة *</label>
              <input
                type="number"
                value={penaltyYear}
                onChange={(e) => setPenaltyYear(parseInt(e.target.value))}
                className="w-full border rounded-lg p-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">سبب الجزاء الإداري *</label>
            <textarea
              value={penaltyReason}
              onChange={(e) => setPenaltyReason(e.target.value)}
              required
              rows={2}
              placeholder="اكتب تفاصيل المخالفة والسبب الإداري للخصم..."
              className="w-full border rounded-lg p-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowPenaltyModal(false)}
              className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold shadow-sm"
            >
              تسجيل الجزاء
            </button>
          </div>
        </form>
      </FormModal>
    </div>
  );
}
