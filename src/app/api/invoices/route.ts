import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import {
  generateInvoiceHtml,
  generateReceiptHtml,
  type InvoiceData,
  type InvoiceDir,
  type InvoiceLang,
} from "@/lib/invoice-template";

export async function GET(request: Request) {
  try {
    const user = await requirePageAccess("finance");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");
    const format = searchParams.get("format") || "invoice";
    const lang: InvoiceLang = searchParams.get("lang") === "en" ? "en" : "ar";
    const dirParam = searchParams.get("dir");
    const dir: InvoiceDir =
      dirParam === "ltr" || dirParam === "rtl" ? dirParam : lang === "en" ? "ltr" : "rtl";

    if (!type || !id) {
      return NextResponse.json({ error: "type and id are required" }, { status: 400 });
    }

    let invoiceData: InvoiceData | null = null;

    if (type === "sale") {
      const order = await prisma.salesOrder.findUnique({
        where: { id },
        include: {
          company: true,
          customer: true,
          engineer: true,
          items: { include: { product: true } },
        },
      });
      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      const items = order.items.map((item) => ({
        name: item.product?.name || "منتج",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
      }));

      const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      // order.discount is a raw value: percent when discountType is PERCENTAGE, amount when FIXED
      const discountAmount = order.discountType === "PERCENTAGE"
        ? (subtotal * Math.min(order.discount, 100)) / 100
        : Math.min(order.discount, subtotal);
      const taxAmount = order.taxRate > 0 ? ((subtotal - discountAmount) * order.taxRate) / 100 : 0;

      const hasTradeIn = order.tradeInTotal > 0 || order.items.some((it) => it.tradeInProductId);
      const subType = order.orderType === "SPARE_PART_SALE" ? "SPARE_PART_SALE" : hasTradeIn ? "TRADE_IN" : "MACHINE_SALE";

      // T1/T2/T3: payment split, customer account, source warehouse
      const paidAmount = Number(order.paidAmount) || 0;
      const dueAmount = Math.max(0, Number(order.total) - paidAmount);
      const [mainWarehouse, lastPayment] = await Promise.all([
        prisma.warehouse.findFirst({
          where: { companyId: order.companyId, isMain: true },
          select: { name: true },
        }),
        prisma.customerPayment.findFirst({
          where: { customerId: order.customerId },
          orderBy: { paymentDate: "desc" },
          select: { amount: true, paymentDate: true },
        }),
      ]);

      invoiceData = {
        type: "sale",
        subType,
        id: order.id,
        date: order.orderDate?.toISOString() || order.createdAt.toISOString(),
        companyName: order.company?.name || "الشركة",
        companyAddress: order.company?.address || undefined,
        companyPhone: order.company?.phone || undefined,
        companyTaxNumber: order.company?.taxNumber || undefined,
        counterpartyName: order.customer?.name || "عميل",
        counterpartyAddress: order.customer?.address || undefined,
        counterpartyPhone: order.customer?.phone || undefined,
        counterpartyTaxNumber: order.customer?.taxNumber || undefined,
        items,
        subtotal,
        discount: order.discount,
        discountType: order.discountType,
        taxRate: order.taxRate,
        taxAmount,
        total: order.total,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paidAmount,
        dueAmount,
        engineerName: order.engineer?.name || undefined,
        warehouseName: mainWarehouse?.name || undefined,
        customerDebt: order.customer ? Number(order.customer.remainingDebt) || 0 : undefined,
        customerLastPayment: lastPayment
          ? { amount: Number(lastPayment.amount), date: lastPayment.paymentDate.toISOString() }
          : undefined,
        invoiceAddedDebt: order.paymentMethod === "CASH" ? 0 : dueAmount,
        notes: order.notes || undefined,
      };
    } else if (type === "purchase") {
      const order = await prisma.purchaseOrder.findUnique({
        where: { id },
        include: {
          company: true,
          supplier: true,
          items: { include: { product: true } },
        },
      });
      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      const items = order.items.map((item) => ({
        name: item.product?.name || "منتج",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: 0,
      }));

      const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

      invoiceData = {
        type: "purchase",
        id: order.id,
        date: order.orderDate?.toISOString() || order.createdAt.toISOString(),
        companyName: order.company?.name || "الشركة",
        companyAddress: order.company?.address || undefined,
        companyPhone: order.company?.phone || undefined,
        companyTaxNumber: order.company?.taxNumber || undefined,
        counterpartyName: order.supplier?.name || "مورد",
        counterpartyAddress: order.supplier?.address || undefined,
        counterpartyPhone: order.supplier?.phone || undefined,
        items,
        subtotal,
        discount: 0,
        taxRate: 0,
        taxAmount: 0,
        total: order.total,
        notes: order.notes || undefined,
      };
    } else if (type === "contract") {
      const contract = await prisma.contract.findUnique({
        where: { id },
        include: {
          customer: true,
          machines: { include: { machine: true } },
          _count: { select: { visits: true } },
        },
      });
      if (!contract) {
        return NextResponse.json({ error: "Contract not found" }, { status: 404 });
      }

      const machineNames = contract.machines
        .map((m) => m.machine?.serialNumber || "")
        .filter(Boolean)
        .join(", ");

      const CYCLE_LABELS: Record<string, string> = {
        MONTHLY: "شهري",
        HALF_YEARLY: "نصف سنوي",
        QUARTERLY: "ربع سنوي",
        YEARLY: "سنوي",
      };
      const TYPE_LABELS: Record<string, string> = {
        MAINTENANCE_ONLY: "صيانة فقط",
        MAINTENANCE_AND_PARTS: "صيانة وقطع غيار",
        MAINTENANCE_AND_PRINTING: "صيانة وطباعة",
        RENTAL: "إيجار",
        VISIT: "زيارة",
        ARCHIVE: "ارشيف",
        WARRANTY: "ضمان",
        PENDING: "مطلوب عقد",
      };

      invoiceData = {
        type: "contract",
        id: contract.id,
        date: contract.startDate.toISOString(),
        companyName: "اليكس كوبير",
        counterpartyName: contract.customer?.name || "عميل",
        counterpartyAddress: contract.customer?.address || undefined,
        counterpartyPhone: contract.customer?.phone || undefined,
        counterpartyTaxNumber: contract.customer?.taxNumber || undefined,
        items: [{ name: `عقد ${TYPE_LABELS[contract.contractType] || contract.contractType}`, quantity: 1, unitPrice: contract.value, discount: 0 }],
        subtotal: contract.value,
        discount: 0,
        taxRate: 0,
        taxAmount: 0,
        total: contract.value,
        extraFields: [
          { label: "رقم العقد", value: contract.contractNumber },
          { label: "الفترة", value: CYCLE_LABELS[contract.billingCycle] || contract.billingCycle },
          { label: "تاريخ البداية", value: new Date(contract.startDate).toLocaleDateString("ar-EG") },
          { label: "تاريخ النهاية", value: new Date(contract.endDate).toLocaleDateString("ar-EG") },
          { label: "المبلغ المدفوع", value: `${contract.amountPaid.toLocaleString("ar-EG")} ج.م` },
          ...(machineNames ? [{ label: "الأجهزة", value: machineNames }] : []),
        ],
        notes: contract.notes || undefined,
      };
    } else if (type === "return") {
      const ret = await prisma.returnTransaction.findUnique({
        where: { id },
        include: {
          company: true,
          customer: true,
          supplier: true,
          product: true,
          warehouse: true,
          salesOrder: true,
          salesOrderItem: true,
          purchaseOrder: { select: { id: true } },
        },
      });
      if (!ret) {
        return NextResponse.json({ error: "Return not found" }, { status: 404 });
      }

      const items = ret.product
        ? [{ name: ret.product.name, quantity: ret.quantity, unitPrice: ret.unitPrice, discount: 0 }]
        : [];

      invoiceData = {
        type: "return",
        id: ret.id,
        date: ret.createdAt.toISOString(),
        companyName: ret.company?.name || "الشركة",
        companyAddress: ret.company?.address || undefined,
        companyPhone: ret.company?.phone || undefined,
        companyTaxNumber: ret.company?.taxNumber || undefined,
        counterpartyName: ret.customer?.name || ret.supplier?.name || "—",
        counterpartyAddress: ret.customer?.address || undefined,
        counterpartyPhone: ret.customer?.phone || undefined,
        counterpartyTaxNumber: ret.customer?.taxNumber || undefined,
        items,
        subtotal: ret.total,
        discount: 0,
        taxRate: 0,
        taxAmount: 0,
        total: ret.total,
        notes: ret.reason || undefined,
        extraFields: [
          { label: "النوع", value: ret.type === "SALE_RETURN" ? "مرتجع مبيعات" : "مرتجع مشتريات" },
          { label: "المستودع", value: ret.warehouse?.name || "—" },
          { label: "الحالة", value: ret.status },
          ...(ret.salesOrder ? [{ label: "فاتورة البيع", value: ret.salesOrder.id.slice(0, 8) }] : []),
          ...(ret.purchaseOrder ? [{ label: "فاتورة الشراء", value: ret.purchaseOrder.id.slice(0, 8) }] : []),
        ],
      };
    }

    if (!invoiceData) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    invoiceData.lang = lang;
    invoiceData.dir = dir;

    const html =
      format === "receipt58"
        ? generateReceiptHtml(invoiceData, 58)
        : format === "receipt80" || format === "receipt"
          ? generateReceiptHtml(invoiceData, 80)
          : generateInvoiceHtml(invoiceData);

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to generate invoice:", error);
    return NextResponse.json({ error: "Failed to generate invoice" }, { status: 500 });
  }
}
