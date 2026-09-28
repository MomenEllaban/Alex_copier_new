/**
 * seed-hr.ts – HR Seed (Departments, JobTitles, Employees)
 */
import 'dotenv/config';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const DEPARTMENTS = [
  { code: 'GEN', name: 'General Management',  nameAr: 'الإدارة العامة' },
  { code: 'ACC', name: 'Accounting',           nameAr: 'المحاسبة' },
  { code: 'ADM', name: 'Administration',        nameAr: 'الإدارة' },
  { code: 'ENG', name: 'Engineering',           nameAr: 'المهندسين' },
  { code: 'TEC', name: 'Technicians',           nameAr: 'الفنيين' },
  { code: 'TRA', name: 'Apprentices',           nameAr: 'الطلبة' },
];

const JOB_TITLES = [
  { title: 'General Manager',         titleAr: 'المدير العام' },
  { title: 'Accountant',              titleAr: 'محاسب' },
  { title: 'Administrative Manager',  titleAr: 'المدير الإداري' },
  { title: 'Engineer',                titleAr: 'مهندس' },
  { title: 'Technician',              titleAr: 'فني' },
  { title: 'Apprentice',              titleAr: 'طالب' },
];

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma  = new PrismaClient({ adapter });
  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Upsert Departments + JobTitles for ALL companies
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });

  for (const company of companies) {
    for (const d of DEPARTMENTS) {
      const existing = await prisma.department.findUnique({
        where: { companyId_code: { companyId: company.id, code: d.code } },
      });
      if (existing) {
        await prisma.department.update({ where: { id: existing.id }, data: { name: d.name, nameAr: d.nameAr } });
        console.log(`  updated dept: ${d.code} @ ${company.name}`);
      } else {
        await prisma.department.create({ data: { code: d.code, name: d.name, nameAr: d.nameAr, companyId: company.id } });
        console.log(`  created dept: ${d.code} (${d.nameAr}) @ ${company.name}`);
      }
    }
    for (const jt of JOB_TITLES) {
      const existing = await prisma.jobTitle.findFirst({ where: { companyId: company.id, title: jt.title } });
      if (existing) {
        await prisma.jobTitle.update({ where: { id: existing.id }, data: { titleAr: jt.titleAr } });
      } else {
        await prisma.jobTitle.create({ data: { title: jt.title, titleAr: jt.titleAr, companyId: company.id } });
        console.log(`  created jobTitle: ${jt.title} @ ${company.name}`);
      }
    }
  }

  // 2. Employees – company1 only
  const company1 = companies.find((c) => c.id === 'company1');
  if (!company1) {
    console.warn('company1 not found – run main seed first');
    await prisma.$disconnect();
    return;
  }

  const getDept = async (code: string) => {
    const d = await prisma.department.findUnique({ where: { companyId_code: { companyId: company1.id, code } } });
    if (!d) throw new Error(`Dept ${code} not found`);
    return d;
  };
  const getJT = async (title: string) => {
    const jt = await prisma.jobTitle.findFirst({ where: { companyId: company1.id, title } });
    if (!jt) throw new Error(`JobTitle "${title}" not found`);
    return jt;
  };

  const deptGEN = await getDept('GEN');
  const deptACC = await getDept('ACC');
  const deptADM = await getDept('ADM');
  const deptENG = await getDept('ENG');
  const deptTEC = await getDept('TEC');
  const deptTRA = await getDept('TRA');

  const jtGenMgr = await getJT('General Manager');
  const jtAcct   = await getJT('Accountant');
  const jtAdmMgr = await getJT('Administrative Manager');
  const jtEng    = await getJT('Engineer');
  const jtTech   = await getJT('Technician');
  const jtAppr   = await getJT('Apprentice');

  type EmpType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'TRAINEE';

  const upsertEmp = async (data: {
    id: string; code: string; fingerprintId?: string;
    fullName: string; email?: string; hireDate: Date;
    employmentType?: EmpType;
    baseSalary: number; departmentId: string; jobTitleId: string;
    userId?: string; engineerId?: string; notes?: string;
  }) => {
    const payload = {
      code: data.code,
      fingerprintId: data.fingerprintId ?? null,
      fullName: data.fullName,
      fullNameAr: data.fullName,
      email: data.email ?? null,
      hireDate: data.hireDate,
      employmentType: (data.employmentType ?? 'FULL_TIME') as EmpType,
      baseSalary: data.baseSalary,
      companyId: company1.id,
      departmentId: data.departmentId,
      jobTitleId: data.jobTitleId,
      userId: data.userId ?? null,
      engineerId: data.engineerId ?? null,
      notes: data.notes,
      status: 'ACTIVE' as const,
    };
    const existing = await prisma.employee.findUnique({ where: { id: data.id } });
    if (existing) {
      await prisma.employee.update({ where: { id: data.id }, data: payload });
      console.log(`  updated emp: ${data.code} - ${data.fullName}`);
    } else {
      await prisma.employee.create({
        data: { id: data.id, annualLeaveBalance: 21, sickLeaveBalance: 7, emergencyLeaveBalance: 5, ...payload },
      });
      console.log(`  created emp: ${data.code} - ${data.fullName}`);
    }
  };

  // Ensure user-hatem exists
  await prisma.user.upsert({
    where:  { email: 'hatem@alex-copier.com' },
    update: { name: 'حاتم', role: 'ACCOUNTANT' },
    create: { id: 'user-hatem', name: 'حاتم', email: 'hatem@alex-copier.com', passwordHash, role: 'ACCOUNTANT', companyId: company1.id },
  });

  console.log('\n--- Creating employees ---\n');

  await upsertEmp({ id: 'emp-reza',           code: 'EMP-GM-001',  fingerprintId: '001', fullName: 'رضا',   email: 'reza@alex-copier.com',             hireDate: new Date('2020-01-01'), baseSalary: 25000, departmentId: deptGEN.id, jobTitleId: jtGenMgr.id, userId: 'user-reza',              notes: 'المدير العام' });
  await upsertEmp({ id: 'emp-amr-accountant', code: 'EMP-ACC-001', fingerprintId: '010', fullName: 'عمرو', email: 'amr.accountant@alex-copier.com',   hireDate: new Date('2021-03-01'), baseSalary: 12000, departmentId: deptACC.id, jobTitleId: jtAcct.id,   userId: 'user-amr-accountant',  notes: 'محاسب أول' });
  await upsertEmp({ id: 'emp-hatem',          code: 'EMP-ACC-002', fingerprintId: '011', fullName: 'حاتم', email: 'hatem@alex-copier.com',             hireDate: new Date('2022-01-15'), baseSalary: 10000, departmentId: deptACC.id, jobTitleId: jtAcct.id,   userId: 'user-hatem',           notes: 'محاسب ثاني' });
  await upsertEmp({ id: 'emp-amr-admin',      code: 'EMP-ADM-001', fingerprintId: '020', fullName: 'عمرو', email: 'amr.maintenance@alex-copier.com',  hireDate: new Date('2021-06-01'), baseSalary: 15000, departmentId: deptADM.id, jobTitleId: jtAdmMgr.id, userId: 'user-amr-maintenance', notes: 'المدير الإداري' });

  // Engineers linked to Engineer + User records
  const engLinks = [
    { empId: 'emp-eng-1', code: 'EMP-ENG-001', fp: '101', engId: 'eng-1', email: 'ahmed.ali@alex-copier.com',       name: 'أحمد علي',      sal: 8000, hire: new Date('2021-02-01') },
    { empId: 'emp-eng-2', code: 'EMP-ENG-002', fp: '102', engId: 'eng-2', email: 'mohamed.hassan@alex-copier.com',  name: 'محمد حسن',      sal: 9000, hire: new Date('2021-03-15') },
    { empId: 'emp-eng-3', code: 'EMP-ENG-003', fp: '103', engId: 'eng-3', email: 'mahmoud.ibrahim@alex-copier.com', name: 'محمود إبراهيم', sal: 8500, hire: new Date('2020-11-01') },
    { empId: 'emp-eng-4', code: 'EMP-ENG-004', fp: '104', engId: 'eng-4', email: 'hassan.khaled@alex-copier.com',   name: 'حسن خالد',      sal: 7500, hire: new Date('2022-01-10') },
    { empId: 'emp-eng-5', code: 'EMP-ENG-005', fp: '105', engId: 'eng-5', email: 'omar.saeed@alex-copier.com',      name: 'عمرو سعيد',     sal: 8000, hire: new Date('2021-07-01') },
    { empId: 'emp-eng-6', code: 'EMP-ENG-006', fp: '106', engId: 'eng-6', email: 'yasser.mohamed@alex-copier.com',  name: 'ياسر محمد',     sal: 7000, hire: new Date('2023-01-01') },
  ];
  for (const e of engLinks) {
    const user = await prisma.user.findFirst({ where: { email: e.email } });
    const eng  = await prisma.engineer.findUnique({ where: { id: e.engId } });
    if (!user) { console.warn(`  WARN: user not found for engineer ${e.name}`); continue; }
    if (!eng)  { console.warn(`  WARN: engineer ${e.engId} not found`); continue; }
    await upsertEmp({ id: e.empId, code: e.code, fingerprintId: e.fp, fullName: e.name, email: e.email, hireDate: e.hire, baseSalary: e.sal, departmentId: deptENG.id, jobTitleId: jtEng.id, userId: user.id, engineerId: e.engId, notes: 'مهندس صيانة' });
  }

  // Technicians (10)
  for (let i = 1; i <= 10; i++) {
    const name  = `فني ${i}`;
    const email = `tech${i}@alex-copier.com`;
    const uid   = `user-tech-${i}`;
    await prisma.user.upsert({ where: { email }, update: { name, role: 'EMPLOYEE' }, create: { id: uid, name, email, passwordHash, role: 'EMPLOYEE', companyId: company1.id } });
    await upsertEmp({ id: `emp-tech-${i}`, code: `EMP-TEC-${String(i).padStart(3,'0')}`, fingerprintId: String(200+i), fullName: name, email, hireDate: new Date('2022-06-01'), baseSalary: 5000, departmentId: deptTEC.id, jobTitleId: jtTech.id, userId: uid, notes: 'يمكن تعديل الاسم' });
  }

  // Apprentices (5)
  for (let i = 1; i <= 5; i++) {
    const name  = `طالب ${i}`;
    const email = `trainee${i}@alex-copier.com`;
    const uid   = `user-trainee-${i}`;
    await prisma.user.upsert({ where: { email }, update: { name, role: 'EMPLOYEE' }, create: { id: uid, name, email, passwordHash, role: 'EMPLOYEE', companyId: company1.id } });
    await upsertEmp({ id: `emp-trainee-${i}`, code: `EMP-TRA-${String(i).padStart(3,'0')}`, fingerprintId: String(300+i), fullName: name, email, employmentType: 'TRAINEE', hireDate: new Date('2025-09-01'), baseSalary: 2000, departmentId: deptTRA.id, jobTitleId: jtAppr.id, userId: uid, notes: 'يمكن تعديل الاسم' });
  }

  const empCount = await prisma.employee.count({ where: { companyId: company1.id } });
  console.log(`\nHR Seed done. Employees in company1: ${empCount}`);
  console.log('  رضا (GM-001) | عمرو+حاتم (ACC) | عمرو (ADM) | 6 ENG | 10 TEC | 5 TRA');

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('HR Seed FAILED:', e);
    process.exit(1);
  });