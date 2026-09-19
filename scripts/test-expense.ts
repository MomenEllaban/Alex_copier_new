import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const company = await prisma.company.findFirst();
  const user = await prisma.user.findFirst();
  console.log("company:", company?.id, company?.name);
  console.log("user:", user?.id, user?.name);

  if (!company || !user) {
    console.log("MISSING company or user - cannot test create");
    return;
  }

  console.log("--- attempting create with valid data ---");
  const expense = await prisma.expense.create({
    data: {
      companyId: company.id,
      category: "test-cat",
      description: "test-desc",
      amount: 100,
      paidBy: user.id,
    },
    include: {
      company: true,
      payer: { select: { id: true, name: true } },
    },
  });
  console.log("CREATE OK:", expense.id, "paidBy:", expense.paidBy, "payer:", expense.payer?.name);
  console.log("--- deleting test row ---");
  await prisma.expense.delete({ where: { id: expense.id } });
  console.log("DELETE OK");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
