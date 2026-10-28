import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== STEP 1: REMOVING TEST SUPPLIERS AND TEST PURCHASE ORDERS ===");
  const testSupplierIds = ["sup-1", "sup-2", "sup-3", "sup-4", "sup-5", "cmvm2nxr9000008jpcmtpo6x9"];
  
  // Find any POs attached to test suppliers or test IDs
  const testPOs = await prisma.purchaseOrder.findMany({
    where: {
      OR: [
        { supplierId: { in: testSupplierIds } },
        { id: { in: ["cmus5ff3o000c04l5p9570rmp", "cmusiyuai000004i76n1t0hm2", "cmuvbuvus000004jsebfxma0e", "cmvny5w1j000008jjv2vok8aq"] } },
      ],
    },
    select: { id: true },
  });
  const poIds = testPOs.map((p) => p.id);

  if (poIds.length > 0) {
    console.log(`Found ${poIds.length} test purchase orders to delete:`, poIds);
    // Delete stock movements linked to these POs
    await prisma.stockMovement.deleteMany({
      where: { purchaseOrderId: { in: poIds } },
    });
    // Delete items
    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrderId: { in: poIds } },
    });
    // Delete purchase invoices if any
    await prisma.purchaseInvoice.deleteMany({
      where: { purchaseOrderId: { in: poIds } },
    });
    // Delete POs
    await prisma.purchaseOrder.deleteMany({
      where: { id: { in: poIds } },
    });
  }

  // Delete test suppliers
  const deletedSuppliers = await prisma.supplier.deleteMany({
    where: { id: { in: testSupplierIds } },
  });
  console.log(`Deleted ${deletedSuppliers.count} test suppliers.`);

  // Delete any other supplier that might exist in company1 other than the 9
  const existingOtherSuppliers = await prisma.supplier.findMany({
    where: {
      companyId: "company1",
      name: { notIn: [
        "رضا امين",
        "الدولية م. محمود صبري",
        "أسعد",
        "سامح الشرقاوي",
        "اليسرى",
        "نور الدسوقي المنصورة",
        "هنداوي",
        "الظهراوي",
        "طارق سرحان",
      ] },
    },
  });
  if (existingOtherSuppliers.length > 0) {
    console.log(`Deleting ${existingOtherSuppliers.length} other unknown suppliers in company1:`, existingOtherSuppliers.map(s => s.name));
    for (const s of existingOtherSuppliers) {
      await prisma.purchaseOrder.deleteMany({ where: { supplierId: s.id } });
      await prisma.supplier.delete({ where: { id: s.id } });
    }
  }

  console.log("=== STEP 2: ENSURING PRODUCTS EXIST FOR INVOICE ITEMS ===");
  // Helper to ensure product exists or return its ID
  async function ensureProduct(name: string, sku?: string) {
    const existing = await prisma.product.findFirst({
      where: {
        companyId: "company1",
        OR: [
          sku ? { sku } : undefined,
          { name: { equals: name, mode: "insensitive" } },
        ].filter(Boolean) as any,
      },
    });
    if (existing) return existing.id;

    const created = await prisma.product.create({
      data: {
        name,
        sku: sku || null,
        companyId: "company1",
        productType: "MACHINE",
        retailPrice: 0,
        wholesalePrice: 0,
      },
    });
    console.log(`Created product: ${name} (${sku || "no sku"})`);
    return created.id;
  }

  // Products from section 3
  const p_5053ci = await ensureProduct("5053ci", "001002010");
  const p_4007ci = await ensureProduct("كيوسيرا 4007CI-4053", "001002008");
  const p_2553 = await ensureProduct("كيوسيرا 2553", "001002022");
  const p_4006ci = await ensureProduct("كيوسيرا 4006CI-4052", "001002007");
  const p_3565 = await ensureProduct("3565", "0018005");
  const p_3253 = await ensureProduct("كيوسيرا 3253", "001007006");
  const p_3206 = await ensureProduct("كيوسيرا 3206-3252", "001002005");
  const p_2552 = await ensureProduct("كيوسيرا 2552", "001007007");
  const p_TA5007CI = await ensureProduct("TA5007CI", "001010004");
  const p_3655 = await ensureProduct("3655", "001001045");
  const p_4510 = await ensureProduct("4510", "001006019");

  const p_5006ci = await ensureProduct("كيوسيرا 5006CI-5052", "001002009");

  const p_2506 = await ensureProduct("2506", "001001037");
  const p_TA5056I = await ensureProduct("TA5056I-5002", "001010009");
  const p_4002_4056 = await ensureProduct("4002-4056", "001002015");
  const p_5031_printer = await ensureProduct("برنتر كيوسيرا 5031-5032-6031", "001002024");
  const p_TA_P_5032DN = await ensureProduct("TA P 5032DN", "001010017");
  const p_5031dn = await ensureProduct("5031dn", "001002013");

  const p_5052ci = await ensureProduct("كيوسيرا 5052ci");
  const p_6052 = await ensureProduct("كيوسيرا 6052");
  const p_4052 = await ensureProduct("كيوسيرا 4052");
  const p_5053 = await ensureProduct("كيوسيرا 5053");
  const p_4053ci = await ensureProduct("كيوسيرا 4053ci");
  const p_406 = await ensureProduct("كيوسيرا 406");

  console.log("=== STEP 3: CREATING THE 9 SUPPLIERS AND INVOICES ===");

  async function upsertSupplier(name: string, contactName?: string) {
    const existing = await prisma.supplier.findFirst({
      where: { companyId: "company1", name },
    });
    if (existing) {
      // Clear old POs for this supplier to avoid duplication
      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrder: { supplierId: existing.id } },
      });
      await prisma.purchaseOrder.deleteMany({
        where: { supplierId: existing.id },
      });
      return existing;
    }
    return prisma.supplier.create({
      data: {
        name,
        contactName: contactName || name,
        companyId: "company1",
        isActive: true,
      },
    });
  }

  // 1. رضا امين (كود 15) - الرصيد النهائي 826,000 ج.م
  const sup_reda = await upsertSupplier("رضا امين", "م. رضا امين");
  // فاتورة 16
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_reda.id,
      status: "RECEIVED",
      total: 126750,
      notes: "فاتورة مشتريات رقم 16 (إجمالي 226,750 ج.م - مسدد كاش 100,000 ج.م)",
      orderDate: new Date("2025-12-24T10:00:00Z"),
    },
  });
  // فاتورة 19
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_reda.id,
      status: "RECEIVED",
      total: 66000,
      notes: "فاتورة مشتريات رقم 19",
      orderDate: new Date("2025-12-28T10:00:00Z"),
    },
  });
  // فاتورة 21
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_reda.id,
      status: "RECEIVED",
      total: 189750,
      notes: "فاتورة مشتريات رقم 21",
      orderDate: new Date("2026-01-27T10:00:00Z"),
    },
  });
  // فاتورة 23
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_reda.id,
      status: "RECEIVED",
      total: 55000,
      notes: "فاتورة مشتريات رقم 23",
      orderDate: new Date("2026-02-01T10:00:00Z"),
    },
  });
  // فاتورة 25 بعد خصم دفعة صرف نقدية مستند 30
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_reda.id,
      status: "RECEIVED",
      total: 308250,
      notes: "فاتورة مشتريات رقم 25 (إجمالي 408,250 ج.م بعد خصم دفعة صرف نقدية مستند 30 بقيمة 100,000 ج.م)",
      orderDate: new Date("2026-02-23T10:00:00Z"),
    },
  });
  // فاتورة 45 (مع تفاصيل الأصناف)
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_reda.id,
      status: "RECEIVED",
      total: 80250,
      notes: "فاتورة مشتريات رقم 45 (إجمالي 170,250 ج.م - مسدد كاش 90,000 ج.م = آجل 80,250 ج.م)",
      orderDate: new Date("2026-09-10T10:57:00Z"),
      items: {
        create: [
          { productId: p_2506, quantity: 6, unitPrice: 8000 },
          { productId: p_3206, quantity: 7, unitPrice: 8000 },
          { productId: p_TA5056I, quantity: 2, unitPrice: 10500 },
          { productId: p_4002_4056, quantity: 3, unitPrice: 10500 },
          { productId: p_5031_printer, quantity: 1, unitPrice: 2750 },
          { productId: p_TA_P_5032DN, quantity: 2, unitPrice: 2750 },
          { productId: p_5031dn, quantity: 2, unitPrice: 2750 },
        ],
      },
    },
  });

  // 2. الدولية م. محمود صبري (كود 10) - الرصيد النهائي 368,250 ج.م
  const sup_dawlia = await upsertSupplier("الدولية م. محمود صبري", "م. محمود صبري");
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_dawlia.id,
      status: "RECEIVED",
      total: 368250,
      notes: "رصيد مستحق لحساب الدولية م. محمود صبري (آخر دفعة مسددة 50,000 ج.م بتاريخ 2026/02/01)",
      orderDate: new Date("2026-02-01T10:00:00Z"),
    },
  });

  // 3. أسعد (كود 11) - الرصيد النهائي 342,000 ج.م
  const sup_asaad = await upsertSupplier("أسعد", "أسعد");
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_asaad.id,
      status: "RECEIVED",
      total: 105000,
      notes: "صافي رصيد سابق (فواتير مشتريات 1 و 11 و 13 بعد خصم الدفعات)",
      orderDate: new Date("2025-11-23T10:00:00Z"),
    },
  });
  // فاتورة 42 (مع تفاصيل الأصناف)
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_asaad.id,
      status: "RECEIVED",
      total: 237000,
      notes: "فاتورة مشتريات رقم 42 (إجمالي 314,250 ج.م - خصم 4,250 ج.م - مسدد كاش 73,000 ج.م = آجل 237,000 ج.م)",
      orderDate: new Date("2026-08-31T13:43:00Z"),
      items: {
        create: [
          { productId: p_5053ci, quantity: 4, unitPrice: 11500 },
          { productId: p_4007ci, quantity: 2, unitPrice: 11500 },
          { productId: p_2553, quantity: 2, unitPrice: 8250 },
          { productId: p_4006ci, quantity: 2, unitPrice: 10500 },
          { productId: p_3565, quantity: 10, unitPrice: 5000 },
          { productId: p_3253, quantity: 2, unitPrice: 8750 },
          { productId: p_4006ci, quantity: 3, unitPrice: 10500 },
          { productId: p_3206, quantity: 6, unitPrice: 7750 },
          { productId: p_2552, quantity: 1, unitPrice: 7750 },
          { productId: p_TA5007CI, quantity: 3, unitPrice: 12000 },
          { productId: p_3655, quantity: 1, unitPrice: 8500 },
          { productId: p_4510, quantity: 10, unitPrice: 1000 },
        ],
      },
    },
  });

  // 4. سامح الشرقاوي (كود 9) - الرصيد النهائي 220,500 ج.م
  const sup_sameh = await upsertSupplier("سامح الشرقاوي", "سامح الشرقاوي");
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_sameh.id,
      status: "RECEIVED",
      total: 107500,
      notes: "فاتورة مشتريات رقم 24 (إجمالي 117,500 ج.م - مسدد كاش 10,000 ج.م)",
      orderDate: new Date("2026-02-01T10:00:00Z"),
    },
  });
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_sameh.id,
      status: "RECEIVED",
      total: 20000,
      notes: "مستند رقم 63 (ضريبة)",
      orderDate: new Date("2026-02-01T11:00:00Z"),
    },
  });
  // فاتورة 39 (مع تفاصيل الأصناف)
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_sameh.id,
      status: "RECEIVED",
      total: 93000,
      notes: "فاتورة مشتريات رقم 39 (إجمالي 143,000 ج.م - مسدد كاش 50,000 ج.م = آجل 93,000 ج.م)",
      orderDate: new Date("2026-08-04T10:00:00Z"),
      items: {
        create: [
          { productId: p_5052ci, quantity: 1, unitPrice: 11500 },
          { productId: p_6052, quantity: 4, unitPrice: 11500 },
          { productId: p_4052, quantity: 1, unitPrice: 11500 },
          { productId: p_5053, quantity: 1, unitPrice: 12000 },
          { productId: p_4053ci, quantity: 3, unitPrice: 12000 },
          { productId: p_406, quantity: 4, unitPrice: 6500 },
        ],
      },
    },
  });

  // 5. اليسرى (كود 12) - الرصيد النهائي 210,900 ج.م
  const sup_yosra = await upsertSupplier("اليسرى", "اليسرى");
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_yosra.id,
      status: "RECEIVED",
      total: 146900,
      notes: "صافي رصيد سابق (فواتير مشتريات 3 و 9 و 12 بعد خصم الصرف النقدية)",
      orderDate: new Date("2026-02-01T10:00:00Z"),
    },
  });
  // فاتورة 43 (مع تفاصيل الأصناف)
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_yosra.id,
      status: "RECEIVED",
      total: 64000,
      notes: "فاتورة مشتريات رقم 43 (إجمالي 84,000 ج.م - مسدد كاش 20,000 ج.م = آجل 64,000 ج.م)",
      orderDate: new Date("2026-09-05T08:26:00Z"),
      items: {
        create: [
          { productId: p_5006ci, quantity: 2, unitPrice: 10500 },
          { productId: p_4006ci, quantity: 3, unitPrice: 10500 },
          { productId: p_5006ci, quantity: 2, unitPrice: 10500 },
          { productId: p_4006ci, quantity: 1, unitPrice: 10500 },
        ],
      },
    },
  });

  // 6. نور الدسوقي المنصورة (كود 14) - الرصيد النهائي 183,500 ج.م
  const sup_nour = await upsertSupplier("نور الدسوقي المنصورة", "نور الدسوقي");
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_nour.id,
      status: "RECEIVED",
      total: 183500,
      notes: "فاتورة مشتريات رقم 40 (إجمالي 300,000 ج.م بعد خصم 1,500 ج.م ومسدد كاش 116,500 ج.م = آجل 183,500 ج.م)",
      orderDate: new Date("2026-08-30T10:00:00Z"),
    },
  });

  // 7. هنداوي (كود 5) - الرصيد النهائي 83,000 ج.م
  const sup_hendawi = await upsertSupplier("هنداوي", "هنداوي");
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_hendawi.id,
      status: "RECEIVED",
      total: 83000,
      notes: "فاتورة مشتريات رقم 20 (إجمالي 128,000 ج.م بعد خصم صرف نقدية مستند 37 بقيمة 45,000 ج.م)",
      orderDate: new Date("2026-01-11T10:00:00Z"),
    },
  });

  // 8. الظهراوي (كود 13) - الرصيد النهائي 25,250 ج.م
  const sup_zahrawi = await upsertSupplier("الظهراوي", "الظهراوي");
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_zahrawi.id,
      status: "RECEIVED",
      total: 25250,
      notes: "صافي رصيد فواتير مشتريات 5 و 6 (38,000 ج.م) بعد خصم صرف نقدية مستندي 20 و 28 (12,750 ج.م)",
      orderDate: new Date("2026-01-11T10:00:00Z"),
    },
  });

  // 9. طارق سرحان (كود 17) - الرصيد النهائي 22,500 ج.م
  const sup_tareq = await upsertSupplier("طارق سرحان", "طارق سرحان");
  await prisma.purchaseOrder.create({
    data: {
      companyId: "company1",
      supplierId: sup_tareq.id,
      status: "RECEIVED",
      total: 22500,
      notes: "فاتورة مشتريات رقم 26",
      orderDate: new Date("2026-03-14T10:00:00Z"),
    },
  });

  console.log("=== STEP 4: VERIFICATION ===");
  const allSuppliers = await prisma.supplier.findMany({
    where: { companyId: "company1" },
    include: {
      purchaseOrders: {
        select: { id: true, total: true, orderDate: true, notes: true },
      },
    },
  });

  let grandTotal = 0;
  console.log(`\nFound ${allSuppliers.length} suppliers in company1:`);
  for (const s of allSuppliers) {
    const total = s.purchaseOrders.reduce((sum, o) => sum + o.total, 0);
    grandTotal += total;
    console.log(`- ${s.name}: ${total.toLocaleString("ar-EG")} ج.م (${s.purchaseOrders.length} orders)`);
  }
  console.log(`\nGRAND TOTAL SUPPLIER BALANCES: ${grandTotal.toLocaleString("ar-EG")} ج.م (Expected: 2,281,900 ج.م)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
