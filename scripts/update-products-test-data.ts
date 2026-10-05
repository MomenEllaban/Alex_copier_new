import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Starting products and inventory update for client test...");

  // 1. Get all warehouses mapped by companyId
  const warehouses = await prisma.warehouse.findMany();
  const companyWarehouseMap = new Map<string, string>();
  for (const wh of warehouses) {
    if (!companyWarehouseMap.has(wh.companyId) || wh.isMain) {
      companyWarehouseMap.set(wh.companyId, wh.id);
    }
  }
  console.log("Warehouses mapped:", Array.from(companyWarehouseMap.entries()));

  // 2. Pricing tiers standard object (1000 EGP for every tier)
  const defaultPricingTiers = {
    legacyCustomer: 1000,
    newCustomer: 1000,
    jumlaMachines: 1000,
    jumlaParts: 1000,
    sectori: 1000,
    engineer: 1000,
  };

  // 3. Update all products: prices to 1000
  const updateProductsResult = await prisma.product.updateMany({
    data: {
      purchasePrice: 1000,
      wholesalePrice: 1000,
      retailPrice: 1000,
      pricingTiers: defaultPricingTiers,
    },
  });
  console.log(`Updated ${updateProductsResult.count} products to price 1000 EGP.`);

  // 4. Update or insert inventory quantity = 10 for each product
  const products = await prisma.product.findMany({
    select: { id: true, companyId: true, name: true },
  });

  const fallbackWhId = warehouses[0]?.id;
  let inventoryUpserted = 0;

  for (const p of products) {
    const whId = companyWarehouseMap.get(p.companyId) || fallbackWhId;
    if (!whId) {
      console.warn(`No warehouse found for product ${p.name} (${p.id})`);
      continue;
    }

    await prisma.warehouseInventory.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: whId,
          productId: p.id,
        },
      },
      update: {
        quantity: 10,
      },
      create: {
        warehouseId: whId,
        productId: p.id,
        quantity: 10,
      },
    });
    inventoryUpserted++;
  }

  console.log(`Successfully updated inventory for ${inventoryUpserted} products to quantity 10.`);
}

main()
  .catch((e) => {
    console.error("Error updating products test data:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
