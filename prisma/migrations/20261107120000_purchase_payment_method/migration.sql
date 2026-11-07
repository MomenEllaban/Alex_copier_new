-- AlterTable: add payment tracking to purchase orders (fixes unspecified payment method; supports cash/credit + supplier settlements)
ALTER TABLE "PurchaseOrder" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CREDIT';
ALTER TABLE "PurchaseOrder" ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "PurchaseOrder" ADD COLUMN "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable: link auto/related supplier payments to a purchase order
ALTER TABLE "SupplierPayment" ADD COLUMN "purchaseOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_purchaseOrderId_key" ON "SupplierPayment"("purchaseOrderId");
CREATE INDEX "SupplierPayment_purchaseOrderId_idx" ON "SupplierPayment"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
