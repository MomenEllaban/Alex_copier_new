// Read-only snapshot of the shared (Neon) database so the seed can be written
// against what is actually there rather than against assumptions.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, nameAr: true, _count: { select: { users: true, employees: true, departments: true } } },
  });
  console.log("=== COMPANIES ===");
  console.log(JSON.stringify(companies, null, 1));

  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true, role: true, roleId: true, isActive: true, companyId: true,
      engineer: { select: { id: true, name: true } },
      employee: { select: { id: true, fullName: true, code: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log("\n=== USERS ===");
  for (const u of users) {
    console.log(
      `  ${u.name.padEnd(22)} ${u.email.padEnd(38)} role=${u.role.padEnd(18)} roleId=${u.roleId ? "set" : "null"} ` +
      `active=${u.isActive} eng=${u.engineer?.name ?? "-"} emp=${u.employee?.code ?? "-"}`,
    );
  }
  console.log(`  total users = ${users.length}`);

  const roles = await prisma.role.findMany({
    select: { key: true, name: true, isSystem: true, sortOrder: true, _count: { select: { users: true, pages: true } } },
    orderBy: { sortOrder: "asc" },
  });
  console.log("\n=== ROLES ===");
  roles.forEach((r) => console.log(`  ${r.key.padEnd(20)} users=${String(r._count.users).padEnd(4)} pages=${r._count.pages} system=${r.isSystem}`));

  console.log("\n=== ENGINEERS ===");
  const engineers = await prisma.engineer.findMany({
    select: {
      id: true, name: true, email: true, isActive: true, userId: true,
      employee: { select: { code: true, fullName: true, Department: { select: { code: true } } } },
      _count: { select: { customers: true, serviceRequests: true } },
    },
    orderBy: { name: "asc" },
  });
  engineers.forEach((e) =>
    console.log(`  ${e.name.padEnd(22)} user=${e.userId ? "yes" : "NO "} emp=${e.employee?.code ?? "-"} cust=${String(e._count.customers).padEnd(5)} req=${e._count.serviceRequests}`),
  );
  console.log(`  total engineers = ${engineers.length}`);

  console.log("\n=== EMPLOYEES ===");
  const employees = await prisma.employee.findMany({
    select: {
      code: true, fullName: true, status: true, userId: true, engineerId: true, companyId: true,
      Department: { select: { code: true, nameAr: true } }, JobTitle: { select: { title: true, titleAr: true } },
    },
    orderBy: { code: "asc" },
  });
  employees.forEach((e) =>
    console.log(`  ${e.code.padEnd(12)} ${(e.fullName ?? "").padEnd(24)} dept=${e.Department?.code ?? "-"} job=${e.JobTitle?.titleAr ?? "-"} user=${e.userId ? "yes" : "no"} eng=${e.engineerId ? "yes" : "no"}`),
  );
  console.log(`  total employees = ${employees.length}`);

  console.log("\n=== DEPARTMENTS / JOB TITLES (first company) ===");
  const c0 = companies[0]?.id;
  if (c0) {
    const deps = await prisma.department.findMany({
      where: { companyId: c0 },
      select: { code: true, name: true, nameAr: true, _count: { select: { Employees: true } } },
      orderBy: { code: "asc" },
    });
    deps.forEach((d) => console.log(`  dept ${d.code.padEnd(6)} ${(d.nameAr ?? d.name).padEnd(20)} employees=${d._count.Employees}`));
    const jts = await prisma.jobTitle.findMany({ where: { companyId: c0 }, select: { title: true, titleAr: true, _count: { select: { Employees: true } } } });
    jts.forEach((j) => console.log(`  job  ${(j.titleAr ?? j.title).padEnd(24)} employees=${j._count.Employees}`));
  }

  const [cust, mach, req] = await Promise.all([
    prisma.customer.count(), prisma.machine.count(), prisma.serviceRequest.count(),
  ]);
  console.log(`\n=== BUSINESS === customers=${cust} machines=${mach} serviceRequests=${req}`);

  const empCodes = employees.map((e) => e.code);
  const maxNum = empCodes.reduce((m, c) => {
    const mm = /^EMP-?0*(\d+)$/i.exec(c);
    return mm && Number(mm[1]) > m ? Number(mm[1]) : m;
  }, 0);
  console.log(`\nhighest numeric employee code suffix = ${maxNum}`);
  console.log(`existing employee code sample = ${empCodes.slice(0, 5).join(", ") || "(none)"}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
