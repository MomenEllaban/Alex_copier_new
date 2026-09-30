-- CreateEnum
CREATE TYPE "MachineReplacementReason" AS ENUM ('CUSTOMER_REQUEST', 'MACHINE_DEFECTIVE', 'UPGRADE', 'CONTRACT_ENDED', 'OTHER');

-- CreateTable
CREATE TABLE "MachineReplacement" (
    "id" TEXT NOT NULL,
    "oldMachineId" TEXT NOT NULL,
    "newMachineId" TEXT,
    "contractId" TEXT,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "tradeInValue" DOUBLE PRECISION,
    "condition" TEXT,
    "reason" "MachineReplacementReason" NOT NULL DEFAULT 'CUSTOMER_REQUEST',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineReplacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MachineReplacement_companyId_createdAt_idx" ON "MachineReplacement"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "MachineReplacement_contractId_idx" ON "MachineReplacement"("contractId");

-- CreateIndex
CREATE INDEX "MachineReplacement_oldMachineId_idx" ON "MachineReplacement"("oldMachineId");

-- AddForeignKey
ALTER TABLE "MachineReplacement" ADD CONSTRAINT "MachineReplacement_oldMachineId_fkey" FOREIGN KEY ("oldMachineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineReplacement" ADD CONSTRAINT "MachineReplacement_newMachineId_fkey" FOREIGN KEY ("newMachineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineReplacement" ADD CONSTRAINT "MachineReplacement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineReplacement" ADD CONSTRAINT "MachineReplacement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineReplacement" ADD CONSTRAINT "MachineReplacement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineReplacement" ADD CONSTRAINT "MachineReplacement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineReplacement" ADD CONSTRAINT "MachineReplacement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
