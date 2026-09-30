import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  calculateMonthlyPayroll,
  approvePayrollRun,
  lockPayrollRun,
} from "../src/lib/services/hr/payroll-service";

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      options[key] = value ?? "true";
    }
  }

  return options;
}

async function main() {
  const opts = parseArgs();

  // Find target company
  let companyId = opts.companyId;
  if (!companyId) {
    const comp = await prisma.company.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    if (!comp) {
      console.error("❌ لا توجد أي شركة مسجلة بالنظام.");
      process.exit(1);
    }
    companyId = comp.id;
    console.log(`ℹ️ لم يتم تحديد --companyId، تم اختيار الشركة تلقائياً: ${comp.name} (${comp.id})`);
  }

  // Find actor / user
  let actorId = opts.actorId;
  if (!actorId) {
    const admin = await prisma.user.findFirst({
      where: { role: { in: ["GENERAL_MANAGER", "COMPANY_MANAGER", "ACCOUNTANT"] } },
      select: { id: true, name: true, role: true },
    });
    actorId = admin?.id || "system-cli";
    console.log(`ℹ️ المنفذ (Actor): ${admin?.name || "System CLI"} (${actorId})`);
  }

  const now = new Date();
  const month = opts.month ? parseInt(opts.month, 10) : now.getMonth() + 1;
  const year = opts.year ? parseInt(opts.year, 10) : now.getFullYear();
  const action = (opts.action || "calculate").toLowerCase();

  console.log(`\n======================================================`);
  console.log(`🚀 بدء تشغيل سكريبت احتساب الرواتب الشهري (HR Payroll CLI)`);
  console.log(`📅 الفترة: شهر ${month} / سنة ${year}`);
  console.log(`🎯 الإجراء المطلوب: ${action.toUpperCase()}`);
  console.log(`======================================================\n`);

  // Step 1: Calculate Payroll (Idempotent)
  console.log(`⏳ جاري احتساب كشف الرواتب وتحديث البنود...`);
  const run = await calculateMonthlyPayroll(companyId, month, year, actorId);
  if (!run) throw new Error("فشل احتساب مسير الرواتب.");

  console.log(`✅ تم الاحتساب بنجاح!`);
  console.log(`معرف المسير: ${run.id}`);
  console.log(`الحالة الحالية: ${run.status}`);
  console.log(`عدد الموظفين في المسير: ${run.employeeCount || run.Items?.length || 0}`);

  // Print Summary Table
  console.log(`\n📊 ملخص المسير المالي:`);
  console.table([
    { البند: "إجمالي الراتب الأساسي", القيمة: `${run.totalBasic.toLocaleString()} ج.م` },
    { البند: "إجمالي البدلات الثابتة", القيمة: `${run.totalAllowances.toLocaleString()} ج.م` },
    { البند: "إجمالي الحوافز والمكافآت", القيمة: `${run.totalBonuses.toLocaleString()} ج.م` },
    { البند: "إجمالي أجر العمل الإضافي", القيمة: `${run.totalOvertime.toLocaleString()} ج.م` },
    { البند: "إجمالي الأجور الإجمالية (Gross)", القيمة: `${run.totalGross.toLocaleString()} ج.م` },
    { البند: "خصومات الغياب", القيمة: `-${run.totalAbsenceDeductions.toLocaleString()} ج.م` },
    { البند: "خصومات التأخير", القيمة: `-${run.totalLateDeductions.toLocaleString()} ج.م` },
    { البند: "الجزاءات والخصومات الإدارية", القيمة: `-${run.totalPenalties.toLocaleString()} ج.م` },
    { البند: "سلف نقدية مستقطعة", القيمة: `-${run.totalAdvances.toLocaleString()} ج.م` },
    { البند: "أقساط قروض مستقطعة", القيمة: `-${run.totalLoanInstallments.toLocaleString()} ج.م` },
    { البند: "تأمينات اجتماعية (حصة الموظف)", القيمة: `-${run.totalEmployeeInsurance.toLocaleString()} ج.م` },
    { البند: "ضريبة كسب العمل", القيمة: `-${run.totalTax.toLocaleString()} ج.م` },
    { البند: "صافي الأجور المستحقة للصرف (Net)", القيمة: `${run.totalNet.toLocaleString()} ج.م` },
    { البند: "تأمينات اجتماعية (حصة الشركة)", القيمة: `${run.totalCompanyInsurance.toLocaleString()} ج.م` },
  ]);

  // Step 2: Handle Approve
  if (action === "approve" || action === "lock") {
    if (run.status === "CALCULATED" || run.status === "DRAFT") {
      console.log(`\n⏳ جاري اعتماد المسير...`);
      const approved = await approvePayrollRun(run.id, actorId);
      console.log(`✅ تم اعتماد المسير بنجاح! الحالة: ${approved.status}`);
    } else {
      console.log(`ℹ️ المسير بالفعل بحالة: ${run.status}`);
    }
  }

  // Step 3: Handle Lock
  if (action === "lock") {
    if (run.status !== "LOCKED") {
      console.log(`\n⏳ جاري قفل المسير وتوليد القيد المحاسبي المتوازن وتحديث الأقساط والسلف...`);
      const locked = await lockPayrollRun(run.id, actorId);
      console.log(`🔒 تم قفل المسير بنجاح وتوليد القيد المحاسبي!`);
      console.log(`الحالة النهائية: ${locked.run.status}`);
      console.log(`معرف القيد المحاسبي: ${locked.journalEntry?.id || locked.journalEntry?.entryNumber}`);
    } else {
      console.log(`ℹ️ المسير مقفل مسبقاً (LOCKED). لا يمكن إعادة القفل.`);
    }
  }

  console.log(`\n🏁 اكتملت العملية بنجاح.\n`);
}

main()
  .catch((err) => {
    console.error("❌ حدث خطأ أثناء تنفيذ سكريبت المسير:", err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
