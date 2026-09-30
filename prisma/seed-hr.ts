/**
 * seed-hr.ts – Comprehensive HR & Payroll Seeder
 * Config-driven, zero-hardcoded, mathematically coherent, covers all HR lifecycle scenarios.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";
import {
  calculateMonthlyPayroll,
  approvePayrollRun,
  lockPayrollRun,
} from "../src/lib/services/hr/payroll-service";

const DEPARTMENTS = [
  { code: "GEN", name: "General Management", nameAr: "الإدارة العامة" },
  { code: "ACC", name: "Accounting", nameAr: "المحاسبة" },
  { code: "ADM", name: "Administration", nameAr: "الإدارة" },
  { code: "ENG", name: "Engineering", nameAr: "المهندسين" },
  { code: "TEC", name: "Technicians", nameAr: "الفنيين" },
  { code: "TRA", name: "Apprentices", nameAr: "الطلبة" },
];

const JOB_TITLES = [
  { title: "General Manager", titleAr: "المدير العام" },
  { title: "Accountant", titleAr: "محاسب" },
  { title: "Administrative Manager", titleAr: "المدير الإداري" },
  { title: "Engineer", titleAr: "مهندس" },
  { title: "Technician", titleAr: "فني" },
  { title: "Apprentice", titleAr: "طالب" },
];

async function main() {
  console.log("🌱 Starting Comprehensive HR & Payroll Seed...");
  const passwordHash = await bcrypt.hash("password123", 10);

  // 1. Companies & Departments
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  if (companies.length === 0) {
    console.error("❌ No companies found in database. Run base seed first.");
    process.exit(1);
  }

  for (const company of companies) {
    for (const d of DEPARTMENTS) {
      await prisma.department.upsert({
        where: { companyId_code: { companyId: company.id, code: d.code } },
        update: { name: d.name, nameAr: d.nameAr },
        create: { code: d.code, name: d.name, nameAr: d.nameAr, companyId: company.id },
      });
    }
    for (const jt of JOB_TITLES) {
      const existing = await prisma.jobTitle.findFirst({
        where: { companyId: company.id, title: jt.title },
      });
      if (existing) {
        await prisma.jobTitle.update({
          where: { id: existing.id },
          data: { titleAr: jt.titleAr },
        });
      } else {
        await prisma.jobTitle.create({
          data: { title: jt.title, titleAr: jt.titleAr, companyId: company.id },
        });
      }
    }
  }

  const company1 = companies.find((c) => c.id === "company1") || companies[0];
  console.log(`📌 Primary Company: ${company1.name} (${company1.id})`);

  // 2. Chart of Accounts Setup for HR Payroll Mapping
  console.log("\n💳 Ensuring Chart of Accounts for HR integration...");
  const accountsToEnsure = [
    { code: "1001", name: "الصندوق والخزينة", accountType: "ASSET" as const },
    { code: "1105", name: "سلف العاملين", accountType: "ASSET" as const },
    { code: "2101", name: "مستحقات العاملين - أجور مستحقة", accountType: "LIABILITY" as const },
    { code: "2105", name: "أمانات التأمينات الاجتماعية", accountType: "LIABILITY" as const },
    { code: "2106", name: "مصلحة الضرائب - كسب عمل", accountType: "LIABILITY" as const },
    { code: "5101", name: "مصروف الرواتب والأجور والبدلات", accountType: "EXPENSE" as const },
  ];

  const mappedAccountIds: Record<string, string> = {};

  for (const acc of accountsToEnsure) {
    const existing = await prisma.account.findFirst({
      where: { companyId: company1.id, code: acc.code },
    });
    if (existing) {
      mappedAccountIds[acc.code] = existing.id;
    } else {
      const created = await prisma.account.create({
        data: {
          code: acc.code,
          name: acc.name,
          accountType: acc.accountType,
          companyId: company1.id,
          balance: 0,
        },
      });
      mappedAccountIds[acc.code] = created.id;
      console.log(`  ➕ Created Account: ${acc.code} - ${acc.name}`);
    }
  }

  // 3. Upsert HrSetting with zero hardcoding
  console.log("\n⚙️ Upserting HrSetting configuration...");
  await prisma.hrSetting.upsert({
    where: { companyId: company1.id },
    update: {
      standardWorkingDays: 26,
      dailyWorkingHours: 8,
      overtimeWeekdayRate: 1.5,
      overtimeWeekendRate: 2.0,
      absenceDeductionMultiplier: 1.0,
      lateGraceMinutes: 15,
      maxAdvancePercentOfSalary: 50,
      maxLoanSalaryMultiple: 5,
      insuranceEnabled: true,
      insuranceEmployeeRate: 11.0,
      insuranceCompanyRate: 18.75,
      insuranceMaxSalary: 12600,
      insuranceMinSalary: 2000,
      taxEnabled: true,
      taxPersonalExemption: 20000,
      payrollExpenseAccountId: mappedAccountIds["5101"],
      treasuryAccountId: mappedAccountIds["1001"],
      salariesPayableAccountId: mappedAccountIds["2101"],
      advancesAccountId: mappedAccountIds["1105"],
      loansAccountId: mappedAccountIds["1105"],
      socialInsuranceAccountId: mappedAccountIds["2105"],
      taxAuthorityAccountId: mappedAccountIds["2106"],
    },
    create: {
      companyId: company1.id,
      standardWorkingDays: 26,
      dailyWorkingHours: 8,
      overtimeWeekdayRate: 1.5,
      overtimeWeekendRate: 2.0,
      absenceDeductionMultiplier: 1.0,
      lateGraceMinutes: 15,
      maxAdvancePercentOfSalary: 50,
      maxLoanSalaryMultiple: 5,
      insuranceEnabled: true,
      insuranceEmployeeRate: 11.0,
      insuranceCompanyRate: 18.75,
      insuranceMaxSalary: 12600,
      insuranceMinSalary: 2000,
      taxEnabled: true,
      taxPersonalExemption: 20000,
      payrollExpenseAccountId: mappedAccountIds["5101"],
      treasuryAccountId: mappedAccountIds["1001"],
      salariesPayableAccountId: mappedAccountIds["2101"],
      advancesAccountId: mappedAccountIds["1105"],
      loansAccountId: mappedAccountIds["1105"],
      socialInsuranceAccountId: mappedAccountIds["2105"],
      taxAuthorityAccountId: mappedAccountIds["2106"],
    },
  });
  console.log("  ✅ HrSetting configured and accounts mapped.");

  // Helper getters
  const getDept = async (code: string) => {
    const d = await prisma.department.findUnique({
      where: { companyId_code: { companyId: company1.id, code } },
    });
    if (!d) throw new Error(`Dept ${code} not found`);
    return d;
  };
  const getJT = async (title: string) => {
    const jt = await prisma.jobTitle.findFirst({
      where: { companyId: company1.id, title },
    });
    if (!jt) throw new Error(`JobTitle "${title}" not found`);
    return jt;
  };

  const deptGEN = await getDept("GEN");
  const deptACC = await getDept("ACC");
  const deptADM = await getDept("ADM");
  const deptENG = await getDept("ENG");
  const deptTEC = await getDept("TEC");

  const jtGenMgr = await getJT("General Manager");
  const jtAcct = await getJT("Accountant");
  const jtAdmMgr = await getJT("Administrative Manager");
  const jtEng = await getJT("Engineer");
  const jtTech = await getJT("Technician");

  // Ensure Accountant User
  const hatemUser = await prisma.user.upsert({
    where: { email: "hatem@alex-copier.com" },
    update: { name: "حاتم المحاسب", role: "ACCOUNTANT" },
    create: {
      id: "user-hatem",
      name: "حاتم المحاسب",
      email: "hatem@alex-copier.com",
      passwordHash,
      role: "ACCOUNTANT",
      companyId: company1.id,
    },
  });

  type EmpType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "TRAINEE";
  const upsertEmp = async (data: {
    id: string;
    code: string;
    fingerprintId?: string;
    fullName: string;
    email?: string;
    hireDate: Date;
    employmentType?: EmpType;
    baseSalary: number;
    departmentId: string;
    jobTitleId: string;
    userId?: string;
    status?: "ACTIVE" | "RESIGNED" | "TERMINATED" | "ON_LEAVE" | "SUSPENDED";
    notes?: string;
  }) => {
    const payload = {
      code: data.code,
      fingerprintId: data.fingerprintId ?? null,
      fullName: data.fullName,
      fullNameAr: data.fullName,
      email: data.email ?? null,
      hireDate: data.hireDate,
      employmentType: (data.employmentType ?? "FULL_TIME") as EmpType,
      baseSalary: data.baseSalary,
      companyId: company1.id,
      departmentId: data.departmentId,
      jobTitleId: data.jobTitleId,
      userId: data.userId ?? null,
      notes: data.notes,
      status: data.status || "ACTIVE",
    };
    return prisma.employee.upsert({
      where: { id: data.id },
      update: payload,
      create: {
        id: data.id,
        annualLeaveBalance: 21,
        sickLeaveBalance: 7,
        emergencyLeaveBalance: 5,
        ...payload,
      },
    });
  };

  console.log("\n👥 Upserting test employees...");
  // 1. GM
  const empReza = await upsertEmp({
    id: "emp-reza",
    code: "EMP-GM-001",
    fingerprintId: "001",
    fullName: "رضا عبد الرحمن",
    email: "reza@alex-copier.com",
    hireDate: new Date("2020-01-01"),
    baseSalary: 25000,
    departmentId: deptGEN.id,
    jobTitleId: jtGenMgr.id,
    userId: "user-reza",
    notes: "المدير العام",
  });

  // 2. Active Advance Employee
  const empAmr = await upsertEmp({
    id: "emp-amr-accountant",
    code: "EMP-ACC-001",
    fingerprintId: "010",
    fullName: "عمرو السعدني",
    email: "amr.accountant@alex-copier.com",
    hireDate: new Date("2021-03-01"),
    baseSalary: 12000,
    departmentId: deptACC.id,
    jobTitleId: jtAcct.id,
    userId: "user-amr-accountant",
    notes: "محاسب أول - لديه سلفة نشطة",
  });

  // 3. Employee WITHOUT any loans or advances
  const empHatem = await upsertEmp({
    id: "emp-hatem",
    code: "EMP-ACC-002",
    fingerprintId: "011",
    fullName: "حاتم عثمان",
    email: "hatem@alex-copier.com",
    hireDate: new Date("2022-01-15"),
    baseSalary: 10000,
    departmentId: deptACC.id,
    jobTitleId: jtAcct.id,
    userId: hatemUser.id,
    notes: "محاسب - بدون سلف أو قروض",
  });

  // 4. Percentage Bonus Employee
  const empAdmin = await upsertEmp({
    id: "emp-amr-admin",
    code: "EMP-ADM-001",
    fingerprintId: "020",
    fullName: "عمرو الإداري",
    email: "amr.maintenance@alex-copier.com",
    hireDate: new Date("2021-06-01"),
    baseSalary: 15000,
    departmentId: deptADM.id,
    jobTitleId: jtAdmMgr.id,
    notes: "المدير الإداري - مستحق حافز 10%",
  });

  // 5. Loan Employee with Postponed Installment
  const empEng1 = await upsertEmp({
    id: "emp-eng-1",
    code: "EMP-ENG-001",
    fingerprintId: "101",
    fullName: "أحمد علي",
    email: "ahmed.ali@alex-copier.com",
    hireDate: new Date("2021-02-01"),
    baseSalary: 8000,
    departmentId: deptENG.id,
    jobTitleId: jtEng.id,
    notes: "مهندس صيانة - لديه قرض به قسط مؤجل",
  });

  // 6. Fixed Bonus Employee
  const empEng2 = await upsertEmp({
    id: "emp-eng-2",
    code: "EMP-ENG-002",
    fingerprintId: "102",
    fullName: "محمد حسن",
    email: "mohamed.hassan@alex-copier.com",
    hireDate: new Date("2021-03-15"),
    baseSalary: 9000,
    departmentId: deptENG.id,
    jobTitleId: jtEng.id,
    notes: "مهندس صيانة - مستحق مكافأة ثابتة 1500 ج",
  });

  // 7. Disciplinary Penalty Employee
  const empEng3 = await upsertEmp({
    id: "emp-eng-3",
    code: "EMP-ENG-003",
    fingerprintId: "103",
    fullName: "محمود إبراهيم",
    email: "mahmoud.ibrahim@alex-copier.com",
    hireDate: new Date("2020-11-01"),
    baseSalary: 8500,
    departmentId: deptENG.id,
    jobTitleId: jtEng.id,
    notes: "مهندس صيانة - موقع عليه جزاء يوم غياب غير مبرر",
  });

  // 8. Fixed Penalty Technician
  const empTech1 = await upsertEmp({
    id: "emp-tech-1",
    code: "EMP-TEC-001",
    fingerprintId: "201",
    fullName: "فني حسام",
    hireDate: new Date("2022-06-01"),
    baseSalary: 5000,
    departmentId: deptTEC.id,
    jobTitleId: jtTech.id,
    notes: "فني - موقع عليه خصم إداري ثابت 250 ج",
  });

  // 9. Resigned Employee (must be excluded from current payroll)
  await upsertEmp({
    id: "emp-resigned-1",
    code: "EMP-RES-001",
    fingerprintId: "999",
    fullName: "كريم المستقيل",
    hireDate: new Date("2022-01-01"),
    baseSalary: 7000,
    departmentId: deptENG.id,
    jobTitleId: jtEng.id,
    status: "RESIGNED",
    notes: "موظف مستقيل (2026-06-30) للتأكد من استبعاده من المسير النشط",
  });

  console.log("  ✅ Employees seeded including active, inactive, and various roles.");

  // 4. Seed Advances (Active + Completed)
  console.log("\n💵 Seeding Advances...");
  await prisma.employeeAdvance.upsert({
    where: { id: "adv-completed-reza" },
    update: { status: "COMPLETED" },
    create: {
      id: "adv-completed-reza",
      companyId: company1.id,
      employeeId: empReza.id,
      amount: 3000,
      reason: "سلفة نقدية طارئة شهر 8",
      requestDate: new Date("2026-08-05"),
      deductMonth: 8,
      deductYear: 2026,
      status: "COMPLETED",
      approvedBy: hatemUser.id,
      approvedAt: new Date("2026-08-05"),
      disbursedBy: hatemUser.id,
      disbursedAt: new Date("2026-08-05"),
      disbursementMethod: "CASH",
      treasuryAccountId: mappedAccountIds["1001"],
    },
  });

  await prisma.employeeAdvance.upsert({
    where: { id: "adv-active-amr" },
    update: { status: "APPROVED" },
    create: {
      id: "adv-active-amr",
      companyId: company1.id,
      employeeId: empAmr.id,
      amount: 2000,
      reason: "سلفة مصاريف علاجية شهر 9",
      requestDate: new Date("2026-09-02"),
      deductMonth: 9,
      deductYear: 2026,
      status: "APPROVED",
      approvedBy: hatemUser.id,
      approvedAt: new Date("2026-09-02"),
      disbursedBy: hatemUser.id,
      disbursedAt: new Date("2026-09-02"),
      disbursementMethod: "CASH",
      treasuryAccountId: mappedAccountIds["1001"],
    },
  });
  console.log("  ✅ Completed and active advances seeded.");

  // 5. Seed Scheduled Loan with Postponed Installment
  console.log("\n📊 Seeding Loan with Postponed Installment...");
  await prisma.loanInstallment.deleteMany({
    where: { Loan: { employeeId: empEng1.id } },
  });
  await prisma.employeeLoan.deleteMany({
    where: { employeeId: empEng1.id },
  });

  const loanEng1 = await prisma.employeeLoan.create({
    data: {
      id: "loan-eng-1",
      companyId: company1.id,
      employeeId: empEng1.id,
      totalAmount: 12000,
      installmentCount: 6,
      monthlyAmount: 2000,
      startDate: new Date("2026-08-01"),
      reason: "قرض زواج ميسر 6 أقساط",
      status: "DEDUCTING",
      approvedBy: hatemUser.id,
      approvedAt: new Date("2026-07-28"),
      disbursedBy: hatemUser.id,
      disbursedAt: new Date("2026-08-01"),
      disbursementMethod: "BANK_TRANSFER",
      treasuryAccountId: mappedAccountIds["1001"],
    },
  });

  // Installments:
  // #1: Paid in month 8/2026
  await prisma.loanInstallment.create({
    data: {
      id: "inst-eng1-1",
      loanId: loanEng1.id,
      installmentNo: 1,
      amount: 2000,
      dueDate: new Date("2026-08-01"),
      paidDate: new Date("2026-08-31"),
      paidMonth: 8,
      paidYear: 2026,
      status: "PAID",
    },
  });

  // #2: Postponed in month 9/2026
  await prisma.loanInstallment.create({
    data: {
      id: "inst-eng1-2",
      loanId: loanEng1.id,
      installmentNo: 2,
      amount: 2000,
      dueDate: new Date("2026-09-01"),
      status: "POSTPONED",
      postponedReason: "طلب الموظف تأجيل القسط لظروف عائلية واستحقاق مصروفات دراسية",
      postponedAt: new Date("2026-09-02"),
      postponedBy: hatemUser.id,
    },
  });

  // #3..#6: Regular future installments (due 10/2026, 11/2026, 12/2026, 01/2027)
  const remainingDates = [
    new Date("2026-10-01"),
    new Date("2026-11-01"),
    new Date("2026-12-01"),
    new Date("2027-01-01"),
  ];
  for (let i = 0; i < 4; i++) {
    await prisma.loanInstallment.create({
      data: {
        loanId: loanEng1.id,
        installmentNo: i + 3,
        amount: 2000,
        dueDate: remainingDates[i],
        status: "PENDING_PAY",
      },
    });
  }

  // #7: The Rescheduled Postponed Installment at end of schedule (due 02/2027)
  await prisma.loanInstallment.create({
    data: {
      id: "inst-eng1-7-rescheduled",
      loanId: loanEng1.id,
      installmentNo: 7,
      amount: 2000,
      dueDate: new Date("2027-02-01"),
      status: "PENDING_PAY",
    },
  });
  console.log("  ✅ Loan with 1 paid, 1 postponed, and rescheduled replacement created.");

  // 6. Seed Bonuses
  console.log("\n🎁 Seeding Bonuses (Fixed & Percentage)...");
  await prisma.employeeBonus.deleteMany({
    where: { companyId: company1.id, targetMonth: 9, targetYear: 2026 },
  });

  await prisma.employeeBonus.create({
    data: {
      companyId: company1.id,
      employeeId: empEng2.id,
      title: "مكافأة إنجاز صيانة الورشة المركزية",
      bonusType: "PERFORMANCE",
      calcType: "FIXED_AMOUNT",
      amount: 1500,
      targetMonth: 9,
      targetYear: 2026,
      status: "APPROVED",
      approvedBy: hatemUser.id,
      approvedAt: new Date("2026-09-10"),
    },
  });

  await prisma.employeeBonus.create({
    data: {
      companyId: company1.id,
      employeeId: empAdmin.id,
      title: "حافز تميز إداري ربع سنوي",
      bonusType: "ANNUAL_BONUS",
      calcType: "PERCENTAGE_OF_BASIC",
      percentage: 10, // 10% of 15,000 = 1,500 EGP
      amount: 1500,
      targetMonth: 9,
      targetYear: 2026,
      status: "APPROVED",
      approvedBy: hatemUser.id,
      approvedAt: new Date("2026-09-12"),
    },
  });
  console.log("  ✅ Fixed and percentage bonuses created.");

  // 7. Seed Penalties
  console.log("\n⚠️ Seeding Penalties (Daily deduction & Fixed)...");
  await prisma.employeePenalty.deleteMany({
    where: { companyId: company1.id, targetMonth: 9, targetYear: 2026 },
  });

  await prisma.employeePenalty.create({
    data: {
      companyId: company1.id,
      employeeId: empEng3.id,
      title: "جزاء إداري لعدم الالتزام بقواعد السلامة المهنية",
      penaltyType: "DISCIPLINARY",
      calcType: "DAILY_RATE",
      deductionDays: 1, // 8,500 / 26 = 326.92 EGP
      amount: Math.round((8500 / 26) * 100) / 100,
      targetMonth: 9,
      targetYear: 2026,
      reason: "مخالفة تعليمات السلامة",
      status: "APPROVED",
      approvedBy: hatemUser.id,
      approvedAt: new Date("2026-09-15"),
    },
  });

  await prisma.employeePenalty.create({
    data: {
      companyId: company1.id,
      employeeId: empTech1.id,
      title: "خصم إداري لتأخير تسليم تقرير الصيانة",
      penaltyType: "OTHER",
      calcType: "FIXED_AMOUNT",
      amount: 250,
      targetMonth: 9,
      targetYear: 2026,
      reason: "تأخير التقرير الدوري",
      status: "APPROVED",
      approvedBy: hatemUser.id,
      approvedAt: new Date("2026-09-16"),
    },
  });
  console.log("  ✅ Daily rate and fixed penalties created.");

  // 8. Seed Attendance Records for Month 9/2026
  console.log("\n⏱️ Seeding Attendance Records...");
  const sept2026Start = new Date("2026-09-01");
  await prisma.dailyAttendanceRecord.deleteMany({
    where: {
      Employee: { companyId: company1.id },
      date: { gte: sept2026Start, lte: new Date("2026-09-30") },
    },
  });

  // empEng2 has 4 hours overtime (240 minutes) on 2026-09-05
  await prisma.dailyAttendanceRecord.create({
    data: {
      employeeId: empEng2.id,
      date: new Date("2026-09-05"),
      status: "PRESENT",
      firstIn: new Date("2026-09-05T08:00:00Z"),
      lastOut: new Date("2026-09-05T20:00:00Z"),
      workedMinutes: 720,
      overtimeMin: 240,
    },
  });

  // empEng3 has 1 day unexcused absence on 2026-09-14
  await prisma.dailyAttendanceRecord.create({
    data: {
      employeeId: empEng3.id,
      date: new Date("2026-09-14"),
      status: "ABSENT",
      lateMinutes: 0,
    },
  });

  // empTech1 has 45 minutes late arrival on 2026-09-10
  await prisma.dailyAttendanceRecord.create({
    data: {
      employeeId: empTech1.id,
      date: new Date("2026-09-10"),
      status: "LATE",
      firstIn: new Date("2026-09-10T08:45:00Z"),
      lastOut: new Date("2026-09-10T16:00:00Z"),
      lateMinutes: 45,
      workedMinutes: 435,
    },
  });
  console.log("  ✅ Attendance records with overtime, absence, and late seeded.");

  // 9. Process and Lock Historical Payroll Run (Month 8 / 2026)
  console.log("\n🔒 Processing & Locking Historical Payroll Run (Month 8 / 2026)...");
  try {
    const historicalRun = await calculateMonthlyPayroll(company1.id, 8, 2026, hatemUser.id);
    if (historicalRun) {
      await approvePayrollRun(historicalRun.id, hatemUser.id);
      const lockedRun = await lockPayrollRun(historicalRun.id, hatemUser.id);
      console.log(`  ✅ Historical Month 8/2026 Payroll LOCKED.`);
      console.log(`     Journal Entry ID: ${lockedRun.journalEntry?.id || lockedRun.journalEntry?.entryNumber}`);
    }
  } catch (err: unknown) {
    console.warn(`  ⚠️ Could not lock month 8: ${(err as Error).message}`);
  }

  // 10. Process Draft / Review Payroll Run (Month 9 / 2026)
  console.log("\n📋 Processing Current Active Payroll Run (Month 9 / 2026)...");
  const draftRun = await calculateMonthlyPayroll(company1.id, 9, 2026, hatemUser.id);
  if (!draftRun) throw new Error("فشل احتساب مسير شهر 9");

  console.log(`  ✅ Month 9/2026 Payroll Run Calculated (Status: ${draftRun.status}).`);
  console.log(`     Total Employees in Run: ${draftRun.employeeCount || draftRun.Items?.length || 0}`);
  console.log(`     Total Gross: ${draftRun.totalGross.toLocaleString()} EGP`);
  console.log(`     Total Net: ${draftRun.totalNet.toLocaleString()} EGP`);
  console.log(`     Total Advances Deducted: ${draftRun.totalAdvances.toLocaleString()} EGP`);
  console.log(`     Total Bonuses: ${draftRun.totalBonuses.toLocaleString()} EGP`);
  console.log(`     Total Penalties: ${draftRun.totalPenalties.toLocaleString()} EGP`);

  console.log("\n🎉 HR & Payroll Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });