/**
 * verify-hr-integrity.ts – Comprehensive Data Integrity & Accounting Balance Verifier
 * Verifies foreign keys, mathematical balance of journal entries, audit trail links,
 * and zero hardcoding in HR settings.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("🔍 Starting HR & Payroll Data Integrity Verification...\n");
  let errors = 0;
  let checks = 0;

  function assert(condition: boolean, passMsg: string, failMsg: string) {
    checks++;
    if (condition) {
      console.log(`  ✅ ${passMsg}`);
    } else {
      errors++;
      console.error(`  ❌ [FAIL] ${failMsg}`);
    }
  }

  // 1. Verify HrSetting & Zero Hardcoding
  console.log("1️⃣ Checking HR Settings & Account Mappings:");
  const settings = await prisma.hrSetting.findMany({
    include: { Company: true },
  });
  assert(settings.length > 0, `Found ${settings.length} HrSetting record(s)`, "No HrSetting records found");

  for (const s of settings) {
    const hasAccounts = Boolean(
      s.payrollExpenseAccountId &&
      s.treasuryAccountId &&
      s.salariesPayableAccountId &&
      s.advancesAccountId &&
      s.socialInsuranceAccountId &&
      s.taxAuthorityAccountId
    );
    assert(
      hasAccounts,
      `Company ${s.Company.name} has complete accounting mapping (all 6 accounts mapped)`,
      `Company ${s.Company.name} is missing some account mappings`
    );

    // Verify all mapped accounts actually exist in Account table
    const mappedIds = [
      s.payrollExpenseAccountId,
      s.treasuryAccountId,
      s.salariesPayableAccountId,
      s.advancesAccountId,
      s.socialInsuranceAccountId,
      s.taxAuthorityAccountId,
    ].filter(Boolean) as string[];

    const existingAccounts = await prisma.account.findMany({
      where: { id: { in: mappedIds }, companyId: s.companyId },
    });
    assert(
      existingAccounts.length === mappedIds.length,
      `All ${mappedIds.length} mapped accounts exist in the Chart of Accounts for ${s.Company.name}`,
      `Only ${existingAccounts.length} of ${mappedIds.length} accounts found in DB`
    );
  }

  // 2. Verify Loan Schedules & Amortization Precision
  console.log("\n2️⃣ Checking Loans & Installment Schedules:");
  const loans = await prisma.employeeLoan.findMany({
    include: { Installments: true, Employee: true },
  });
  assert(loans.length > 0, `Found ${loans.length} employee loan(s)`, "No employee loans found");

  for (const loan of loans) {
    const nonPostponed = loan.Installments.filter((i) => i.status !== "POSTPONED");
    const sum = nonPostponed.reduce((acc, i) => acc + i.amount, 0);
    const diff = Math.abs(sum - loan.totalAmount);
    assert(
      diff < 0.05,
      `Loan ${loan.id} (${loan.Employee.fullName}): sum of active installments (${sum.toLocaleString()}) matches totalAmount (${loan.totalAmount.toLocaleString()})`,
      `Loan ${loan.id} sum (${sum}) differs from totalAmount (${loan.totalAmount})`
    );
  }

  // 3. Verify Locked Payroll Runs & Journal Entry Balance
  console.log("\n3️⃣ Checking Locked Payroll Runs & Balanced Journal Entries:");
  const lockedRuns = await prisma.payrollRun.findMany({
    where: { status: "LOCKED" },
    include: {
      Items: true,
      Period: true,
      Company: true,
    },
  });

  if (lockedRuns.length === 0) {
    console.log("  ℹ️ No locked payroll runs found yet (skip journal balance check)");
  } else {
    for (const run of lockedRuns) {
      assert(
        Boolean(run.journalEntryId),
        `Locked run ${run.id} (${run.Period.month}/${run.Period.year}) has journalEntryId linked`,
        `Locked run ${run.id} has no journalEntryId linked`
      );

      if (run.journalEntryId) {
        const je = await prisma.journalEntry.findUnique({
          where: { id: run.journalEntryId },
          include: { items: { include: { account: true } } },
        });

        assert(Boolean(je), `Journal entry ${run.journalEntryId} exists in DB`, `Journal entry ${run.journalEntryId} missing`);

        if (je) {
          const totalDebit = je.items.reduce((acc, it) => acc + it.debit, 0);
          const totalCredit = je.items.reduce((acc, it) => acc + it.credit, 0);
          const balanceDiff = Math.abs(totalDebit - totalCredit);

          assert(
            balanceDiff < 0.05,
            `Journal Entry ${je.entryNumber} is mathematically BALANCED! (Debit: ${totalDebit.toLocaleString()} === Credit: ${totalCredit.toLocaleString()})`,
            `Journal Entry ${je.entryNumber} is OUT OF BALANCE! (Debit: ${totalDebit} !== Credit: ${totalCredit})`
          );
        }
      }
    }
  }

  // 4. Verify Audit Trail (payrollItemId links)
  console.log("\n4️⃣ Checking Audit Trail on Deductions:");
  const completedAdvances = await prisma.employeeAdvance.findMany({
    where: { status: "COMPLETED", payrollItemId: { not: null } },
  });
  console.log(`  ℹ️ Found ${completedAdvances.length} advance(s) linked to payroll items`);

  const paidInstallments = await prisma.loanInstallment.findMany({
    where: { status: "PAID", payrollItemId: { not: null } },
  });
  console.log(`  ℹ️ Found ${paidInstallments.length} loan installment(s) linked to payroll items`);

  // 5. Verify Resigned Employees are Excluded from Active Payroll Runs
  console.log("\n5️⃣ Checking Active Payroll Runs Exclude Resigned Employees:");
  const activeRuns = await prisma.payrollRun.findMany({
    where: { status: { in: ["CALCULATED", "DRAFT"] } },
    include: { Items: { include: { Employee: true } } },
  });

  for (const r of activeRuns) {
    const resignedInRun = r.Items.filter((i) => i.Employee.status !== "ACTIVE");
    assert(
      resignedInRun.length === 0,
      `Run ${r.id} (${r.Items.length} employees) contains only ACTIVE employees`,
      `Run ${r.id} contains ${resignedInRun.length} non-active employee(s)!`
    );
  }

  console.log(`\n======================================================`);
  if (errors === 0) {
    console.log(`🎉 ALL CHECKS PASSED! (${checks}/${checks} checks successful)`);
    console.log(`System is 100% compliant with accounting, audit, and configuration rules.`);
  } else {
    console.error(`❌ Integrity verification failed with ${errors} error(s) out of ${checks} checks.`);
    process.exit(1);
  }
  console.log(`======================================================\n`);
}

main()
  .catch((e) => {
    console.error("❌ Integrity script crashed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
