import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const key = await prisma.user.findMany({
    where: { email: { in: ["reza@alex-copier.com", "amr.accountant@alex-copier.com", "hatem.accountant@alex-copier.com", "amr.manager@alex-copier.com", "amr.maintenance@alex-copier.com", "accountant@alex-copier.com"] } },
    select: { name: true, email: true, role: true, companyId: true, company: { select: { name: true } } },
  });
  console.log("=== named accounts and their company ===");
  key.forEach((u) => console.log(`  ${u.name.padEnd(10)} ${u.email.padEnd(34)} ${u.role.padEnd(18)} company=${u.companyId ?? "NULL"} (${u.company?.name ?? "-"})`));

  const byCompany = await prisma.user.groupBy({ by: ["companyId", "role"], _count: { _all: true } });
  console.log("\n=== users per company x role ===");
  byCompany.sort((a, b) => (a.companyId ?? "").localeCompare(b.companyId ?? "") || a.role.localeCompare(b.role))
    .forEach((g) => console.log(`  ${(g.companyId ?? "NULL").padEnd(10)} ${g.role.padEnd(20)} ${g._count._all}`));

  // Does the employee HR screen reach engineers today? TraineeInfo is the
  // apprentice/"طلبه" model, so check whether any exist.
  const trainees = await prisma.traineeInfo.count();
  const shifts = await prisma.shift.count();
  const salComps = await prisma.salaryComponent.count();
  console.log(`\ntraineeInfo=${trainees} shifts=${shifts} salaryComponents=${salComps}`);

  const engWithCompany = await prisma.engineer.findFirst({
    select: { id: true, name: true, user: { select: { companyId: true } } },
  });
  console.log(`sample engineer user.companyId = ${engWithCompany?.user?.companyId ?? "NULL"} (${engWithCompany?.name})`);

  // Highest employee code and how many codes per company so the new run can continue.
  const perCompany = await prisma.employee.groupBy({ by: ["companyId"], _count: { _all: true } });
  perCompany.forEach((p) => console.log(`  employees in ${p.companyId}: ${p._count._all}`));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
