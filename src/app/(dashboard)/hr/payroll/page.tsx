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
  const { t, dir } = useI18n();
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
      toastError(t("hr.payroll.toastLoadFailed"));
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
        if (!res.ok) throw new Error(data.error || t("hr.payroll.toastCalcFailed"));

        toastSuccess(t("hr.payroll.toastCalcSuccess"));
        setShowCalcModal(false);
        fetchRuns();
      } catch (err: any) {
        setFormError(err.message || t("hr.payroll.toastCalcError"));
      }
    });
  };

  const handleApproveRun = async (runId: string) => {
    const ok = await confirmAction({
      title: t("hr.payroll.approveConfirmTitle"),
      message: t("hr.payroll.approveConfirmMsg"),
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
        throw new Error(data.error || t("hr.payroll.toastApproveFailed"));
      }

      toastSuccess(t("hr.payroll.toastApproved"));
      fetchRuns();
    } catch (err: any) {
      toastError(err.message || t("hr.payroll.toastApproveError"));
    }
  };

  const handleLockRun = async (runId: string) => {
    const ok = await confirmAction({
      title: t("hr.payroll.lockConfirmTitle"),
      message: t("hr.payroll.lockConfirmMsg"),
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
        throw new Error(data.error || t("hr.payroll.toastLockFailed"));
      }

      toastSuccess(t("hr.payroll.toastLocked"));
      fetchRuns();
    } catch (err: any) {
      toastError(err.message || t("hr.payroll.toastLockError"));
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
      toastError(t("hr.payroll.toastDetailsFailed"));
    }
  };

  if (loading) return <PrinterLoader label={t("hr.payroll.loading")} />;

  return (
    <div dir={dir} className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Banknote className="text-blue-600 shrink-0" size={28} />
            {t("hr.payroll.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("hr.payroll.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={fetchRuns} refreshing={loading} />
          <button
            onClick={() => setShowCalcModal(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
          >
            <Calculator size={18} className="shrink-0" />
            {t("hr.payroll.calcBtn")}
          </button>
        </div>
      </div>

      <StatsCards
        columns={4}
        stats={[
          { label: t("hr.payroll.statRuns"), value: runs.length.toLocaleString("en-US"), icon: <Banknote size={18} />, tone: "sky" },
          { label: t("hr.payroll.statEmployees"), value: runs.reduce((sum, r) => sum + (r.employeeCount || 0), 0).toLocaleString("en-US"), icon: <Users size={18} />, tone: "green" },
          { label: t("hr.payroll.statGross"), value: `${runs.reduce((sum, r) => sum + (r.totalGross || 0), 0).toLocaleString("en-US")} ${t("hr.currency")}`, icon: <Calculator size={18} />, tone: "amber" },
          { label: t("hr.payroll.statNet"), value: `${runs.reduce((sum, r) => sum + (r.totalNet || 0), 0).toLocaleString("en-US")} ${t("hr.currency")}`, icon: <Wallet size={18} />, tone: "emerald" },
        ]}
      />

      {/* Payroll Runs List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
              <tr>
                <th className="p-3 font-semibold text-start">{t("hr.payroll.thPeriod")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.payroll.thCount")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.payroll.thGross")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.payroll.thDeductions")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.payroll.thNet")}</th>
                <th className="p-3 font-semibold text-start">{t("hr.payroll.thStatus")}</th>
                <th className="p-3 font-semibold text-center">{t("hr.payroll.thActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    {t("hr.payroll.noRuns")}
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3 font-bold text-gray-900 whitespace-nowrap">
                      {t("hr.payroll.monthWord")} <span dir="ltr">{r.Period?.month} / {r.Period?.year}</span>
                    </td>
                    <td className="p-3 font-medium text-gray-700 whitespace-nowrap">
                      {r.employeeCount} {t("hr.payroll.employeeWord")}
                    </td>
                    <td className="p-3 text-gray-900 font-semibold whitespace-nowrap">
                      {r.totalGross.toLocaleString("en-US")} {t("hr.currency")}
                    </td>
                    <td className="p-3 text-rose-600 font-semibold whitespace-nowrap">
                      {r.totalDeductions.toLocaleString("en-US")} {t("hr.currency")}
                    </td>
                    <td className="p-3 text-emerald-700 font-extrabold text-base whitespace-nowrap">
                      {r.totalNet.toLocaleString("en-US")} {t("hr.currency")}
                    </td>
                    <td className="p-3">
                      {r.status === "CALCULATED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 whitespace-nowrap">
                          {t("hr.payroll.statusCalculated")}
                        </span>
                      )}
                      {r.status === "APPROVED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 whitespace-nowrap">
                          {t("hr.payroll.statusApproved")}
                        </span>
                      )}
                      {r.status === "LOCKED" && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 whitespace-nowrap">
                          {t("hr.payroll.statusLocked")}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleViewDetails(r)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title={t("hr.payroll.actionView")}
                        >
                          <Eye size={18} />
                        </button>
                        {r.status === "CALCULATED" && (
                          <button
                            onClick={() => handleApproveRun(r.id)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1 rounded-md font-bold transition-colors"
                          >
                            {t("hr.payroll.actionApprove")}
                          </button>
                        )}
                        {r.status === "APPROVED" && (
                          <button
                            onClick={() => handleLockRun(r.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1 rounded-md font-bold transition-colors flex items-center gap-1"
                          >
                            <Lock size={12} className="shrink-0" /> {t("hr.payroll.actionLock")}
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
          title={t("hr.payroll.calcModalTitle")}
        >
          <form onSubmit={handleCalculatePayroll} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.payroll.monthLabel")}</label>
                <select
                  value={calcMonth}
                  onChange={(e) => setCalcMonth(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                    <option key={m} value={m}>
                      {t("hr.payroll.monthOption")} {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t("hr.payroll.yearLabel")}</label>
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
              {t("hr.payroll.calcInfo")}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowCalcModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <SubmitButton loading={isPending} label={t("hr.payroll.startCalc")} />
            </div>
          </form>
        </FormModal>
      )}

      {/* Details / Slip Modal */}
      {selectedRunDetails && selectedRunItems && (
        <FormModal
          open={!!selectedRunDetails}
          onClose={() => { setSelectedRunDetails(null); setSelectedRunItems(null); }}
          title={`${t("hr.payroll.detailTitlePrefix")}${t("hr.payroll.monthWord")} ${selectedRunDetails.Period?.month} / ${selectedRunDetails.Period?.year}`}
          xl
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
              <span className="text-xs text-gray-600">{t("hr.payroll.detailTotalEmployees")} <strong>{selectedRunItems.length}</strong></span>
              <span className="text-xs text-emerald-800 font-bold whitespace-nowrap">{t("hr.payroll.detailTotalNet")} {selectedRunDetails.totalNet.toLocaleString("en-US")} {t("hr.currency")}</span>
              <ExportButton
                filename={`payroll_slip_${selectedRunDetails.Period?.month}_${selectedRunDetails.Period?.year}`}
                getExport={() => ({
                  headers: [t("hr.payroll.detailExportCode"), t("hr.payroll.detailExportName"), t("hr.payroll.detailExportBasic"), t("hr.payroll.detailExportWorked"), t("hr.payroll.detailExportAbsent"), t("hr.payroll.detailExportLate"), t("hr.payroll.detailExportEarnings"), t("hr.payroll.detailExportDeductions"), t("hr.payroll.detailExportNet")],
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
                    <th className="p-2 text-start">{t("hr.payroll.roleThEmployee")}</th>
                    <th className="p-2 text-start">{t("hr.payroll.roleThBasic")}</th>
                    <th className="p-2 text-start">{t("hr.payroll.roleThWorkedDays")}</th>
                    <th className="p-2 text-start">{t("hr.payroll.roleThAbsentDays")}</th>
                    <th className="p-2 text-start">{t("hr.payroll.roleThLateDays")}</th>
                    <th className="p-2 text-start">{t("hr.payroll.roleThEarnings")}</th>
                    <th className="p-2 text-start">{t("hr.payroll.roleThDeductions")}</th>
                    <th className="p-2 text-start">{t("hr.payroll.roleThNet")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedRunItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="p-2 font-bold text-gray-900">
                        {item.Employee?.fullNameAr || item.Employee?.fullName} (<span dir="ltr">{item.Employee?.code}</span>)
                      </td>
                      <td className="p-2 whitespace-nowrap">{item.basicSalary.toLocaleString("en-US")} {t("hr.currency")}</td>
                      <td className="p-2 text-emerald-700 font-semibold whitespace-nowrap">{item.workedDays} {t("hr.payroll.dayWord")}</td>
                      <td className="p-2 text-rose-600 font-semibold whitespace-nowrap">{item.absentDays} {t("hr.payroll.dayWord")}</td>
                      <td className="p-2 text-amber-700 whitespace-nowrap">{item.lateDays} {t("hr.payroll.dayWord")}</td>
                      <td className="p-2 font-semibold whitespace-nowrap">{item.totalEarnings.toLocaleString("en-US")} {t("hr.currency")}</td>
                      <td className="p-2 text-rose-600 font-semibold whitespace-nowrap">{item.totalDeductions.toLocaleString("en-US")} {t("hr.currency")}</td>
                      <td className="p-2 text-emerald-700 font-extrabold text-sm whitespace-nowrap">{item.netSalary.toLocaleString("en-US")} {t("hr.currency")}</td>
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
