-- Per-company negative-stock policy for sales.
--
-- One row per company, created lazily on first read (the service upserts), so
-- this migration only needs the table. The defaults are deliberately the
-- pre-existing behaviour: a sale that would take a balance below zero is
-- refused with 409 INSUFFICIENT_STOCK until a manager opts the company in.
--
-- allowNegativeStock  false = block the sale (today's behaviour)
--                     true  = allow the balance to go negative, after the
--                             client confirms the shortfall
-- warnOnNegativeStock true  = answer a short-selling sale with 409
--                             NEGATIVE_STOCK_CONFIRM_REQUIRED + the per-item
--                             shortfall, so the user sees the resulting balance
--                             before committing

CREATE TABLE "InventorySetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "warnOnNegativeStock" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventorySetting_companyId_key" ON "InventorySetting"("companyId");

ALTER TABLE "InventorySetting"
    ADD CONSTRAINT "InventorySetting_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
