-- Phase 1: link stock movements to real purchase orders (real FK, not free text)
-- Also persists the earlier DRAFT->CONFIRMED default change at the DB level.

-- AlterTable
ALTER TABLE "SalesOrder" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "purchaseOrderId" TEXT;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;