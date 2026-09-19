import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  
  try {
    const returns = await prisma.returnTransaction.findMany({
      include: {
        company: true,
        customer: true,
        supplier: true,
        product: true,
        warehouse: true,
        salesOrder: { select: { id: true } },
        salesOrderItem: { select: { id: true, unitPrice: true, quantity: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    console.log("Returns:", returns.length);
    console.log(JSON.stringify(returns[0], null, 2));
  } catch (e) {
    console.error("GET ERROR:", e);
  }

  // Test sales-orders endpoint
  try {
    const orders = await prisma.salesOrder.findMany({
      where: { companyId: "company1" },
      include: {
        customer: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, pricingTiers: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    console.log("\nSales orders for company1:", orders.length);
    if (orders[0]) {
      console.log("First order items:", orders[0].items.length);
      console.log("First item product:", JSON.stringify(orders[0].items[0]?.product, null, 2));
    }
  } catch (e) {
    console.error("SALES-ORDERS ERROR:", e);
  }

  await prisma.$disconnect();
}

main();
