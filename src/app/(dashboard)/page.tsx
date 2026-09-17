"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/context";
import Link from "next/link";
import PrinterLoader from "@/components/PrinterLoader";
import { DateTimeCell } from "@/components/DateTimeCell";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { AlertKind, DashboardPayload } from "@/lib/dashboard";

const PRIORITY_LABELS: Record<string, string> = {
  NORMAL: "عادي",
  IMPORTANT: "مهم",
  URGENT: "عاجل",
  EMERGENCY: "طارئ",
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "جديد",
  ASSIGNED: "تم التعيين",
  VISITED: "تمت الزيارة",
  RESOLVED: "تم الحل",
  NOT_RESOLVED: "لم يتم الحل",
  REASSIGNED: "إعادة التعيين",
  CLOSED: "مغلق",
};

const priorityColors: Record<string, string> = {
  NORMAL: "bg-gray-100 text-gray-800",
  IMPORTANT: "bg-yellow-100 text-yellow-800",
  URGENT: "bg-orange-100 text-orange-800",
  EMERGENCY: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  ASSIGNED: "bg-purple-100 text-purple-800",
  VISITED: "bg-yellow-100 text-yellow-800",
  NOT_RESOLVED: "bg-red-100 text-red-800",
  REASSIGNED: "bg-indigo-100 text-indigo-800",
};

const MACHINE_STATUSES = [
  "IN_WAREHOUSE",
  "SOLD",
  "RENTED",
  "UNDER_MAINTENANCE",
  "UNDER_INSPECTION",
  "SCRAPPED",
] as const;

const machineStatusChip: Record<string, string> = {
  IN_WAREHOUSE: "bg-blue-50 text-blue-700 border-blue-200",
  SOLD: "bg-green-50 text-green-700 border-green-200",
  RENTED: "bg-teal-50 text-teal-700 border-teal-200",
  UNDER_MAINTENANCE: "bg-orange-50 text-orange-700 border-orange-300",
  UNDER_INSPECTION: "bg-yellow-50 text-yellow-700 border-yellow-300",
  SCRAPPED: "bg-gray-100 text-gray-600 border-gray-200",
};

const ALERT_META: Record<AlertKind, { labelKey: string; className: string }> = {
  URGENT_REQUESTS: {
    labelKey: "dashboard.alerts.URGENT_REQUESTS",
    className: "border-red-200 bg-red-50 text-red-800",
  },
  OVERDUE_INSTALLMENTS: {
    labelKey: "dashboard.alerts.OVERDUE_INSTALLMENTS",
    className: "border-red-200 bg-red-50 text-red-800",
  },
  UNASSIGNED_REQUESTS: {
    labelKey: "dashboard.alerts.UNASSIGNED_REQUESTS",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  CONTRACTS_EXPIRING: {
    labelKey: "dashboard.alerts.CONTRACTS_EXPIRING",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  LOW_STOCK: {
    labelKey: "dashboard.alerts.LOW_STOCK",
    className: "border-orange-200 bg-orange-50 text-orange-800",
  },
};

const getQuickActions = (role?: string) => {
  if (role === "ENGINEER") {
    return [
      {
        label: "dashboard.serviceQueue",
        href: "/service-requests",
        color: "bg-amber-50 text-amber-700 hover:bg-amber-100",
      },
      {
        label: "dashboard.openRequests",
        href: "/service-requests",
        color: "bg-blue-50 text-blue-700 hover:bg-blue-100",
      },
      {
        label: "dashboard.urgentRequests",
        href: "/service-requests",
        color: "bg-red-50 text-red-700 hover:bg-red-100",
      },
      {
        label: "dashboard.visitsThisMonth",
        href: "/service-requests",
        color: "bg-cyan-50 text-cyan-700 hover:bg-cyan-100",
      },
    ];
  }

  return [
    {
      label: "dashboard.addMachine",
      href: "/machines",
      color: "bg-blue-50 text-blue-700 hover:bg-blue-100",
    },
    {
      label: "dashboard.createServiceRequest",
      href: "/service-requests",
      color: "bg-amber-50 text-amber-700 hover:bg-amber-100",
    },
    {
      label: "dashboard.newSale",
      href: "/sales",
      color: "bg-green-50 text-green-700 hover:bg-green-100",
    },
    {
      label: "dashboard.addCustomer",
      href: "/customers",
      color: "bg-purple-50 text-purple-700 hover:bg-purple-100",
    },
  ];
};

const fmt = (value: number) => value.toLocaleString();

export default function Dashboard() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const isEngineerView = data?.role === "ENGINEER";

  const loadDashboard = async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("request failed");
      setData((await res.json()) as DashboardPayload);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(loadDashboard, [
    "sales", "purchases", "returns", "service-requests", "contracts", "machines", "inventory", "customers", "engineers", "settlements", "expenses", "investors", "notifications",
  ]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void loadDashboard();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div dir="rtl" className="text-center py-16">
        <p className="text-red-600 mb-4">{t("common.error")}</p>
        <button
          onClick={() => {
            setFailed(false);
            void refresh();
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div dir="rtl" className="min-h-[60vh] flex items-center justify-center">
        <PrinterLoader label={t("dashboard.loadingDashboard")} />
      </div>
    );
  }

  const kpis = isEngineerView
    ? [
        {
          key: "openRequests",
          value: data.kpis.openRequests,
          href: "/service-requests",
          color: "bg-blue-500",
        },
        {
          key: "urgentRequests",
          value: data.kpis.urgentRequests,
          href: "/service-requests",
          color: "bg-red-500",
        },
        {
          key: "visitsThisMonth",
          value: data.kpis.visitsThisMonth,
          href: "/service-requests",
          color: "bg-cyan-500",
        },
        {
          key: "unassignedRequests",
          value: data.kpis.unassignedRequests,
          href: "/service-requests",
          color: "bg-amber-500",
        },
      ]
    : [
        {
          key: "openRequests",
          value: data.kpis.openRequests,
          href: "/service-requests",
          color: "bg-blue-500",
        },
        {
          key: "urgentRequests",
          value: data.kpis.urgentRequests,
          href: "/service-requests",
          color: "bg-red-500",
        },
        {
          key: "unassignedRequests",
          value: data.kpis.unassignedRequests,
          href: "/service-requests",
          color: "bg-amber-500",
        },
        {
          key: "visitsThisMonth",
          value: data.kpis.visitsThisMonth,
          href: "/service-requests",
          color: "bg-cyan-500",
        },
        {
          key: "activeContracts",
          value: data.kpis.activeContracts,
          href: "/contracts",
          color: "bg-purple-500",
        },
        {
          key: "machinesInService",
          value: data.kpis.machinesInService,
          href: "/machines",
          color: "bg-orange-500",
        },
      ];

  const maxLoad = Math.max(
    1,
    ...data.engineerWorkload.map(
      (row) => row.openAssigned + row.visitsThisMonth,
    ),
  );

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">
            {t("dashboard.updatedAt")}:{" "}
            {new Date(data.generatedAt).toLocaleString("ar-EG")}
          </span>
          <RefreshButton onRefresh={refresh} refreshing={refreshing} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {kpis.map((kpi) => (
          <Link
            key={kpi.key}
            href={kpi.href}
            className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition"
          >
            <p className="text-gray-500 text-xs mb-1">
              {t(`dashboard.${kpi.key}`)}
            </p>
            <div
              className={`inline-block min-w-[2.5rem] px-2 py-0.5 rounded-md ${kpi.color} text-white`}
            >
              <span className="text-2xl font-bold">{fmt(kpi.value)}</span>
            </div>
          </Link>
        ))}
      </div>

      {data.alerts.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">تنبيهات مهمة</h2>
          <ul className="space-y-3">
            {data.alerts.map((alert) => {
              const meta = ALERT_META[alert.kind];
              return (
                <li key={alert.kind}>
                  <Link
                    href={alert.href}
                    className={`block border rounded-lg px-4 py-3 transition hover:brightness-95 ${meta.className}`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-medium">
                        {t(meta.labelKey)} ({fmt(alert.count)})
                      </span>
                      {typeof alert.totalAmount === "number" &&
                        alert.totalAmount > 0 && (
                          <span className="text-sm font-bold">
                            {fmt(alert.totalAmount)}
                          </span>
                        )}
                    </div>
                    {alert.details && alert.details.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm opacity-90">
                        {alert.details.map((contract) => (
                          <li
                            key={contract.id}
                            className="flex items-center justify-between gap-4 flex-wrap"
                          >
                            <span>
                              {contract.contractNumber}
                              {contract.customerName
                                ? ` — ${contract.customerName}`
                                : ""}
                            </span>
                            <span
                              className={
                                contract.daysLeft <= 7 ? "font-bold" : ""
                              }
                            >
                              {contract.daysLeft} {t("dashboard.daysLeft")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!isEngineerView && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">
            {t("dashboard.monthlyPerformance")}
          </h2>
          {data.companies.length === 0 ? (
            <p className="text-gray-400 text-sm">{t("common.noData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 text-sm">
                    <th className="pb-2 px-2 font-medium text-start">
                      {t("companies.title")}
                    </th>
                    <th className="pb-2 px-2 font-medium text-start">
                      {t("dashboard.salesThisMonth")}
                    </th>
                    <th className="pb-2 px-2 font-medium text-start">
                      {t("dashboard.purchasesThisMonth")}
                    </th>
                    <th className="pb-2 px-2 font-medium text-start">
                      {t("dashboard.expensesThisMonth")}
                    </th>
                    <th className="pb-2 px-2 font-medium text-start">
                      {t("dashboard.collectedThisMonth")}
                    </th>
                    <th className="pb-2 px-2 font-medium text-start">
                      {t("dashboard.openRequests")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.companies.map((company) => (
                    <tr
                      key={company.id}
                      className="border-b border-gray-50 last:border-0"
                    >
                      <td className="py-3 px-2 font-medium whitespace-nowrap">
                        {company.name}
                      </td>
                      <td className="py-3 px-2 text-green-700 font-medium">
                        {fmt(company.sales)}
                      </td>
                      <td className="py-3 px-2 text-red-700">
                        {fmt(company.purchases)}
                      </td>
                      <td className="py-3 px-2 text-orange-700">
                        {fmt(company.expenses)}
                      </td>
                      <td className="py-3 px-2 text-emerald-700 font-medium">
                        {fmt(company.collected)}
                      </td>
                      <td className="py-3 px-2">{fmt(company.openRequests)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {!isEngineerView && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {t("dashboard.maintenanceStatus")}
              </h2>
              <Link
                href="/machines"
                className="text-sm text-blue-600 hover:underline"
              >
                {t("machines.title")} ←
              </Link>
            </div>
            <ul className="space-y-2">
              {MACHINE_STATUSES.map((status) => {
                const count = data.machineStatuses[status] ?? 0;
                const active =
                  status === "UNDER_MAINTENANCE" || status === "UNDER_INSPECTION";
                return (
                  <li
                    key={status}
                    className={`flex items-center justify-between border rounded-lg px-3 py-2 ${machineStatusChip[status]} ${active && count > 0 ? "ring-2 ring-offset-1 ring-orange-300" : ""}`}
                  >
                    <span className="text-sm">{t(`machines.${status}`)}</span>
                    <span className="font-bold">{fmt(count)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className={`bg-white rounded-xl shadow-md p-6 ${isEngineerView ? "lg:col-span-2" : ""}`}>
          <h2 className="text-lg font-semibold mb-4">
            {t("dashboard.engineerWorkload")}
          </h2>
          {data.engineerWorkload.length === 0 ? (
            <p className="text-gray-400 text-sm">{t("common.noData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 text-sm">
                    <th className="pb-2 font-medium text-start">
                      {t("dashboard.engineer")}
                    </th>
                    <th className="pb-2 font-medium text-start">
                      {t("dashboard.assignedOpen")}
                    </th>
                    <th className="pb-2 font-medium text-start">
                      {t("dashboard.visitsCol")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.engineerWorkload.slice(0, 10).map((row) => {
                    const total = row.openAssigned + row.visitsThisMonth;
                    const pressure = total / maxLoad;
                    const barColor =
                      row.openAssigned >= 5
                        ? "bg-red-500"
                        : row.openAssigned >= 3
                          ? "bg-amber-500"
                          : "bg-blue-500";
                    return (
                      <tr
                        key={row.engineerId}
                        className="border-b border-gray-50 last:border-0"
                      >
                        <td className="py-2 font-medium whitespace-nowrap">
                          {row.name}
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-full max-w-[120px] h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${barColor}`}
                                style={{
                                  width: `${Math.max(4, Math.round(pressure * 100))}%`,
                                }}
                              />
                            </div>
                            <span className="font-bold">
                              {fmt(row.openAssigned)}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 text-gray-600">
                          {fmt(row.visitsThisMonth)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">
          {t("dashboard.serviceQueue")}
        </h2>
        {data.recentRequests.length === 0 ? (
          <p className="text-gray-400 text-sm">{t("common.noData")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 text-sm">
                  <th className="pb-2 px-2 font-medium text-start">#</th>
                  <th className="pb-2 px-2 font-medium text-start">
                    {t("common.description")}
                  </th>
                  <th className="pb-2 px-2 font-medium text-start">
                    {t("serviceRequests.customer")}
                  </th>
                  <th className="pb-2 px-2 font-medium text-start">
                    {t("machines.serialNumber")}
                  </th>
                  <th className="pb-2 px-2 font-medium text-start">
                    {t("serviceRequests.priority")}
                  </th>
                  <th className="pb-2 px-2 font-medium text-start">
                    {t("serviceRequests.status")}
                  </th>
                  <th className="pb-2 px-2 font-medium text-start">
                    {t("dashboard.engineer")}
                  </th>
                  <th className="pb-2 px-2 font-medium text-start">{t("common.date")}</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRequests.map((request) => (
                  <tr
                    key={request.id}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="py-2 px-2 text-xs text-gray-500">
                      {request.requestNumber}
                    </td>
                    <td className="py-2 px-2 text-sm max-w-[220px] truncate">
                      {request.description}
                    </td>
                    <td className="py-2 px-2 text-sm whitespace-nowrap">
                      {request.customerName}
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-600">
                      {request.machineSerial ?? "—"}
                    </td>
                    <td className="py-2 px-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[request.priority] || ""}`}
                      >
                        {PRIORITY_LABELS[request.priority] || request.priority}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${statusColors[request.status] || "bg-gray-100 text-gray-800"}`}
                      >
                        {STATUS_LABELS[request.status] || request.status}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-sm whitespace-nowrap">
                      {request.engineerName ?? "—"}
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-400 whitespace-nowrap">
                      <DateTimeCell value={request.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-lg font-semibold mb-4">
          {t("dashboard.quickActions")}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {getQuickActions(data.role).map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={`block rounded-xl px-4 py-6 text-center font-medium transition ${action.color}`}
            >
              {t(action.label)}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
