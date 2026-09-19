require("dotenv/config");
const { PrismaClient } = require("../src/generated/prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const c = await prisma.customer.findFirst({
    where: { name: "وليد الطحان" },
    include: { payments: true },
  });
  console.log("Before:", c.name, "total=" + c.totalDebt, "remaining=" + c.remainingDebt, "payments=" + c.payments.length);
  c.payments.forEach(p => console.log("  -", p.amount, p.paymentDate.toISOString().slice(0, 10)));

  // Delete all existing payments
  await prisma.customerPayment.deleteMany({ where: { customerId: c.id } });

  // Update customer: totalDebt = 4000 (last payment) + 1000 (remaining) = 5000
  await prisma.customer.update({
    where: { id: c.id },
    data: { totalDebt: 5000, remainingDebt: 1000, lastPaymentDate: new Date("2026-08-09") },
  });

  // Create single payment record
  await prisma.customerPayment.create({
    data: { customerId: c.id, amount: 4000, paymentDate: new Date("2026-08-09"), notes: "دفعة مسجلة" },
  });

  const updated = await prisma.customer.findFirst({
    where: { name: "وليد الطحان" },
    include: { payments: true },
  });
  console.log("After:", updated.name, "total=" + updated.totalDebt, "remaining=" + updated.remainingDebt, "payments=" + updated.payments.length);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
