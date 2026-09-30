import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Get some engineers and customers for realistic seed data
  const engineers = await prisma.engineer.findMany({ take: 3, select: { id: true, name: true } });
  const customers = await prisma.customer.findMany({ take: 3, select: { id: true, name: true } });
  const users = await prisma.user.findMany({ take: 2, select: { id: true, name: true } });
  const companies = await prisma.company.findMany({ take: 1, select: { id: true } });

  if (engineers.length === 0 || customers.length === 0 || users.length === 0 || companies.length === 0) {
    console.log("Skipping seed: need engineers, customers, users, and companies first");
    return;
  }

  const companyId = companies[0].id;
  const now = new Date();

  const seedData = [
    {
      date: new Date(now.getTime() - 86400000 * 5),
      engineerId: engineers[0].id,
      engineerName: engineers[0].name,
      customerId: customers[0].id,
      customerName: customers[0].name,
      description: "طقم ماكينة + درام موديل MP3055",
      requestedBy: "أحمد محمد",
      movementType: "SALE" as const,
      performedById: users[0].id,
      performedByName: users[0].name,
      companyId,
      createdById: users[0].id,
    },
    {
      date: new Date(now.getTime() - 86400000 * 4),
      engineerId: engineers[1].id,
      engineerName: engineers[1].name,
      customerId: customers[1].id,
      customerName: customers[1].name,
      description: "استبدال - دُرَم وحدة التصوير",
      requestedBy: "محمود علي",
      movementType: "REPLACEMENT" as const,
      performedById: users[0].id,
      performedByName: users[0].name,
      companyId,
      createdById: users[0].id,
    },
    {
      date: new Date(now.getTime() - 86400000 * 3),
      engineerId: engineers[2].id,
      engineerName: engineers[2].name,
      customerId: customers[2].id,
      customerName: customers[2].name,
      description: "مرتجع - طقم صيانة غير مستخدم",
      requestedBy: "سارة أحمد",
      movementType: "RETURN" as const,
      performedById: users[1].id,
      performedByName: users[1].name,
      companyId,
      createdById: users[1].id,
      receivedById: users[0].id,
      receivedByName: users[0].name,
      receivedAt: new Date(now.getTime() - 86400000 * 2),
    },
    {
      date: new Date(now.getTime() - 86400000 * 2),
      engineerId: engineers[0].id,
      engineerName: engineers[0].name,
      customerId: customers[1].id,
      customerName: customers[1].name,
      description: "بيع - وحدة تغذية ورق + رول التقاط",
      requestedBy: "أحمد محمد",
      movementType: "SALE" as const,
      performedById: users[1].id,
      performedByName: users[1].name,
      companyId,
      createdById: users[1].id,
    },
    {
      date: new Date(now.getTime() - 86400000),
      engineerId: engineers[1].id,
      engineerName: engineers[1].name,
      customerId: customers[0].id,
      customerName: customers[0].name,
      description: "استبدال - وحدة الليزر (Scanner Unit)",
      requestedBy: "محمود علي",
      movementType: "REPLACEMENT" as const,
      performedById: users[0].id,
      performedByName: users[0].name,
      companyId,
      createdById: users[0].id,
    },
  ];

  for (const data of seedData) {
    await prisma.workshopPartMovement.create({ data });
  }

  console.log(`Seeded ${seedData.length} workshop part movements`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
