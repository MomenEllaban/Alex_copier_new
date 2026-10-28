import { prisma } from "../src/lib/prisma";

async function main() {
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%payment%'
  `;
  console.log("Existing payment tables:", tables.map((t) => t.table_name));

  // Check if SupplierPayment table exists
  const hasSupplierPayment = tables.some((t) => t.table_name.toLowerCase() === "supplierpayment");
  if (!hasSupplierPayment) {
    console.log("Creating SupplierPayment table...");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SupplierPayment" (
        "id" TEXT NOT NULL,
        "supplierId" TEXT NOT NULL,
        "companyId" TEXT,
        "amount" DOUBLE PRECISION NOT NULL,
        "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
        "docNumber" TEXT,
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "SupplierPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SupplierPayment_supplierId_paymentDate_idx" ON "SupplierPayment"("supplierId", "paymentDate");
    `);
    console.log("SupplierPayment table created successfully!");
  } else {
    console.log("SupplierPayment table already exists.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
