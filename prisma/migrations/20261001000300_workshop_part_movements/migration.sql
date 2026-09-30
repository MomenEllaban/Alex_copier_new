-- CreateEnum
CREATE TYPE "WorkshopMovementType" AS ENUM ('SALE', 'REPLACEMENT', 'RETURN');

-- CreateTable
CREATE TABLE "WorkshopPartMovement" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "engineerId" TEXT,
    "engineerName" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "description" TEXT NOT NULL,
    "requestedBy" TEXT,
    "movementType" "WorkshopMovementType" NOT NULL,
    "performedById" TEXT,
    "performedByName" TEXT,
    "receivedById" TEXT,
    "receivedByName" TEXT,
    "receivedAt" TIMESTAMP(3),
    "companyId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkshopPartMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkshopPartMovement_date_idx" ON "WorkshopPartMovement"("date");

-- CreateIndex
CREATE INDEX "WorkshopPartMovement_movementType_idx" ON "WorkshopPartMovement"("movementType");

-- CreateIndex
CREATE INDEX "WorkshopPartMovement_engineerId_idx" ON "WorkshopPartMovement"("engineerId");

-- CreateIndex
CREATE INDEX "WorkshopPartMovement_customerId_idx" ON "WorkshopPartMovement"("customerId");

-- CreateIndex
CREATE INDEX "WorkshopPartMovement_deletedAt_idx" ON "WorkshopPartMovement"("deletedAt");

-- CreateIndex
CREATE INDEX "WorkshopPartMovement_companyId_idx" ON "WorkshopPartMovement"("companyId");

-- AddForeignKey
ALTER TABLE "WorkshopPartMovement" ADD CONSTRAINT "WorkshopPartMovement_engineerId_fkey" FOREIGN KEY ("engineerId") REFERENCES "Engineer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPartMovement" ADD CONSTRAINT "WorkshopPartMovement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPartMovement" ADD CONSTRAINT "WorkshopPartMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPartMovement" ADD CONSTRAINT "WorkshopPartMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPartMovement" ADD CONSTRAINT "WorkshopPartMovement_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPartMovement" ADD CONSTRAINT "WorkshopPartMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPartMovement" ADD CONSTRAINT "WorkshopPartMovement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
