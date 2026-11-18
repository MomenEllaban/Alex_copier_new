-- Trade-in invoices: many returned items <-> many received items.
-- Each returned item is a real Product (so it enters stock) plus a quantity and
-- a per-unit value recorded on the invoice.

CREATE TABLE "TradeInItem" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitValue" DOUBLE PRECISION NOT NULL,
    "condition" TEXT,
    "serialNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeInItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TradeInItem_salesOrderId_idx" ON "TradeInItem"("salesOrderId");

ALTER TABLE "TradeInItem" ADD CONSTRAINT "TradeInItem_salesOrderId_fkey"
    FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TradeInItem" ADD CONSTRAINT "TradeInItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
