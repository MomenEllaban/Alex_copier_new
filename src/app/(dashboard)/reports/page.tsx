"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import PrinterLoader from "@/components/PrinterLoader";
import { DateTimeCell } from "@/components/DateTimeCell";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

interface ReportPayload {
  contracts: Array<{
    id: string;
    contractNumber: string;
    customer: string;
    contractType: string;
    value: number;
    status: string;
    visitsCount: number;
    estimatedProfit: number;
  }>;
  engineers: Array<{
    id: string;
    name: string;
    areas: string[];
    skills: string[];
    baseSalary: number;
    commissionRate: number;
    openCount: number;
    resolvedCount: number;
    visitsCount: number;
    avgRating: number;
  }>;
  cash: {
    totalCollected: number;
    totalPendingVerification: number;
    totalExpenses: number;
    netCash: number;
  };
  machinesNeedingInspection: Array<{
    id: string;
    serialNumber: string;
    currentStatus: string;
    product?: { name?: string } | null;
    customerLocation?: { name?: string } | null;
  }>;
  warranties: Array<{
    id: string;
    serialNumber: string;
    machineName: string;
    warrantyEnd: string;
    daysLeft: number;
  }>;
  investorDistribution: Array<{
    id: string;
    cycleDate: string;
    totalProfit: number;
    distributions: Array<{ investor: string; ownershipPct: number; amount: number }>;
  }>;
  sparePartMatrix: Array<{
    id: string;
    name: string;
    compatibleMachines: string[];
  }>;
  customerSatisfaction: {
    averageRating: number;
    ratedRequests: number;
    totalRequests: number;
  };
  summary: {
    totalContracts: number;
    totalEngineers: number;
    totalOpenServiceRequests: number;
  };
}

const reportCards = [
  { key: "contractProfitability", icon: "💰", desc: "revenueMinusCosts" },
  { key: "engineerPerformance", icon: "👷", desc: "visitResolutionSales" },
  { key: "liveCashPosition", icon: "💵", desc: "settlementsUnverified" },
  { key: "machinesNeedingInspection", icon: "🔍", desc: "underInspectionCount" },
  { key: "expiringWarranties", icon: "🛡️", desc: "warrantyExpiry" },
  { key: "customerSatisfaction", icon: "⭐", desc: "averageRatings" },
  { key: "investorDistribution", icon: "📊", desc: "distributionHistory" },
  { key: "sparePartsMatrix", icon: "🔧", desc: "compatibilityMatrix" },
] as const;

const moneyFormatter = (value: number, locale: string) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(value);

const numberFormatter = (value: number, locale: string) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US").format(value);

export default function ReportsPage() {
  const { t, dir, locale } = useI18n();
  const [expanded, setExpanded] = useState<string | null>("contractProfitability");
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchReport = async () => {
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) {
        setReport(null);
        return;
      }
      const data = await res.json();
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchReport, [
    "contracts", "engineers", "sales", "settlements", "expenses", "machines", "investors", "products", "service-requests",
  ]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contractTotal = useMemo(
    () => report?.contracts.reduce((sum, item) => sum + item.value, 0) ?? 0,
    [report],
  );
  const profitTotal = useMemo(
    () => report?.contracts.reduce((sum, item) => sum + item.estimatedProfit, 0) ?? 0,
    [report],
  );

  const summaryCards = [
    { label: t("reports.contractProfitability"), value: moneyFormatter(contractTotal, locale), accent: "bg-blue-50 text-blue-700" },
    { label: t("reports.estimatedProfit"), value: moneyFormatter(profitTotal, locale), accent: "bg-emerald-50 text-emerald-700" },
    { label: t("reports.engineerPerformance"), value: String(report?.summary.totalEngineers ?? 0), accent: "bg-violet-50 text-violet-700" },
    { label: t("reports.liveCashPosition"), value: moneyFormatter(report?.cash.netCash ?? 0, locale), accent: "bg-amber-50 text-amber-700" },
  ];

  return (
    <div dir={dir} className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">{t("reports.title")}</h1>
        <RefreshButton onRefresh={refresh} refreshing={refreshing} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => (
          <div key={item.label} className={`rounded-2xl border border-slate-200 p-4 shadow-sm ${item.accent}`}>
            <div className="text-xs font-medium opacity-80">{item.label}</div>
            <div className="mt-2 text-xl font-bold sm:text-2xl">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-1">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`${t("common.search")} ${t("reports.title")}...`}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 md:max-w-md"
        />
      </div>

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <PrinterLoader size="md" label={t("common.loading")} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {reportCards
            .filter((card) =>
              [t(`reports.${card.key}`), t(`reports.${card.desc}`)]
                .join(" ")
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((card) => (
              <div key={card.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => (prev === card.key ? null : card.key))}
                  className="w-full p-5 text-start"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl shadow-inner">{card.icon}</div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-800">{t(`reports.${card.key}`)}</h3>
                        <p className="text-sm text-slate-500">{t(`reports.${card.desc}`)}</p>
                      </div>
                    </div>
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition ${expanded === card.key ? "rotate-180" : ""}`}>
                      ▾
                    </span>
                  </div>
                </button>

                {expanded === card.key && (
                  <div className="border-t border-slate-200 bg-slate-50/40 p-5">
                    {card.key === "contractProfitability" && (
                      <>
                        <div className="mb-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl bg-slate-100 p-3">
                            <div className="text-xs text-gray-500">{t("reports.value")}</div>
                            <div className="mt-1 text-lg font-bold">{moneyFormatter(contractTotal, locale)}</div>
                          </div>
                          <div className="rounded-xl bg-emerald-100 p-3">
                            <div className="text-xs text-gray-500">{t("reports.estimatedProfit")}</div>
                            <div className="mt-1 text-lg font-bold text-emerald-700">{moneyFormatter(profitTotal, locale)}</div>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[700px]">
                            <thead>
                              <tr className="bg-white">
                                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("reports.contractNumber")}</th>
                                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("reports.customer")}</th>
                                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("reports.type")}</th>
                                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("reports.value")}</th>
                                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.status")}</th>
                                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("reports.estimatedProfit")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(report?.contracts ?? []).map((contract) => (
                                <tr key={contract.id} className="border-t border-gray-100 hover:bg-white">
                                  <td className="px-4 py-3 text-sm font-medium">{contract.contractNumber}</td>
                                  <td className="px-4 py-3 text-sm">{contract.customer}</td>
                                  <td className="px-4 py-3 text-sm">{contract.contractType}</td>
                                  <td className="px-4 py-3 text-sm">{moneyFormatter(contract.value, locale)}</td>
                                  <td className="px-4 py-3 text-sm">
                                    <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                                      {contract.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-emerald-700">{moneyFormatter(contract.estimatedProfit, locale)}</td>
                                </tr>
                              ))}
                              {(report?.contracts ?? []).length === 0 && (
                                <tr>
                                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">{t("common.noData")}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    {card.key === "engineerPerformance" && (
                      <>
                        <div className="mb-4 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-xl bg-slate-100 p-3">
                            <div className="text-xs text-gray-500">{t("reports.engineerPerformance")}</div>
                            <div className="mt-1 text-lg font-bold">{report?.summary.totalEngineers ?? 0}</div>
                          </div>
                          <div className="rounded-xl bg-amber-100 p-3">
                            <div className="text-xs text-gray-500">{t("dashboard.openRequests")}</div>
                            <div className="mt-1 text-lg font-bold text-amber-700">{report?.summary.totalOpenServiceRequests ?? 0}</div>
                          </div>
                          <div className="rounded-xl bg-emerald-100 p-3">
                            <div className="text-xs text-gray-500">{t("reports.customerSatisfaction")}</div>
                            <div className="mt-1 text-lg font-bold text-emerald-700">
                              {report?.customerSatisfaction.averageRating ? `${report.customerSatisfaction.averageRating.toFixed(1)}/5` : "0/5"}
                            </div>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[800px]">
                            <thead>
                              <tr className="bg-white">
                                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineers.name")}</th>
                                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineers.areas")}</th>
                                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("engineers.skills")}</th>
                                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("dashboard.openRequests")}</th>
                                <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("reports.customerSatisfaction")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(report?.engineers ?? []).map((engineer) => (
                                <tr key={engineer.id} className="border-t border-gray-100 hover:bg-white">
                                  <td className="px-4 py-3 text-sm font-medium">{engineer.name}</td>
                                  <td className="px-4 py-3 text-sm">
                                    {(engineer.areas ?? []).map((area) => (
                                      <span key={area} className="mx-1 mb-1 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                                        {area}
                                      </span>
                                    )) || "—"}
                                  </td>
                                  <td className="px-4 py-3 text-sm">
                                    {(engineer.skills ?? []).map((skill) => (
                                      <span key={skill} className="mx-1 mb-1 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                                        {skill}
                                      </span>
                                    )) || "—"}
                                  </td>
                                  <td className="px-4 py-3 text-sm">{engineer.openCount}</td>
                                  <td className="px-4 py-3 text-sm">
                                    {engineer.avgRating ? `${engineer.avgRating.toFixed(1)}/5` : "0/5"}
                                  </td>
                                </tr>
                              ))}
                              {(report?.engineers ?? []).length === 0 && (
                                <tr>
                                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">{t("common.noData")}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    {card.key === "liveCashPosition" && (
                      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl bg-emerald-100 p-3">
                          <div className="text-xs text-gray-500">{t("reports.liveCashPosition")}</div>
                          <div className="mt-1 text-lg font-bold text-emerald-700">{moneyFormatter(report?.cash.netCash ?? 0, locale)}</div>
                        </div>
                        <div className="rounded-xl bg-slate-100 p-3">
                          <div className="text-xs text-gray-500">{t("dashboard.collectedThisMonth")}</div>
                          <div className="mt-1 text-lg font-bold">{moneyFormatter(report?.cash.totalCollected ?? 0, locale)}</div>
                        </div>
                        <div className="rounded-xl bg-amber-100 p-3">
                          <div className="text-xs text-gray-500">{t("dashboard.pendingServiceRequests")}</div>
                          <div className="mt-1 text-lg font-bold text-amber-700">{moneyFormatter(report?.cash.totalPendingVerification ?? 0, locale)}</div>
                        </div>
                        <div className="rounded-xl bg-red-100 p-3">
                          <div className="text-xs text-gray-500">{t("dashboard.expensesThisMonth")}</div>
                          <div className="mt-1 text-lg font-bold text-red-700">{moneyFormatter(report?.cash.totalExpenses ?? 0, locale)}</div>
                        </div>
                      </div>
                    )}

                    {card.key === "machinesNeedingInspection" && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[600px]">
                          <thead>
                            <tr className="bg-white">
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("machines.serialNumber")}</th>
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("machines.model")}</th>
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.status")}</th>
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("machineDetails.location")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(report?.machinesNeedingInspection ?? []).map((machine) => (
                              <tr key={machine.id} className="border-t border-gray-100 hover:bg-white">
                                <td className="px-4 py-3 text-sm font-medium">{machine.serialNumber}</td>
                                <td className="px-4 py-3 text-sm">{machine.product?.name ?? machine.currentStatus ?? "—"}</td>
                                <td className="px-4 py-3 text-sm">
                                  <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                    {machine.currentStatus}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm">{machine.customerLocation?.name ?? "—"}</td>
                              </tr>
                            ))}
                            {(report?.machinesNeedingInspection ?? []).length === 0 && (
                              <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">{t("common.noData")}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {card.key === "expiringWarranties" && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[600px]">
                          <thead>
                            <tr className="bg-white">
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("machines.serialNumber")}</th>
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("machines.model")}</th>
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.date")}</th>
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.status")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(report?.warranties ?? []).map((item) => (
                              <tr key={item.id} className="border-t border-gray-100 hover:bg-white">
                                <td className="px-4 py-3 text-sm font-medium">{item.serialNumber}</td>
                                <td className="px-4 py-3 text-sm">{item.machineName}</td>
                                <td className="px-4 py-3 text-sm"><DateTimeCell value={item.warrantyEnd} /></td>
                                <td className="px-4 py-3 text-sm">
                                  <span className={item.daysLeft <= 30 ? "inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700" : "inline-flex rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700"}>
                                    {item.daysLeft <= 0 ? `منتهي (${item.daysLeft} يوم)` : `${item.daysLeft} يوم متبقي`}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {(report?.warranties ?? []).length === 0 && (
                              <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">{t("common.noData")}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {card.key === "customerSatisfaction" && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-amber-100 p-4">
                          <div className="text-xs text-gray-500">{t("reports.customerSatisfaction")}</div>
                          <div className="mt-2 text-2xl font-bold text-amber-700">
                            {report?.customerSatisfaction.averageRating ? report.customerSatisfaction.averageRating.toFixed(1) : "0.0"}
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-100 p-4">
                          <div className="text-xs text-gray-500">{t("reports.averageRatings")}</div>
                          <div className="mt-2 text-2xl font-bold">
                            {report?.customerSatisfaction.ratedRequests ?? 0}
                          </div>
                        </div>
                        <div className="rounded-xl bg-emerald-100 p-4">
                          <div className="text-xs text-gray-500">{t("dashboard.totalCustomers")}</div>
                          <div className="mt-2 text-2xl font-bold text-emerald-700">{report?.customerSatisfaction.totalRequests ?? 0}</div>
                        </div>
                      </div>
                    )}

                    {card.key === "investorDistribution" && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px]">
                          <thead>
                            <tr className="bg-white">
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.date")}</th>
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("reports.customer")}</th>
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("reports.value")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(report?.investorDistribution ?? []).flatMap((cycle) =>
                              cycle.distributions.map((distribution) => (
                                <tr key={`${cycle.id}-${distribution.investor}`} className="border-t border-gray-100 hover:bg-white">
                                  <td className="px-4 py-3 text-sm"><DateTimeCell value={cycle.cycleDate} /></td>
                                  <td className="px-4 py-3 text-sm">{distribution.investor}</td>
                                  <td className="px-4 py-3 text-sm font-medium">{moneyFormatter(distribution.amount, locale)}</td>
                                </tr>
                              )),
                            )}
                            {(report?.investorDistribution ?? []).length === 0 && (
                              <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">{t("common.noData")}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {card.key === "sparePartsMatrix" && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[600px]">
                          <thead>
                            <tr className="bg-white">
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("products.name")}</th>
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("reports.type")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(report?.sparePartMatrix ?? []).map((item) => (
                              <tr key={item.id} className="border-t border-gray-100 hover:bg-white">
                                <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                                <td className="px-4 py-3 text-sm">
                                  {item.compatibleMachines.length ? item.compatibleMachines.join(", ") : "—"}
                                </td>
                              </tr>
                            ))}
                            {(report?.sparePartMatrix ?? []).length === 0 && (
                              <tr>
                                <td colSpan={2} className="px-4 py-8 text-center text-gray-400">{t("common.noData")}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
