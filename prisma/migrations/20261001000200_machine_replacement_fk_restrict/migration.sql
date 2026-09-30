-- A MachineReplacement row is the only link between a returned machine and the
-- contract it came off. The trade-in product is deletable from the الاستبدال
-- page, so ON DELETE CASCADE would have let that button silently erase the
-- record of which machine and contract it was. Restrict instead: the product
-- has to be handled explicitly before the history can go.
ALTER TABLE "MachineReplacement"
  DROP CONSTRAINT "MachineReplacement_productId_fkey";
ALTER TABLE "MachineReplacement"
  ADD CONSTRAINT "MachineReplacement_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- Same reasoning for the warehouse holding it: a stock location going away
-- should not delete the replacement history.
ALTER TABLE "MachineReplacement"
  DROP CONSTRAINT "MachineReplacement_warehouseId_fkey";
ALTER TABLE "MachineReplacement"
  ADD CONSTRAINT "MachineReplacement_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;
