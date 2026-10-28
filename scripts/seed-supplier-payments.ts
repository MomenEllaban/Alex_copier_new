import { prisma } from "../src/lib/prisma";
import { JUMLA_SUPPLIERS_LEDGER } from "../src/lib/jumla-suppliers-ledger";

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: { contains: "جملة" } },
  });
  if (!company) {
    throw new Error("Company not found");
  }
  const companyId = company.id;

  console.log("Seeding supplier payments and syncing invoices for company:", company.name);

  for (const [supplierName, ledger] of Object.entries(JUMLA_SUPPLIERS_LEDGER)) {
    let supplier = await prisma.supplier.findFirst({
      where: { name: supplierName, companyId },
    });
    if (!supplier) {
      supplier = await prisma.supplier.findFirst({
        where: { name: { contains: supplierName } },
      });
    }
    if (!supplier) {
      console.warn("Supplier not found:", supplierName);
      continue;
    }

    console.log(`\nProcessing ${supplier.name} (Code ${ledger.code})...`);

    // 1. Delete existing payments to re-seed cleanly
    await prisma.supplierPayment.deleteMany({
      where: { supplierId: supplier.id },
    });

    // 2. Identify all debit movements (payments / cash disbursements)
    const paymentMovements = ledger.movements.filter((m) => m.debit > 0);
    console.log(`Found ${paymentMovements.length} payments for ${supplier.name}`);

    for (const p of paymentMovements) {
      const pDate = new Date(p.date.replace(/\//g, "-") + "T10:00:00Z");
      await prisma.supplierPayment.create({
        data: {
          supplierId: supplier.id,
          companyId,
          amount: p.debit,
          paymentDate: pDate,
          paymentMethod: p.docType === "صرف نقدية" ? "CASH" : "CASH",
          docNumber: p.docNumber,
          notes: p.notes || p.docType,
        },
      });
    }

    // 3. Sync purchase orders to have gross invoice totals
    // If supplier is رضا امين, make sure orders match invoice totals:
    if (supplierName === "رضا امين") {
      // Delete old orders and create full invoice orders
      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrder: { supplierId: supplier.id, notes: { not: { contains: "فاتورة مشتريات رقم 45" } } } },
      });
      await prisma.purchaseOrder.deleteMany({
        where: { supplierId: supplier.id, notes: { not: { contains: "فاتورة مشتريات رقم 45" } } },
      });

      const ordersToCreate = [
        { doc: "16", total: 226750, date: "2025-12-24T10:00:00Z", notes: "فاتورة مشتريات رقم 16" },
        { doc: "18", total: 103000, date: "2025-12-24T11:00:00Z", notes: "فاتورة مشتريات رقم 18" },
        { doc: "19", total: 66000, date: "2025-12-28T10:00:00Z", notes: "فاتورة مشتريات رقم 19" },
        { doc: "21", total: 189750, date: "2026-01-27T10:00:00Z", notes: "فاتورة مشتريات رقم 21" },
        { doc: "23", total: 55000, date: "2026-02-01T10:00:00Z", notes: "فاتورة مشتريات رقم 23" },
        { doc: "25", total: 408250, date: "2026-02-23T10:00:00Z", notes: "فاتورة مشتريات رقم 25" },
      ];
      for (const o of ordersToCreate) {
        await prisma.purchaseOrder.create({
          data: {
            companyId,
            supplierId: supplier.id,
            total: o.total,
            orderDate: new Date(o.date),
            status: "RECEIVED",
            notes: o.notes,
          },
        });
      }
      // Ensure order 45 has full gross 170250
      const order45 = await prisma.purchaseOrder.findFirst({
        where: { supplierId: supplier.id, notes: { contains: "45" } },
      });
      if (order45) {
        await prisma.purchaseOrder.update({
          where: { id: order45.id },
          data: { total: 170250 },
        });
      }
    } else if (supplierName === "أسعد") {
      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrder: { supplierId: supplier.id, notes: { not: { contains: "فاتورة مشتريات رقم 42" } } } },
      });
      await prisma.purchaseOrder.deleteMany({
        where: { supplierId: supplier.id, notes: { not: { contains: "فاتورة مشتريات رقم 42" } } },
      });
      const ordersToCreate = [
        { doc: "1", total: 85000, date: "2025-08-16T10:00:00Z", notes: "فاتورة مشتريات رقم 1" },
        { doc: "11", total: 53000, date: "2025-11-06T10:00:00Z", notes: "فاتورة مشتريات رقم 11" },
        { doc: "13", total: 145000, date: "2025-11-23T10:00:00Z", notes: "فاتورة مشتريات رقم 13" },
        { doc: "27", total: 19, date: "2026-03-14T10:00:00Z", notes: "فاتورة مشتريات رقم 27" },
        { doc: "28", total: 6, date: "2026-03-14T11:00:00Z", notes: "فاتورة مشتريات رقم 28" },
      ];
      for (const o of ordersToCreate) {
        await prisma.purchaseOrder.create({
          data: {
            companyId,
            supplierId: supplier.id,
            total: o.total,
            orderDate: new Date(o.date),
            status: "RECEIVED",
            notes: o.notes,
          },
        });
      }
      const order42 = await prisma.purchaseOrder.findFirst({
        where: { supplierId: supplier.id, notes: { contains: "42" } },
      });
      if (order42) {
        await prisma.purchaseOrder.update({
          where: { id: order42.id },
          data: { total: 310000 },
        });
      }
    } else if (supplierName === "سامح الشرقاوي") {
      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrder: { supplierId: supplier.id, notes: { not: { contains: "فاتورة مشتريات رقم 39" } } } },
      });
      await prisma.purchaseOrder.deleteMany({
        where: { supplierId: supplier.id, notes: { not: { contains: "فاتورة مشتريات رقم 39" } } },
      });
      const ordersToCreate = [
        { doc: "2", total: 1150000, date: "2025-07-13T10:00:00Z", notes: "رصيد افتتاحي موردين - 2" },
        { doc: "1", total: 92000, date: "2025-08-04T09:00:00Z", notes: "استلام نقدية مستند 1 (عدد 8 آلة كيوسيرا)" },
        { doc: "1", total: 67860, date: "2025-08-04T10:00:00Z", notes: "استلام نقدية مستند 1 (الجامبو يوم الحاوية)" },
        { doc: "17", total: 95500, date: "2025-12-24T10:00:00Z", notes: "فاتورة مشتريات رقم 17" },
        { doc: "24", total: 117500, date: "2026-02-01T10:00:00Z", notes: "فاتورة مشتريات رقم 24" },
        { doc: "63", total: 20000, date: "2026-02-01T11:00:00Z", notes: "استلام نقدية مستند 63 (ضريبة)" },
      ];
      for (const o of ordersToCreate) {
        await prisma.purchaseOrder.create({
          data: {
            companyId,
            supplierId: supplier.id,
            total: o.total,
            orderDate: new Date(o.date),
            status: "RECEIVED",
            notes: o.notes,
          },
        });
      }
      const order39 = await prisma.purchaseOrder.findFirst({
        where: { supplierId: supplier.id, notes: { contains: "39" } },
      });
      if (order39) {
        await prisma.purchaseOrder.update({
          where: { id: order39.id },
          data: { total: 143000 },
        });
      }
    } else if (supplierName === "اليسرى") {
      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrder: { supplierId: supplier.id, notes: { not: { contains: "فاتورة مشتريات رقم 43" } } } },
      });
      await prisma.purchaseOrder.deleteMany({
        where: { supplierId: supplier.id, notes: { not: { contains: "فاتورة مشتريات رقم 43" } } },
      });
      const ordersToCreate = [
        { doc: "5", total: 7000, date: "2025-09-23T09:00:00Z", notes: "رصيد أول مدة مورد - 5" },
        { doc: "3", total: 82400, date: "2025-09-23T10:00:00Z", notes: "فاتورة مشتريات رقم 3" },
        { doc: "9", total: 82750, date: "2025-10-27T10:00:00Z", notes: "فاتورة مشتريات رقم 9" },
        { doc: "12", total: 8000, date: "2025-11-06T10:00:00Z", notes: "فاتورة مشتريات رقم 12" },
      ];
      for (const o of ordersToCreate) {
        await prisma.purchaseOrder.create({
          data: {
            companyId,
            supplierId: supplier.id,
            total: o.total,
            orderDate: new Date(o.date),
            status: "RECEIVED",
            notes: o.notes,
          },
        });
      }
      const order43 = await prisma.purchaseOrder.findFirst({
        where: { supplierId: supplier.id, notes: { contains: "43" } },
      });
      if (order43) {
        await prisma.purchaseOrder.update({
          where: { id: order43.id },
          data: { total: 84000 },
        });
      }
    } else if (supplierName === "نور الدسوقي المنصورة") {
      await prisma.purchaseOrder.deleteMany({
        where: { supplierId: supplier.id },
      });
      await prisma.purchaseOrder.create({
        data: {
          companyId,
          supplierId: supplier.id,
          total: 177750,
          orderDate: new Date("2025-10-12T10:00:00Z"),
          status: "RECEIVED",
          notes: "فاتورة مشتريات رقم 8",
        },
      });
      await prisma.purchaseOrder.create({
        data: {
          companyId,
          supplierId: supplier.id,
          total: 300000,
          orderDate: new Date("2026-08-30T10:00:00Z"),
          status: "RECEIVED",
          notes: "فاتورة مشتريات رقم 40 (إجمالي 300,000 ج.م)",
        },
      });
    } else if (supplierName === "هنداوي") {
      await prisma.purchaseOrder.deleteMany({
        where: { supplierId: supplier.id },
      });
      await prisma.purchaseOrder.create({
        data: {
          companyId,
          supplierId: supplier.id,
          total: 128000,
          orderDate: new Date("2026-01-11T10:00:00Z"),
          status: "RECEIVED",
          notes: "فاتورة مشتريات رقم 20",
        },
      });
    } else if (supplierName === "الظهراوي") {
      await prisma.purchaseOrder.deleteMany({
        where: { supplierId: supplier.id },
      });
      await prisma.purchaseOrder.create({
        data: {
          companyId,
          supplierId: supplier.id,
          total: 28000,
          orderDate: new Date("2025-09-23T10:00:00Z"),
          status: "RECEIVED",
          notes: "فاتورة مشتريات رقم 5",
        },
      });
      await prisma.purchaseOrder.create({
        data: {
          companyId,
          supplierId: supplier.id,
          total: 10000,
          orderDate: new Date("2025-09-24T10:00:00Z"),
          status: "RECEIVED",
          notes: "فاتورة مشتريات رقم 6",
        },
      });
    } else if (supplierName === "طارق سرحان") {
      await prisma.purchaseOrder.deleteMany({
        where: { supplierId: supplier.id },
      });
      await prisma.purchaseOrder.create({
        data: {
          companyId,
          supplierId: supplier.id,
          total: 22500,
          orderDate: new Date("2026-03-14T10:00:00Z"),
          status: "RECEIVED",
          notes: "فاتورة مشتريات رقم 26",
        },
      });
    } else if (supplierName === "الدولية م. محمود صبري") {
      await prisma.purchaseOrder.deleteMany({
        where: { supplierId: supplier.id },
      });
      await prisma.purchaseOrder.create({
        data: {
          companyId,
          supplierId: supplier.id,
          total: 368250,
          orderDate: new Date("2026-02-01T10:00:00Z"),
          status: "RECEIVED",
          notes: "رصيد معتمد لحساب الدولية م. محمود صبري",
        },
      });
    }
  }

  // Verification
  console.log("\n=== Final Verification ===");
  const allSuppliers = await prisma.supplier.findMany({
    where: { companyId },
    include: {
      purchaseOrders: { where: { status: { notIn: ["DRAFT", "CANCELLED"] } } },
      payments: true,
    },
  });

  let grandTotalPurchases = 0;
  let grandTotalPayments = 0;
  let grandTotalBalance = 0;

  for (const s of allSuppliers) {
    const totalPurchases = s.purchaseOrders.reduce((sum, o) => sum + o.total, 0);
    const totalPayments = s.payments.reduce((sum, p) => sum + p.amount, 0);
    const balance = totalPurchases - totalPayments;
    grandTotalPurchases += totalPurchases;
    grandTotalPayments += totalPayments;
    grandTotalBalance += balance;

    console.log(
      `${s.name.padEnd(25)} | Purchases: ${totalPurchases.toLocaleString("ar-EG").padStart(10)} | Payments: ${totalPayments.toLocaleString("ar-EG").padStart(10)} | Balance: ${balance.toLocaleString("ar-EG").padStart(10)} ج.م (Orders: ${s.purchaseOrders.length}, Payments: ${s.payments.length})`
    );
  }

  console.log("--------------------------------------------------------------------------------");
  console.log(
    `Grand Total Purchases: ${grandTotalPurchases.toLocaleString("ar-EG")} | Total Payments: ${grandTotalPayments.toLocaleString("ar-EG")} | Total Due Balance: ${grandTotalBalance.toLocaleString("ar-EG")} ج.م`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
