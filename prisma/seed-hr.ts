import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DEPARTMENTS = [
  { code: "GEN", name: "General Management", nameAr: "المدير العام" },
  { code: "ACC", name: "Accounting", nameAr: "المحاسبين" },
  { code: "ADM", name: "Administration", nameAr: "المدير الإداري" },
  { code: "ENG", name: "Engineering", nameAr: "مهندسين" },
  { code: "TEC", name: "Technicians", nameAr: "فنيين" },
  { code: "TRA", name: "Apprentices", nameAr: "الطلبه" },
];

const JOB_TITLES = [
  { title: "General Manager", titleAr: "المدير العام" },
  { title: "Accountant", titleAr: "المحاسبين" },
  { title: "Administrative Manager", titleAr: "المدير الإداري" },
  { title: "Engineer", titleAr: "مهندسين" },
  { title: "Technician", titleAr: "فنيين" },
  { title: "Apprentice", titleAr: "الطلبه" },
];

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });

  for (const company of companies) {
    for (const d of DEPARTMENTS) {
      const existing = await prisma.department.findUnique({
        where: { companyId_code: { companyId: company.id, code: d.code } },
      });
      if (existing) {
        await prisma.department.update({
          where: { id: existing.id },
          data: { name: d.name, nameAr: d.nameAr },
        });
        console.log(`department updated: ${d.code} @ ${company.name}`);
      } else {
        await prisma.department.create({
          data: { code: d.code, name: d.name, nameAr: d.nameAr, companyId: company.id },
        });
        console.log(`department created: ${d.code} (${d.nameAr}) @ ${company.name}`);
      }
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
        console.log(`jobTitle updated: ${jt.title} @ ${company.name}`);
      } else {
        await prisma.jobTitle.create({
          data: { title: jt.title, titleAr: jt.titleAr, companyId: company.id },
        });
        console.log(`jobTitle created: ${jt.title} (${jt.titleAr}) @ ${company.name}`);
      }
    }
  }

  console.log("HR seed completed.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  });