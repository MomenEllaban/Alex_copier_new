"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, UserCheck, Calendar, DollarSign, Building2, UserPlus, Clock, FileBadge, Briefcase } from "lucide-react";
import PrinterLoader from "@/components/PrinterLoader";
import { useI18n } from "@/i18n/context";

interface SummaryData {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  lateToday: number;
  absentToday: number;
  onLeaveToday: number;
  pendingLeaves: number;
  totalPayrollThisMonth: number;
}

export default function HRDashboardPage() {
  const { t, dir } = useI18n();
  const [stats, setStats] = useState<SummaryData>({
    totalEmployees: 0,
    activeEmployees: 0,
    presentToday: 0,
    lateToday: 0,
    absentToday: 0,
    onLeaveToday: 0,
    pendingLeaves: 0,
    totalPayrollThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const todayStr = new Date().toISOString().split("T")[0];
        const [empRes, attRes, leaveRes] = await Promise.all([
          fetch("/api/hr/employees"),
          fetch(`/api/hr/attendance?startDate=${todayStr}&endDate=${todayStr}`),
          fetch("/api/hr/leaves?status=PENDING"),
        ]);

        const employees = empRes.ok ? await empRes.json() : [];
        const attendance = attRes.ok ? await attRes.json() : [];
        const pendingLeaves = leaveRes.ok ? await leaveRes.json() : [];

        const totalEmp = Array.isArray(employees) ? employees.length : 0;
        const activeEmp = Array.isArray(employees) ? employees.filter((e: any) => e.status === "ACTIVE").length : 0;
        
        let present = 0;
        let late = 0;
        let absent = 0;
        let onLeave = 0;

        if (Array.isArray(attendance)) {
          attendance.forEach((rec: any) => {
            if (rec.status === "PRESENT") present++;
            else if (rec.status === "LATE") { present++; late++; }
            else if (rec.status === "ABSENT") absent++;
            else if (rec.status === "ON_LEAVE") onLeave++;
          });
        }

        setStats({
          totalEmployees: totalEmp,
          activeEmployees: activeEmp,
          presentToday: present,
          lateToday: late,
          absentToday: absent,
          onLeaveToday: onLeave,
          pendingLeaves: Array.isArray(pendingLeaves) ? pendingLeaves.length : 0,
          totalPayrollThisMonth: 0,
        });
      } catch (err) {
        console.error("Error loading HR stats:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) return <PrinterLoader label={t("hr.dashboard.loading")} />;

  const statCards = [
    { label: t("hr.dashboard.statTotalEmployees"), value: stats.totalEmployees, sub: `${stats.activeEmployees} ${t("hr.dashboard.activeSuffix")}`, icon: Users, color: "bg-blue-500", href: "/hr/employees" },
    { label: t("hr.dashboard.statPresentToday"), value: stats.presentToday, sub: `${stats.lateToday} ${t("hr.dashboard.lateSuffix")}`, icon: UserCheck, color: "bg-emerald-500", href: "/hr/attendance" },
    { label: t("hr.dashboard.statPendingLeaves"), value: stats.pendingLeaves, sub: `${stats.onLeaveToday} ${t("hr.dashboard.onLeaveSuffix")}`, icon: Calendar, color: "bg-amber-500", href: "/hr/leaves" },
    { label: t("hr.dashboard.statAbsentToday"), value: stats.absentToday, sub: t("hr.dashboard.absentSub"), icon: Clock, color: "bg-rose-500", href: "/hr/attendance" },
  ];

  const quickLinks = [
    { title: t("hr.dashboard.empTitle"), desc: t("hr.dashboard.empDesc"), href: "/hr/employees", icon: Users, btnText: t("hr.dashboard.empBtn") },
    { title: t("hr.dashboard.attTitle"), desc: t("hr.dashboard.attDesc"), href: "/hr/attendance", icon: UserCheck, btnText: t("hr.dashboard.attBtn") },
    { title: t("hr.dashboard.leaveTitle"), desc: t("hr.dashboard.leaveDesc"), href: "/hr/leaves", icon: Calendar, btnText: t("hr.dashboard.leaveBtn") },
    { title: t("hr.dashboard.payrollTitle"), desc: t("hr.dashboard.payrollDesc"), href: "/hr/payroll", icon: DollarSign, btnText: t("hr.dashboard.payrollBtn") },
    { title: t("hr.dashboard.deptTitle"), desc: t("hr.dashboard.deptDesc"), href: "/hr/departments", icon: Building2, btnText: t("hr.dashboard.deptBtn") },
  ];

  return (
    <div dir={dir} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="text-blue-600 shrink-0" size={28} />
            {t("hr.dashboard.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("hr.dashboard.subtitle")}
          </p>
        </div>
        <Link
          href="/hr/employees?add=1"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
        >
          <UserPlus size={18} className="shrink-0" />
          {t("hr.dashboard.addEmployee")}
        </Link>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c, i) => {
          const Icon = c.icon;
          return (
            <Link
              key={i}
              href={c.href}
              className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow group flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-medium text-gray-500">{c.label}</p>
                <h3 className="text-2xl font-extrabold text-gray-900 mt-1 group-hover:text-blue-600 transition-colors">
                  {c.value}
                </h3>
                <span className="text-xs text-gray-400 mt-1 block">{c.sub}</span>
              </div>
              <div className={`p-3 rounded-xl text-white ${c.color} shadow-sm`}>
                <Icon size={24} />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Navigation Cards */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <FileBadge className="text-blue-600 shrink-0" size={20} />
          {t("hr.dashboard.sectionsTitle")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-5 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50/30 transition-all flex flex-col justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-blue-100 text-blue-700 rounded-lg shrink-0">
                    <Icon size={22} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">{item.title}</h3>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                  <Link
                    href={item.href}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    {item.btnText} &larr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
