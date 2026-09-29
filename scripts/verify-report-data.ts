import {
  loadCashPosition,
  loadContractProfitability,
  loadEngineerPerformance,
  loadInvestorDistribution,
  loadCustomerSatisfaction,
  loadExpiringWarranties,
  loadMachinesNeedingInspection,
  loadSparePartMatrix,
  loadReportsOverview,
} from "@/lib/reports";

const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** Re-checks the invariants of every report against the live database. */
const main = async () => {
  const [contracts, engineers, cash, inspection, warranties, investors, spareParts, satisfaction, overview] =
    await Promise.all([
      loadContractProfitability(),
      loadEngineerPerformance(),
      loadCashPosition(),
      loadMachinesNeedingInspection(),
      loadExpiringWarranties(),
      loadInvestorDistribution(),
      loadSparePartMatrix(),
      loadCustomerSatisfaction(),
      loadReportsOverview(),
    ]);

  const checks: [string, boolean, string][] = [];

  checks.push([
    "1. contracts: unique contract numbers",
    new Set(contracts.map((c) => c.contractNumber)).size === contracts.length,
    `${contracts.length} rows`,
  ]);
  checks.push([
    "1. contracts: every row has a customer name",
    contracts.every((c) => c.customer && c.customer.length > 0),
    `${contracts.filter((c) => !c.customer).length} missing`,
  ]);
  checks.push([
    "1. contracts: no negative estimated profit",
    contracts.every((c) => c.estimatedProfit >= 0),
    `total profit ${money(contracts.reduce((s, c) => s + c.estimatedProfit, 0))}`,
  ]);
  checks.push([
    "1. contracts: value column has data",
    contracts.some((c) => c.value > 0),
    `${contracts.filter((c) => c.value > 0).length} of ${contracts.length} have a value  <-- GAP`,
  ]);

  checks.push([
    "2. engineers: open + resolved == total visits",
    engineers.every((e) => e.openCount + e.resolvedCount === e.visitsCount),
    `${engineers.length} engineers`,
  ]);
  checks.push([
    "2. engineers: no duplicate names",
    new Set(engineers.map((e) => e.name)).size === engineers.length,
    `${engineers.length - new Set(engineers.map((e) => e.name)).size} duplicates`,
  ]);
  checks.push([
    "2. engineers: rating within 0..5",
    engineers.every((e) => e.avgRating >= 0 && e.avgRating <= 5),
    `${engineers.filter((e) => e.avgRating > 0).length} rated`,
  ]);
  checks.push([
    "2. engineers: areas filled",
    engineers.some((e) => e.areas.length > 0),
    `${engineers.filter((e) => e.areas.length === 0).length} of ${engineers.length} have no area  <-- GAP`,
  ]);
  checks.push([
    "2. engineers: visits data exists",
    engineers.some((e) => e.visitsCount > 0),
    `${engineers.filter((e) => e.visitsCount > 0).length} with visits  <-- GAP`,
  ]);

  checks.push([
    "3. cash: net == collected - expenses",
    Math.abs(cash.netCash - (cash.totalCollected - cash.totalExpenses)) < 1,
    `collected ${money(cash.totalCollected)} | pending ${money(cash.totalPendingVerification)} | expenses ${money(cash.totalExpenses)} | net ${money(cash.netCash)}`,
  ]);
  checks.push([
    "3. cash: something was actually collected",
    cash.totalCollected > 0,
    `verified settlements = 0  <-- GAP`,
  ]);

  checks.push([
    "4. inspection: no duplicate serials",
    new Set(inspection.map((m) => m.serialNumber)).size === inspection.length,
    `${inspection.length} machines`,
  ]);

  checks.push([
    "5. warranties: expired items NOT flagged as expiring",
    warranties.every((w) => w.daysLeft < 0 ? !w.isExpiringSoon : true),
    `${warranties.filter((w) => w.daysLeft < 0).length} expired, ${warranties.filter((w) => w.isExpiringSoon).length} expiring soon`,
  ]);
  checks.push([
    "5. warranties: at least one still valid",
    warranties.some((w) => w.daysLeft >= 0),
    `${warranties.filter((w) => w.daysLeft >= 0).length} valid of ${warranties.length}  <-- GAP`,
  ]);

  checks.push([
    "6. investors: ownership sums to 100",
    investors.every((r) => r.distributions.reduce((s, d) => s + d.ownershipPct, 0) === 100),
    `${investors.length} cycles`,
  ]);
  checks.push([
    "6. investors: has data",
    investors.length > 0,
    `${investors.length} distribution cycles  <-- GAP`,
  ]);

  checks.push([
    "7. satisfaction: rated <= total requests",
    satisfaction.ratedRequests <= satisfaction.totalRequests,
    `${satisfaction.ratedRequests} rated of ${satisfaction.totalRequests}`,
  ]);
  checks.push([
    "7. satisfaction: has service requests",
    satisfaction.totalRequests > 0,
    `${satisfaction.totalRequests} requests  <-- GAP`,
  ]);

  checks.push([
    "8. spare parts: compatible machines present",
    spareParts.every((p) => p.compatibleMachines.length > 0),
    `${spareParts.filter((p) => p.compatibleMachines.length === 0).length} of ${spareParts.length} without compatibility`,
  ]);

  checks.push([
    "0. overview: totals match the detail loaders",
    overview.totalContracts === contracts.length &&
      overview.totalEngineers === engineers.length &&
      overview.netCash === cash.netCash,
    `contracts ${overview.totalContracts} / engineers ${overview.totalEngineers} / net ${money(overview.netCash)}`,
  ]);
  checks.push([
    "0. overview: expiring count excludes expired",
    overview.expiringWarranties === warranties.filter((w) => w.daysLeft >= 0).length,
    `expiringWarranties = ${overview.expiringWarranties}`,
  ]);

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    if (!ok) failed++;
    console.log(`${ok ? "OK  " : "FAIL"}  ${name}`);
    console.log(`      ${detail}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} passed, ${failed} failed`);
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  });
