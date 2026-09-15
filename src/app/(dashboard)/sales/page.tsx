"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { AddFormBoundary, useAutoAddForm } from "@/hooks/useAutoAddForm";
import { useI18n } from "@/i18n/context";
import Pagination from "@/components/Pagination";
import SearchInput, { matchesQuery } from "@/components/SearchInput";
import FilterSelect from "@/components/FilterSelect";
import DateRangeFilter, { inDateRange } from "@/components/DateRangeFilter";
import { ArrowLeftRight, Eye, Pencil, Plus, RotateCcw, Save, Tags, Trash2, X } from "lucide-react";
import ExportButton from "@/components/ExportButton";
import PrinterLoader from "@/components/PrinterLoader";
import { useConfirm, useToast } from "@/components/UIProvider";
import { apiErrorMessage } from "@/lib/api-client";
import FormModal from "@/components/FormModal";
import SelectWithAdd from "@/components/SelectWithAdd";
import SearchableSelect from "@/components/SearchableSelect";
import PrintMenu from "@/components/PrintMenu";
import SubmitButton from "@/components/SubmitButton";
import { DateTimeCell } from "@/components/DateTimeCell";
import RefreshButton from "@/components/RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { notifyDataChanged } from "@/lib/data-events";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "نقدي",
  CREDIT: "آجل",
  INSTALLMENT: "أجل",
  MIXED: "أجل",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "معلق",
  PARTIAL: "جزئي",
  PAID: "مدفوع",
  OVERDUE: "متأخر",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  MACHINE_SALE: "بيع جهاز",
  SPARE_PART_SALE: "بيع قطع غيار",
};

const paymentStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PARTIAL: "bg-orange-100 text-orange-800",
  PAID: "bg-green-100 text-green-800",
  OVERDUE: "bg-red-100 text-red-800",
};

interface Customer { id: string; name: string; remainingDebt?: number; }
interface Company { id: string; name: string; }
interface Engineer { id: string; name: string; email?: string | null; }
interface SalesCategory { id: string; name: string; companyId: string; }
interface Product { id: string; name: string; retailPrice?: number | null; wholesalePrice?: number | null; purchasePrice?: number | null; pricingTiers?: Record<string, number | null> | null; }
interface SalesItem { id: string; productId: string; quantity: number; unitPrice: number; discount: number; product: Product; }
interface SalesOrder {
  id: string; companyId: string; customerId: string; engineerId?: string | null; orderType: string; status: string; total: number; discount: number;
  discountType: string; taxRate: number; paymentMethod: string; paymentStatus: string;
  notes: string | null; orderDate: string; createdAt: string; customer: Customer; company?: Company; engineer?: Engineer | null; items: SalesItem[];
  salesCategory?: SalesCategory | null;
  categoryId?: string | null;
  tradeInTotal?: number; isIntercompany?: boolean; paidAmount?: number;
  interCompanyFromCompanyId?: string; interCompanyToCompanyId?: string; interCompanyTotal?: number;
}
interface ItemRow { 
  productId: string; 
  quantity: string; 
  unitPrice: string; 
  discount: string; 
  priceTier: string; 
  tradeIn?: {
    name: string;
    brand: string;
    condition: string;
    value: string;
    serialNumber: string;
  };
}

interface InterItemRow {
  productId: string;
  quantity: string;
  internalPrice: string;
  customerPrice: string;
  costPrice: string;
}

interface PriceHistory {
  lastSalePrice: number | null;
  lastSaleTier: string | null;
  lastSaleAt: string | null;
  lastPurchasePrice: number | null;
  lastPurchaseAt: string | null;
}

const PRICE_TIER_LABELS: Record<string, string> = {
  legacyCustomer: "عميل قديم",
  newCustomer: "عميل جديد",
  jumlaMachines: "شركة جملة آلات",
  jumlaParts: "شركة جملة قطع غيار",
  sectori: "شركة قطاعي",
  engineer: "مهندس",
  custom: "سعر حر (اختياري)",
};

const COMPANY_ORDER_TIERS: Record<string, string> = {
  company1: "jumlaMachines",
  company2: "jumlaParts",
  company3: "sectori",
};

const getProductTierPrice = (product: Product | undefined, tier: string) => {
  const tiers = product?.pricingTiers ?? {};
  const tierValue = tiers[tier];
  if (typeof tierValue === "number" && Number.isFinite(tierValue)) return tierValue;
  if (tier === "engineer") return product?.wholesalePrice ?? product?.retailPrice ?? 0;
  return product?.retailPrice ?? product?.wholesalePrice ?? 0;
};

type OrderKind = "regular" | "tradeIn" | "inter";

const orderKind = (order: SalesOrder): OrderKind => {
  if (order.isIntercompany) return "inter";
  const hasTradeIn =
    Number(order.tradeInTotal) > 0 ||
    (Array.isArray(order.items) && order.items.some((item) => (item as any).tradeInProduct));
  if (hasTradeIn) return "tradeIn";
  return "regular";
};

const ORDER_KIND_STYLE: Record<OrderKind, { row: string; badge: string; dot: string }> = {
  regular: {
    row: "bg-sky-50/60 hover:bg-sky-100/70",
    badge: "bg-sky-600 text-white",
    dot: "bg-sky-600",
  },
  tradeIn: {
    row: "bg-amber-50/60 hover:bg-amber-100/70",
    badge: "bg-amber-500 text-white",
    dot: "bg-amber-500",
  },
  inter: {
    row: "bg-indigo-50/60 hover:bg-indigo-100/70",
    badge: "bg-indigo-600 text-white",
    dot: "bg-indigo-600",
  },
};

const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  regular: "بيع عادي",
  tradeIn: "استبدال",
  inter: "بيع داخلي",
};

export default function SalesPage() {
  const { t, dir } = useI18n();

  const { success: toastSuccess, error: toastError } = useToast();
  const confirmAction = useConfirm();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [salesCategories, setSalesCategories] = useState<SalesCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryByProduct, setInventoryByProduct] = useState<Record<string, number>>({});
  const [inventoryByProductPerCompany, setInventoryByProductPerCompany] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingInter, setSavingInter] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"regular" | "tradeIn">("regular");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingOrder, setViewingOrder] = useState<SalesOrder | null>(null);
  const [form, setForm] = useState({ companyId: "", customerId: "", engineerId: "", categoryId: "", orderType: "MACHINE_SALE", paymentMethod: "CASH", isTaxInvoice: false, discount: "", discountType: "FIXED", taxRate: "0", notes: "", paidAmount: "" });
  const [itemRows, setItemRows] = useState<ItemRow[]>([{ productId: "", quantity: "", unitPrice: "", discount: "", priceTier: "newCustomer" }]);
  const [priceHistory, setPriceHistory] = useState<Record<string, PriceHistory>>({});
  const [priceHistoryLoading, setPriceHistoryLoading] = useState<Record<string, boolean>>({});
  const [showInterForm, setShowInterForm] = useState(false);
  const [interForm, setInterForm] = useState({ fromCompanyId: "", toCompanyId: "", customerId: "", engineerId: "", categoryId: "", orderType: "SPARE_PART_SALE", paymentMethod: "CREDIT", internalPaymentMethod: "CREDIT", paidAmount: "", internalPaidAmount: "", isTaxInvoice: false, taxRate: "0", discount: "", notes: "" });
  const [interRows, setInterRows] = useState<InterItemRow[]>([{ productId: "", quantity: "", internalPrice: "", customerPrice: "", costPrice: "" }]);
  const [tradeInProduct, setTradeInProduct] = useState<{ name: string; brand: string; condition: string; value: string; serialNumber: string }>({ name: "", brand: "", condition: "", value: "", serialNumber: "" });
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const filtered = orders.filter(order =>
    (!paymentFilter || order.paymentStatus === paymentFilter) &&
    (!typeFilter || order.orderType === typeFilter) &&
    (!companyFilter || order.companyId === companyFilter) &&
    inDateRange(order.orderDate || order.createdAt, dateFrom, dateTo) &&
    (matchesQuery(order.customer?.name, search) ||
      matchesQuery(order.id, search) ||
      matchesQuery(ORDER_TYPE_LABELS[order.orderType], search) ||
      matchesQuery(order.items.map(i => i.product?.name).join(" "), search))
  );
  const hasActiveFilters = paymentFilter !== "" || typeFilter !== "" || companyFilter !== "" || dateFrom !== "" || dateTo !== "" || search !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const companyStock = (companyId: string) => inventoryByProductPerCompany[companyId] ?? {};
  const companyProducts = (companyId: string) => {
    const stock = companyStock(companyId);
    const hasData = Object.keys(stock).length > 0;
    if (companyId && hasData) return products.filter((p) => (stock[p.id] ?? 0) > 0);
    return products;
  };

  const exportSales = () => ({
    headers: [
      t("sales.orderNumber"),
      t("common.company"),
      t("sales.customer"),
      t("sales.orderType"),
      t("sales.category"),
      t("sales.total"),
      t("sales.discount"),
      t("sales.paymentMethod"),
      t("sales.paymentStatus"),
      t("common.date"),
    ],
    rows: filtered.map((order) => [
      order.id.slice(0, 8),
      order.company?.name || companies.find((c) => c.id === order.companyId)?.name || "",
      order.customer.name,
      ORDER_TYPE_LABELS[order.orderType] || order.orderType,
      order.salesCategory?.name || "",
      String(order.total),
      String(order.discount),
      PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod,
      PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus,
      new Date(order.orderDate || order.createdAt).toISOString().slice(0, 10),
    ]),
  });

  const fetchData = async () => {
    try {
      const [sRes, cRes, coRes, eRes, inventoryRes, catRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/customers"),
        fetch("/api/companies"),
        fetch("/api/engineers"),
        fetch("/api/inventory?catalog=true"),
        fetch("/api/sales-categories")
      ]);
      const ordersData = await sRes.json();
      const customersData = await cRes.json();
      const companiesData = await coRes.json();
      const engineersData = await eRes.json();
      const inventoryData = await inventoryRes.json();
      const catsData = await catRes.json().catch(() => []);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setCustomers(Array.isArray(customersData) ? customersData : []);
      setCompanies(Array.isArray(companiesData) ? companiesData : []);
      setEngineers(Array.isArray(engineersData) ? engineersData : []);
      setSalesCategories(Array.isArray(catsData) ? catsData : []);
      const catalogProducts = Array.isArray(inventoryData.products) ? inventoryData.products : [];
      setProducts(catalogProducts);
      const stockMap: Record<string, number> = {};
      const perCompanyStock: Record<string, Record<string, number>> = {};
      for (const entry of Array.isArray(inventoryData.inventory) ? inventoryData.inventory : []) {
        stockMap[entry.productId] = (stockMap[entry.productId] ?? 0) + Number(entry.quantity || 0);
        const companyId = entry.warehouse?.companyId;
        if (!companyId) continue;
        perCompanyStock[companyId] = perCompanyStock[companyId] ?? {};
        perCompanyStock[companyId][entry.productId] = (perCompanyStock[companyId][entry.productId] ?? 0) + Number(entry.quantity || 0);
      }
      setInventoryByProduct(stockMap);
      setInventoryByProductPerCompany(perCompanyStock);
    } finally {
      setLoading(false);
    }
  };

  const { refresh, refreshing } = useAutoRefresh(fetchData, ["sales", "products", "inventory", "customers", "companies", "trade-ins"]);

  useEffect(() => { fetchData(); }, []);

  const autoAddOpen = useAutoAddForm();
  useEffect(() => {
    if (autoAddOpen) setShowForm(true);
  }, [autoAddOpen]);

  const updateItemRow = (index: number, next: Partial<ItemRow>) => {
    setItemRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const merged = { ...row, ...next };
      const productChanged = next.productId !== undefined && next.productId !== row.productId;
      const tierChanged = next.priceTier !== undefined && next.priceTier !== row.priceTier;
      // auto-fill price only when product or tier changes — never while typing price/qty
      if ((productChanged || tierChanged) && merged.productId) {
        const selectedProduct = products.find((product) => product.id === merged.productId);
        if (selectedProduct) {
          if (merged.priceTier === "custom") {
            // free price: keep what user typed; suggest default price only for a newly picked product
            if (productChanged) merged.unitPrice = String(getProductTierPrice(selectedProduct, "newCustomer"));
          } else {
            merged.unitPrice = String(getProductTierPrice(selectedProduct, merged.priceTier || "newCustomer"));
          }
        }
      }
      return merged;
    }));
    if (next.productId) loadPriceHistory([next.productId], form.companyId);
  };

  const loadPriceHistory = (productIds: string[], companyId: string) => {
    const missing = productIds.filter((id) => id && !priceHistory[id]);
    if (missing.length === 0) return;
    setPriceHistoryLoading((prev) => {
      const next = { ...prev };
      for (const id of missing) next[id] = true;
      return next;
    });
    fetch("/api/products/price-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, productIds: missing }),
    })
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        if (data?.prices) setPriceHistory((prev) => ({ ...prev, ...data.prices }));
      })
      .catch(() => {})
      .finally(() => {
        setPriceHistoryLoading((prev) => {
          const next = { ...prev };
          for (const id of missing) next[id] = false;
          return next;
        });
      });
  };

  const openEdit = (order: SalesOrder) => {
    const kind = orderKind(order);
    if (kind === "inter") {
      const inter = order as any;
      const fromCompanyId = inter.interCompanyFromCompanyId || "";
      const toCompanyId = inter.interCompanyToCompanyId || order.companyId;
      const tier = COMPANY_ORDER_TIERS[toCompanyId] || "sectori";
      setEditingId(order.id);
      setInterForm({
        fromCompanyId,
        toCompanyId,
        customerId: order.customerId,
        engineerId: order.engineerId || "",
        categoryId: order.salesCategory?.id || order.categoryId || "",
        orderType: order.orderType,
        paymentMethod: order.paymentMethod,
        internalPaymentMethod: "CREDIT",
        paidAmount: String(order.paidAmount),
        internalPaidAmount: "",
        isTaxInvoice: order.taxRate > 0,
        taxRate: String(order.taxRate),
        discount: String(order.discount),
        notes: order.notes || "",
      });
      setInterRows(
        order.items.length > 0
          ? order.items.map((item: any) => {
              const product = products.find((p) => p.id === item.productId);
              const internalPrice = product ? getProductTierPrice(product, tier) : 0;
              const costPrice = product?.purchasePrice || 0;
              return {
                productId: item.productId,
                quantity: String(item.quantity),
                internalPrice: String(internalPrice),
                customerPrice: String(item.unitPrice),
                costPrice: String(costPrice || ""),
              };
            })
          : [{ productId: "", quantity: "", internalPrice: "", customerPrice: "", costPrice: "" }]
      );
      setShowInterForm(true);
      return;
    }
    setEditingId(order.id);
    const hasTradeIn = kind === "tradeIn";
    setFormMode(hasTradeIn ? "tradeIn" : "regular");
    setForm({
      companyId: order.companyId,
      customerId: order.customerId,
      engineerId: order.engineerId || "",
      categoryId: order.salesCategory?.id || order.categoryId || "",
      orderType: order.orderType,
      paymentMethod: order.paymentMethod,
      isTaxInvoice: order.taxRate > 0,
      discount: String(order.discount),
      discountType: order.discountType,
      taxRate: String(order.taxRate),
      notes: order.notes || "",
      paidAmount: String(order.paidAmount ?? ""),
    });
    setItemRows(
      order.items.length > 0
        ? order.items.map((item: any) => ({
            productId: item.productId,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
            discount: String(item.discount),
            priceTier: "newCustomer",
          }))
        : [{ productId: "", quantity: "", unitPrice: "", discount: "", priceTier: "newCustomer" }]
    );
    loadPriceHistory(
      order.items.map((item) => item.productId),
      order.companyId
    );
    if (hasTradeIn) {
      const tradeInItem = order.items.find((item: any) => item.tradeInProduct);
      if (tradeInItem) {
        const tip = (tradeInItem as any).tradeInProduct;
        setTradeInProduct({
          name: tip?.name || "",
          brand: tip?.brand || "",
          condition: tip?.condition || "",
          value: String((tradeInItem as any).tradeInValue || ""),
          serialNumber: tip?.description?.replace("S/N: ", "") || "",
        });
      }
    } else {
      setTradeInProduct({ name: "", brand: "", condition: "", value: "", serialNumber: "" });
    }
    setShowForm(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = itemRows
      .filter(row => row.productId && row.quantity && row.unitPrice)
      .map(row => { 
        const useTopLevel = formMode === "tradeIn" && tradeInProduct.name && tradeInProduct.value;
        const tradeIn = useTopLevel ? {
          name: tradeInProduct.name,
          brand: tradeInProduct.brand || undefined,
          condition: tradeInProduct.condition || undefined,
          value: Number(tradeInProduct.value) || 0,
          serialNumber: tradeInProduct.serialNumber || undefined,
        } : row.tradeIn && row.tradeIn.name && row.tradeIn.value ? {
          name: row.tradeIn.name,
          brand: row.tradeIn.brand || undefined,
          condition: row.tradeIn.condition || undefined,
          value: Number(row.tradeIn.value) || 0,
          serialNumber: row.tradeIn.serialNumber || undefined,
        } : undefined;
        return {
          productId: row.productId, 
          quantity: Number(row.quantity), 
          unitPrice: Number(row.unitPrice), 
          discount: Number(row.discount) || 0, 
          priceTier: row.priceTier,
          tradeIn,
        };
      });
    if (!items.length) { toastError(t("errors.INVALID_SALE_ITEMS")); return; }
    const safeTaxRate = form.isTaxInvoice ? 14 : (parseFloat(form.taxRate) || 0);
    const payload = {
      ...form,
      engineerId: form.engineerId || undefined,
      discount: parseFloat(form.discount) || 0,
      taxRate: safeTaxRate,
      paidAmount: form.paymentMethod === "CASH" ? 0 : (parseFloat(form.paidAmount) || 0),
      orderDate: new Date().toISOString(),
      items,
    };
    setSaving(true);
    const response = await fetch(editingId ? `/api/sales/${editingId}` : "/api/sales", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { toastError(apiErrorMessage(data, t)); setSaving(false); return; }
    setForm({ companyId: "", customerId: "", engineerId: "", categoryId: "", orderType: "MACHINE_SALE", paymentMethod: "CASH", isTaxInvoice: false, discount: "", discountType: "FIXED", taxRate: "0", notes: "", paidAmount: "" });
    setItemRows([{ productId: "", quantity: "", unitPrice: "", discount: "", priceTier: "newCustomer" }]);
    setTradeInProduct({ name: "", brand: "", condition: "", value: "", serialNumber: "" });
    setEditingId(null);
    setFormMode("regular");
    setSaving(false);
    setShowForm(false);
    setPriceHistory({});
    setPriceHistoryLoading({});
    refresh();
    notifyDataChanged(["sales", "products", "inventory", "customers", "companies", "trade-ins", "notifications"]);
    toastSuccess(t("common.savedSuccessfully"));
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ message: t("common.deleteConfirm") }))) return;
    const res = await fetch(`/api/sales/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) { toastError(apiErrorMessage(data, t)); return; }
    setViewingOrder(null);
    setPriceHistory({});
    setPriceHistoryLoading({});
    refresh();
    notifyDataChanged(["sales", "products", "inventory", "customers", "companies", "notifications"]);
    toastSuccess(t("common.deletedSuccessfully"));
  };

  const updateInterRow = (index: number, next: Partial<InterItemRow>) => {
    setInterRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const merged = { ...row, ...next };
      if (merged.productId) {
        const product = products.find((p) => p.id === merged.productId);
        const targetCompanyId = interForm.toCompanyId;
        const targetTier = COMPANY_ORDER_TIERS[targetCompanyId] || "sectori";
        if (targetCompanyId && product) {
          merged.internalPrice = String(getProductTierPrice(product, targetTier));
        }
        if (product) {
          merged.customerPrice = merged.customerPrice || String(getProductTierPrice(product, "newCustomer"));
          if (!merged.costPrice && product.purchasePrice) merged.costPrice = String(product.purchasePrice);
        }
      }
      return merged;
    }));
  };

  const handleInterCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = interRows
      .filter((row) => row.productId && row.quantity)
      .map((row) => ({
        productId: row.productId,
        quantity: Number(row.quantity),
        internalPrice: Number(row.internalPrice) || 0,
        customerPrice: Number(row.customerPrice) || 0,
        costPrice: Number(row.costPrice) || 0,
      }));
    if (!items.length) { toastError(t("errors.INVALID_SALE_ITEMS")); return; }
    if (!interForm.fromCompanyId || !interForm.toCompanyId || !interForm.customerId) {
      toastError(t("errors.INTERCOMPANY_FIELDS_REQUIRED"));
      return;
    }
    const safeTaxRate = interForm.isTaxInvoice ? 14 : (parseFloat(interForm.taxRate) || 0);
    setSavingInter(true);
    const response = await fetch(editingId ? `/api/sales/intercompany/${editingId}` : "/api/sales/intercompany", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...interForm,
        discount: parseFloat(interForm.discount) || 0,
        paidAmount: parseFloat(interForm.paidAmount) || 0,
        internalPaidAmount: parseFloat(interForm.internalPaidAmount) || 0,
        taxRate: safeTaxRate,
        items,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { toastError(apiErrorMessage(data, t)); setSavingInter(false); return; }
    setInterForm({ fromCompanyId: "", toCompanyId: "", customerId: "", engineerId: "", categoryId: "", orderType: "SPARE_PART_SALE", paymentMethod: "CREDIT", internalPaymentMethod: "CREDIT", paidAmount: "", internalPaidAmount: "", isTaxInvoice: false, taxRate: "0", discount: "", notes: "" });
    setInterRows([{ productId: "", quantity: "", internalPrice: "", customerPrice: "", costPrice: "" }]);
    setEditingId(null);
    setSavingInter(false);
    setShowInterForm(false);
    setPriceHistory({});
    setPriceHistoryLoading({});
    refresh();
    notifyDataChanged(["sales", "products", "inventory", "customers", "companies", "notifications"]);
    toastSuccess(t("common.savedSuccessfully"));
  };

  return (
    <div dir={dir} className="space-y-5">
      <AddFormBoundary />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-sky-600 uppercase">ERP</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl lg:text-3xl">{t("sales.title")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setFormMode("regular"); setShowForm(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"><Plus size={16} />{t("sales.addOrder")}</button>
          <button onClick={() => { setFormMode("tradeIn"); setShowForm(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"><RotateCcw size={16} />إضافة فاتورة استبدال</button>
          <button onClick={() => setShowInterForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><ArrowLeftRight size={16} />{t("sales.interCompanySale")}</button>
          <Link href="/sales/categories" className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"><Tags size={16} />{t("sales.salesCategories")}</Link>
        </div>
      </div>

      <FormModal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? "تعديل فاتورة بيع" : formMode === "tradeIn" ? "إضافة فاتورة استبدال" : t("sales.addOrder")} wide>
        <form onSubmit={handleCreate} className="space-y-5">
          {(() => {
            const isTradeIn = formMode === "tradeIn";
            const kind = isTradeIn ? "tradein" : form.orderType === "SPARE_PART_SALE" ? "spare" : "machine";
            const cfg: Record<string, string> = { machine: "border-blue-200 bg-blue-50 text-blue-700", spare: "border-green-200 bg-green-50 text-green-700", tradein: "border-amber-200 bg-amber-50 text-amber-700" };
            const label = isTradeIn ? "فاتورة استبدال" : form.orderType === "SPARE_PART_SALE" ? "فاتورة بيع قطع غيار" : "فاتورة بيع جهاز";
            return (
              <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${cfg[kind]}`}>
                <span className="text-sm font-bold">{label}</span>
                <span className="text-xs opacity-80">{editingId ? "تعديل" : "إضافة جديدة"}</span>
              </div>
            );
          })()}
          {formMode === "tradeIn" && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔄</span>
                <p className="text-sm font-bold text-amber-800">بيانات المنتج المستبدل (القديم)</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-5">
                <input type="text" placeholder="اسم المنتج القديم *" value={tradeInProduct.name} onChange={(e) => setTradeInProduct({ ...tradeInProduct, name: e.target.value })} className="rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500" required />
                <input type="text" placeholder="الماركة" value={tradeInProduct.brand} onChange={(e) => setTradeInProduct({ ...tradeInProduct, brand: e.target.value })} className="rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                <select value={tradeInProduct.condition} onChange={(e) => setTradeInProduct({ ...tradeInProduct, condition: e.target.value })} className="rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">الحالة</option>
                  <option value="excellent">ممتاز</option>
                  <option value="good">جيد</option>
                  <option value="fair">مقبول</option>
                  <option value="poor">ضعيف</option>
                </select>
                <input type="number" min="0" placeholder="قيمة الاستبدال *" value={tradeInProduct.value} onChange={(e) => setTradeInProduct({ ...tradeInProduct, value: e.target.value })} className="rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500" required />
                <input type="text" placeholder="الرقم التسلسلي (اختياري)" value={tradeInProduct.serialNumber} onChange={(e) => setTradeInProduct({ ...tradeInProduct, serialNumber: e.target.value })} className="rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("companies.selectCompany")}</label><select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required><option value="">{t("companies.selectCompany")}</option>{companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></div>
            <SelectWithAdd
              label={t("sales.customer")}
              value={form.customerId}
              onChange={(v) => setForm({ ...form, customerId: v })}
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={t("sales.selectCustomer")}
              required
              quickAddTitle="إضافة عميل جديد"
              quickAddFields={[
                { key: "name", label: "اسم العميل", required: true },
                { key: "phone", label: "الهاتف", placeholder: "01xxxxxxxxx" },
                { key: "companyName", label: "اسم الشركة" },
                { key: "email", label: "البريد الإلكتروني", type: "email" },
                { key: "address", label: "العنوان" },
                { key: "city", label: "المدينة" },
                { key: "customerType", label: "نوع العميل", type: "select", options: [{ value: "INDIVIDUAL", label: "فرد" }, { value: "COMPANY", label: "شركة" }] },
                { key: "whatsapp", label: "واتساب" },
              ]}
              quickAddEndpoint="/api/customers"
              onQuickAddSuccess={(item) => {
                setCustomers((prev) => [...prev, item]);
                setForm((f) => ({ ...f, customerId: item.id }));
              }}
            />
            {(() => {
              const sel = customers.find((c) => c.id === form.customerId);
              if (sel && (sel.remainingDebt ?? 0) < 0) {
                const credit = Math.abs(sel.remainingDebt ?? 0);
                return (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700 md:col-span-2">
                    {t("sales.creditNotice")}: {credit.toLocaleString("ar-EG")} ج.م
                  </div>
                );
              }
              return null;
            })()}
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">المهندس (اختياري)</label><SearchableSelect value={form.engineerId} onChange={(v) => setForm({ ...form, engineerId: v })} options={engineers.map((engineer) => ({ value: engineer.id, label: engineer.name }))} placeholder="المهندس (اختياري)" /></div>
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">نوع الطلب</label><select value={form.orderType} onChange={(e) => setForm({ ...form, orderType: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="MACHINE_SALE">{ORDER_TYPE_LABELS.MACHINE_SALE}</option><option value="SPARE_PART_SALE">{ORDER_TYPE_LABELS.SPARE_PART_SALE}</option></select></div>
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("sales.category")}</label><select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="">{t("sales.noCategory")}</option>{salesCategories.filter((c) => !form.companyId || c.companyId === form.companyId).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></div>
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">طريقة الدفع</label><select value={form.paymentMethod === "CREDIT" ? "CREDIT" : form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="CASH">{PAYMENT_METHOD_LABELS.CASH}</option><option value="CREDIT">{PAYMENT_METHOD_LABELS.CREDIT}</option></select></div>
            {form.paymentMethod !== "CASH" && (
              <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">المبلغ المدفوع نقداً (ج.م) <span className="text-xs font-normal text-gray-400">— يُخصم رصيد تحت الحساب تلقائياً أولاً</span></label><input type="number" min="0" step="0.01" placeholder="0.00" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            )}
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">الضريبة</label><div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5"><input id="isTaxInvoice" type="checkbox" checked={form.isTaxInvoice} onChange={(e) => setForm({ ...form, isTaxInvoice: e.target.checked, taxRate: e.target.checked ? "14" : "0" })} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><label htmlFor="isTaxInvoice" className="text-sm font-medium text-slate-700">فاتورة ضريبية</label>{form.isTaxInvoice && <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">14%</span>}</div></div>
            {form.isTaxInvoice && <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("sales.taxRate")}</label><input type="number" min="0" step="0.01" placeholder={t("sales.taxRate")} value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("sales.discount")}</label><div className="flex gap-2"><input type="number" placeholder={t("sales.discount")} value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" /><select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="FIXED">{t("sales.discountTypeFixed")}</option><option value="PERCENTAGE">{t("sales.discountTypePercent")}</option></select></div></div>
          </div>

          {(formMode === "tradeIn" || itemRows.some(row => row.tradeIn && row.tradeIn.value)) && (
            <div className="rounded-xl border border-amber-200 bg-gradient-to-l from-amber-50 to-white p-4">
              <h4 className="mb-3 text-sm font-bold text-amber-800">📊 ملخص الحسابات</h4>
              {(() => {
                const subtotal = itemRows.reduce((sum, row) => sum + (row.quantity ? Number(row.quantity) * Number(row.unitPrice) - (Number(row.discount) || 0) : 0), 0);
                const tradeInVal = formMode === "tradeIn" ? (Number(tradeInProduct.value) || 0) : itemRows.reduce((sum, row) => sum + (row.tradeIn?.value ? Number(row.tradeIn.value) : 0), 0);
                const afterTradeIn = Math.max(0, subtotal - tradeInVal);
                return (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600"><span>اجمالي المنتجات</span><span className="font-medium">{subtotal.toLocaleString("ar-EG")} ج.م</span></div>
                    {tradeInVal > 0 && (
                      <>
                        <div className="flex justify-between text-amber-700"><span>قيمة الاستبدال (الخصم)</span><span className="font-bold">- {tradeInVal.toLocaleString("ar-EG")} ج.م</span></div>
                        <div className="border-t border-amber-200 pt-2 flex justify-between text-slate-800 font-semibold"><span>المبلغ بعد خصم الاستبدال</span><span>{afterTradeIn.toLocaleString("ar-EG")} ج.م</span></div>
                      </>
                    )}
                    {tradeInVal === 0 && <div className="text-xs text-slate-400">لم يتم إدخال قيمة استبدال</div>}
                  </div>
                );
              })()}
            </div>
          )}

          <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("common.notes")}</label><textarea placeholder={t("common.notes")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} /></div>

          <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-700">{t("sales.items")}</h3><button type="button" onClick={() => setItemRows([...itemRows, { productId: "", quantity: "", unitPrice: "", discount: "", priceTier: "newCustomer" }])} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"><Plus size={16} />{t("purchases.addRow")}</button></div>
            <div className="space-y-3">{itemRows.map((row, index) => {
              const selectedProduct = products.find((product) => product.id === row.productId);
              const availableQty = row.productId ? inventoryByProduct[row.productId] ?? 0 : 0;
              const rowPrice = selectedProduct
                ? row.priceTier === "custom"
                  ? Number(row.unitPrice) || 0
                  : getProductTierPrice(selectedProduct, row.priceTier || "newCustomer")
                : 0;
              const ph = row.productId ? priceHistory[row.productId] : undefined;
              const phLoading = row.productId ? Boolean(priceHistoryLoading[row.productId]) : false;
              const lastSaleTierLabel = ph?.lastSaleTier && PRICE_TIER_LABELS[ph.lastSaleTier] ? PRICE_TIER_LABELS[ph.lastSaleTier] : null;
              return (
                <div key={index}>
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto]">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("sales.product")}</label>
                        <SearchableSelect value={row.productId} onChange={(v) => updateItemRow(index, { productId: v, priceTier: row.priceTier || "newCustomer" })} options={companyProducts(form.companyId).map((product) => ({ value: product.id, label: product.name }))} placeholder={t("purchases.selectProduct")} required />
                        {selectedProduct && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
                            <span>المتاح: <span className="font-semibold text-slate-700">{availableQty}</span></span>
                            {ph?.lastSalePrice != null && lastSaleTierLabel && (
                              <span>آخر بيع: <span className="font-semibold text-slate-700">{ph.lastSalePrice.toLocaleString()}</span> · <span className="font-medium text-blue-600">{lastSaleTierLabel}</span></span>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">شريحة السعر</label>
                        <select value={row.priceTier} onChange={(e) => updateItemRow(index, { priceTier: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="legacyCustomer">عميل قديم</option><option value="newCustomer">عميل جديد</option><option value="jumlaMachines">شركة جملة آلات</option><option value="jumlaParts">شركة جملة قطع غيار</option><option value="sectori">شركة قطاعي</option><option value="engineer">مهندس</option><option value="custom">سعر حر (اختياري)</option></select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("sales.qty")}</label>
                        <input type="number" min="1" required value={row.quantity} onChange={(e) => updateItemRow(index, { quantity: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("sales.unitPrice")}{row.priceTier === "custom" && <span className="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">حر</span>}</label>
                        <input type="number" min="0" step="0.01" required value={row.unitPrice} onChange={(e) => updateItemRow(index, { unitPrice: e.target.value })} placeholder={row.priceTier === "custom" ? "اكتب السعر بحرية" : undefined} className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${row.priceTier === "custom" ? "border-amber-400 bg-amber-50/50 focus:border-amber-500 focus:ring-amber-500" : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"}`} />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("sales.discount")}</label>
                        <input type="number" min="0" step="0.01" value={row.discount} onChange={(e) => updateItemRow(index, { discount: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      {itemRows.length > 1 && <button type="button" onClick={() => setItemRows(itemRows.filter((_, i) => i !== index))} className="mt-7 inline-flex h-11 w-11 items-center justify-center self-start rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100">×</button>}
                    </div>
                    {selectedProduct && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-blue-50/60 px-3 py-2">
                        <span className="text-sm text-slate-700"><span className="font-semibold">السعر الحالي ({PRICE_TIER_LABELS[row.priceTier] || "—"}):</span> {rowPrice.toLocaleString()}</span>
                        {phLoading && (
                          <span className="text-sm text-slate-400">جاري تحميل آخر سعر...</span>
                        )}
                        {!phLoading && ph?.lastSalePrice != null && (
                          <span className="text-sm font-semibold text-indigo-700">آخر بيع: {ph.lastSalePrice.toLocaleString()}{lastSaleTierLabel ? ` (${lastSaleTierLabel})` : ""}</span>
                        )}
                        {!phLoading && ph?.lastPurchasePrice != null && (
                          <span className="text-sm font-semibold text-emerald-700">آخر شراء: {ph.lastPurchasePrice.toLocaleString()}</span>
                        )}
                        {!phLoading && ph && ph.lastSalePrice == null && ph.lastPurchasePrice == null && (
                          <span className="text-sm text-slate-400">لا يوجد سجل أسعار سابق</span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {formMode === "tradeIn" && row.tradeIn && (
                    <div className="mt-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-amber-800">🔄 بيانات الاستبدال لهذا المنتج</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-5">
                        <input type="text" placeholder="اسم المنتج القديم" value={row.tradeIn.name} onChange={(e) => updateItemRow(index, { tradeIn: { ...row.tradeIn!, name: e.target.value } })} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                        <input type="text" placeholder="الماركة" value={row.tradeIn.brand} onChange={(e) => updateItemRow(index, { tradeIn: { ...row.tradeIn!, brand: e.target.value } })} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                        <select value={row.tradeIn.condition} onChange={(e) => updateItemRow(index, { tradeIn: { ...row.tradeIn!, condition: e.target.value } })} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500">
                          <option value="">الحالة</option>
                          <option value="excellent">ممتاز</option>
                          <option value="good">جيد</option>
                          <option value="fair">مقبول</option>
                          <option value="poor">ضعيف</option>
                        </select>
                        <input type="number" min="0" placeholder="قيمة الاستبدال" value={row.tradeIn.value} onChange={(e) => updateItemRow(index, { tradeIn: { ...row.tradeIn!, value: e.target.value } })} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                        <input type="text" placeholder="الرقم التسلسلي (اختياري)" value={row.tradeIn.serialNumber} onChange={(e) => updateItemRow(index, { tradeIn: { ...row.tradeIn!, serialNumber: e.target.value } })} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}</div>
          </div>

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"><X size={16} className="ms-1 inline-block" />{t("common.cancel")}</button>
            <SubmitButton loading={saving} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-blue-600 hover:bg-blue-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      <FormModal open={showInterForm} onClose={() => { setShowInterForm(false); setEditingId(null); }} title={editingId ? "تعديل بيع داخلي" : t("sales.interCompanySale")} wide>
        <form onSubmit={handleInterCreate} className="space-y-5">
          <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-4 text-sm text-indigo-800">
            {t("sales.interCompanyHint")}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("sales.fromCompany")}</label>
              <select value={interForm.fromCompanyId} onChange={(e) => setInterForm({ ...interForm, fromCompanyId: e.target.value, toCompanyId: e.target.value === interForm.toCompanyId ? "" : interForm.toCompanyId })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                <option value="">{t("companies.selectCompany")}</option>
                {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("sales.toCompany")}</label>
              <select value={interForm.toCompanyId} onChange={(e) => setInterForm({ ...interForm, toCompanyId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                <option value="">{t("companies.selectCompany")}</option>
                {companies.filter((c) => c.id !== interForm.fromCompanyId).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <SelectWithAdd
              label={t("sales.customer")}
              value={interForm.customerId}
              onChange={(v) => setInterForm({ ...interForm, customerId: v })}
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={t("sales.selectCustomer")}
              required
              quickAddTitle="إضافة عميل جديد"
              quickAddFields={[
                { key: "name", label: "اسم العميل", required: true },
                { key: "phone", label: "الهاتف", placeholder: "01xxxxxxxxx" },
                { key: "companyName", label: "اسم الشركة" },
                { key: "email", label: "البريد الإلكتروني", type: "email" },
                { key: "address", label: "العنوان" },
                { key: "city", label: "المدينة" },
                { key: "customerType", label: "نوع العميل", type: "select", options: [{ value: "INDIVIDUAL", label: "فرد" }, { value: "COMPANY", label: "شركة" }] },
                { key: "whatsapp", label: "واتساب" },
              ]}
              quickAddEndpoint="/api/customers"
              onQuickAddSuccess={(item) => {
                setCustomers((prev) => [...prev, item]);
                setInterForm((f) => ({ ...f, customerId: item.id }));
              }}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("sales.orderType")}</label>
              <select value={interForm.orderType} onChange={(e) => setInterForm({ ...interForm, orderType: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="MACHINE_SALE">{ORDER_TYPE_LABELS.MACHINE_SALE}</option>
                <option value="SPARE_PART_SALE">{ORDER_TYPE_LABELS.SPARE_PART_SALE}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("sales.category")}</label>
              <select value={interForm.categoryId} onChange={(e) => setInterForm({ ...interForm, categoryId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">{t("sales.noCategory")}</option>
                {salesCategories.filter((c) => !interForm.toCompanyId || c.companyId === interForm.toCompanyId).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">المهندس (اختياري)</label>
              <SearchableSelect value={interForm.engineerId} onChange={(v) => setInterForm({ ...interForm, engineerId: v })} options={engineers.map((engineer) => ({ value: engineer.id, label: engineer.name }))} placeholder="المهندس (اختياري)" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("sales.interCompanyPayment")} ({t("sales.toCompany")})</label>
              <select value={interForm.internalPaymentMethod === "CASH" ? "CASH" : "CREDIT"} onChange={(e) => setInterForm({ ...interForm, internalPaymentMethod: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="CREDIT">{PAYMENT_METHOD_LABELS.CREDIT}</option>
                <option value="CASH">{PAYMENT_METHOD_LABELS.CASH}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("sales.paymentMethod")} ({t("sales.customer")})</label>
              <select value={interForm.paymentMethod === "CASH" ? "CASH" : "CREDIT"} onChange={(e) => setInterForm({ ...interForm, paymentMethod: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="CASH">{PAYMENT_METHOD_LABELS.CASH}</option>
                <option value="CREDIT">{PAYMENT_METHOD_LABELS.CREDIT}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">المبلغ المدفوع من العميل (اختياري — للدفع الجزئي)</label>
              <input type="number" min="0" step="0.01" value={interForm.paidAmount} onChange={(e) => setInterForm({ ...interForm, paidAmount: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">المبلغ المدفوع في البيع الداخلي (اختياري — للدفع الجزئي)</label>
              <input type="number" min="0" step="0.01" value={interForm.internalPaidAmount} onChange={(e) => setInterForm({ ...interForm, internalPaidAmount: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("sales.total")}</label>
              <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5">
                <input id="interIsTax" type="checkbox" checked={interForm.isTaxInvoice} onChange={(e) => setInterForm({ ...interForm, isTaxInvoice: e.target.checked, taxRate: e.target.checked ? "14" : "0" })} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <label htmlFor="interIsTax" className="text-sm font-medium text-slate-700">فاتورة ضريبية</label>
                {interForm.isTaxInvoice && <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">14%</span>}
              </div>
            </div>
            {interForm.isTaxInvoice && <div className="space-y-1.5"><label className="block text-sm font-medium text-slate-700">{t("sales.taxRate")}</label><input type="number" min="0" step="0.01" value={interForm.taxRate} onChange={(e) => setInterForm({ ...interForm, taxRate: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">{t("sales.discount")}</label>
              <input type="number" min="0" value={interForm.discount} onChange={(e) => setInterForm({ ...interForm, discount: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t("common.notes")}</label>
            <textarea value={interForm.notes} onChange={(e) => setInterForm({ ...interForm, notes: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} />
          </div>

          <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">{t("sales.items")}</h3>
              <button type="button" onClick={() => setInterRows([...interRows, { productId: "", quantity: "", internalPrice: "", customerPrice: "", costPrice: "" }])} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"><Plus size={16} />{t("purchases.addRow")}</button>
            </div>
            <div className="space-y-3">
              {interRows.map((row, index) => {
                const selectedProduct = products.find((p) => p.id === row.productId);
                const availableQty = row.productId ? inventoryByProduct[row.productId] ?? 0 : 0;
                return (
                  <div key={index} className="grid gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-[1.2fr_90px_130px_130px_110px_auto]">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-gray-500">{t("sales.product")}</label>
                      <SearchableSelect value={row.productId} onChange={(v) => updateInterRow(index, { productId: v })} options={companyProducts(interForm.fromCompanyId).map((product) => ({ value: product.id, label: product.name }))} placeholder={t("purchases.selectProduct")} required />
                      {selectedProduct && (<div className="mt-1 text-[11px] text-slate-500">المتاح في الشركة المختارة: {availableQty}</div>)}
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-gray-500">{t("sales.qty")}</label>
                      <input type="number" min="1" required value={row.quantity} onChange={(e) => updateInterRow(index, { quantity: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-gray-500">{t("sales.interCompanyPrice")}</label>
                      <input type="number" min="0" step="0.01" required value={row.internalPrice} onChange={(e) => updateInterRow(index, { internalPrice: e.target.value })} className="w-full rounded-lg border border-indigo-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-gray-500">{t("sales.unitPrice")}</label>
                      <input type="number" min="0" step="0.01" required value={row.customerPrice} onChange={(e) => updateInterRow(index, { customerPrice: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-gray-500">{t("sales.costPrice")}</label>
                      <input type="number" min="0" step="0.01" value={row.costPrice} onChange={(e) => updateInterRow(index, { costPrice: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    {interRows.length > 1 && <button type="button" onClick={() => setInterRows(interRows.filter((_, i) => i !== index))} className="rounded-lg border border-red-200 bg-red-50 px-2 text-red-600 transition hover:bg-red-100">×</button>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setShowInterForm(false)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"><X size={16} className="ms-1 inline-block" />{t("common.cancel")}</button>
            <SubmitButton loading={savingInter} label={t("common.save")} loadingLabel={t("common.saving")} className="bg-indigo-600 hover:bg-indigo-700 text-white"><Save size={16} /></SubmitButton>
          </div>
        </form>
      </FormModal>

      {viewingOrder && (
        <FormModal open={!!viewingOrder} onClose={() => setViewingOrder(null)} title="تفاصيل فاتورة بيع" wide>
          <div className="space-y-4">
            {(() => {
              const isTradeIn = (viewingOrder as any).tradeInTotal > 0 || viewingOrder.items.some((it: any) => it.tradeInProduct);
              const kind = viewingOrder.orderType === "SPARE_PART_SALE" ? "spare" : isTradeIn ? "tradein" : "machine";
              const cfg: Record<string, string> = { machine: "border-blue-200 bg-blue-50 text-blue-700", spare: "border-green-200 bg-green-50 text-green-700", tradein: "border-amber-200 bg-amber-50 text-amber-700" };
              const label = isTradeIn ? "فاتورة استبدال" : (ORDER_TYPE_LABELS[viewingOrder.orderType] || viewingOrder.orderType);
              return (
                <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${cfg[kind] || cfg.machine}`}>
                  <span className="text-sm font-bold">{label}</span>
                  <span className="text-xs opacity-80">#{viewingOrder.id.slice(0, 8)}</span>
                </div>
              );
            })()}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div><span className="text-xs font-medium text-gray-500">{t("sales.orderNumber")}</span><p className="mt-1 text-sm font-medium text-slate-900">{viewingOrder.id.slice(0, 8)}</p></div>
              <div><span className="text-xs font-medium text-gray-500">{t("common.company")}</span><p className="mt-1 text-sm text-slate-900">{viewingOrder.company?.name || companies.find(c => c.id === viewingOrder.companyId)?.name || "—"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">{t("sales.customer")}</span><p className="mt-1 text-sm text-slate-900">{viewingOrder.customer.name}</p></div>
              <div><span className="text-xs font-medium text-gray-500">{t("sales.orderType")}</span><p className="mt-1 text-sm text-slate-900">{ORDER_TYPE_LABELS[viewingOrder.orderType] || viewingOrder.orderType}</p></div>
              {viewingOrder.salesCategory && <div><span className="text-xs font-medium text-gray-500">{t("sales.category")}</span><p className="mt-1 text-sm text-slate-900">{viewingOrder.salesCategory.name}</p></div>}
              <div><span className="text-xs font-medium text-gray-500">{t("sales.total")}</span><p className="mt-1 text-sm font-semibold text-slate-900">{viewingOrder.total.toLocaleString()}</p></div>
              <div><span className="text-xs font-medium text-gray-500">{t("sales.discount")}</span><p className="mt-1 text-sm text-slate-900">{viewingOrder.discount > 0 ? `${viewingOrder.discount} (${viewingOrder.discountType === "FIXED" ? t("sales.discountTypeFixed") : t("sales.discountTypePercent")})` : "-"}</p></div>
              <div><span className="text-xs font-medium text-gray-500">{t("sales.paymentMethod")}</span><p className="mt-1 text-sm text-slate-900">{PAYMENT_METHOD_LABELS[viewingOrder.paymentMethod] || viewingOrder.paymentMethod}</p></div>
              <div><span className="text-xs font-medium text-gray-500">{t("sales.paymentStatus")}</span><p className="mt-1"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${paymentStatusColors[viewingOrder.paymentStatus] || ""}`}>{PAYMENT_STATUS_LABELS[viewingOrder.paymentStatus] || viewingOrder.paymentStatus}</span></p></div>
              <div><span className="text-xs font-medium text-gray-500">{t("common.date")}</span><p className="mt-1 text-sm text-slate-900"><DateTimeCell value={viewingOrder.orderDate || viewingOrder.createdAt} /></p></div>
              {viewingOrder.engineer && <div><span className="text-xs font-medium text-gray-500">المهندس</span><p className="mt-1 text-sm text-slate-900">{viewingOrder.engineer.name}</p></div>}
              {viewingOrder.notes && <div className="md:col-span-2"><span className="text-xs font-medium text-gray-500">{t("common.notes")}</span><p className="mt-1 text-sm text-slate-900">{viewingOrder.notes}</p></div>}
            </div>
            {viewingOrder.items.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">{t("sales.items")}</h3>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("sales.product")}</th>
                      <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("sales.qty")}</th>
                      <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("sales.unitPrice")}</th>
                      <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("sales.discount")}</th>
                      <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("sales.subtotal")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {viewingOrder.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 text-sm">
                          {item.product.name}
                          {(item as any).tradeInProduct && (
                            <div className="mt-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-2">
                              <div className="flex items-center gap-2 text-xs text-amber-700">
                                <span>🔄 استبدال:</span>
                                <span className="font-medium">{(item as any).tradeInProduct.name}</span>
                                {(item as any).tradeInProduct.brand && <span>({(item as any).tradeInProduct.brand})</span>}
                                {(item as any).tradeInValue > 0 && <span className="font-bold">- {(item as any).tradeInValue.toLocaleString()} ج.م</span>}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm">{item.quantity}</td>
                        <td className="px-3 py-2 text-sm">{item.unitPrice.toLocaleString()}</td>
                        <td className="px-3 py-2 text-sm">{item.discount > 0 ? item.discount.toLocaleString() : "-"}</td>
                        <td className="px-3 py-2 text-sm font-medium">{(item.quantity * item.unitPrice - item.discount).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        </FormModal>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:flex-wrap">
          <div className="w-full md:w-80 md:flex-none"><SearchInput value={search} onChange={setSearch} placeholder={t("sales.searchPlaceholder")} /></div>
          <FilterSelect value={paymentFilter} onChange={(v) => { setPaymentFilter(v); setPage(1); }} options={Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))} allLabel={`${t("sales.paymentStatus")} — ${t("common.all")}`} className="md:w-40" />
          <FilterSelect value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} options={Object.entries(ORDER_TYPE_LABELS).map(([value, label]) => ({ value, label }))} allLabel={`${t("sales.typeFilter")} — ${t("common.all")}`} className="md:w-40" />
          <FilterSelect value={companyFilter} onChange={(v) => { setCompanyFilter(v); setPage(1); }} options={companies.map((c) => ({ value: c.id, label: c.name }))} allLabel={`${t("common.company")} — ${t("common.all")}`} className="md:w-40" />
          <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={(v) => { setDateFrom(v); setPage(1); }} onToChange={(v) => { setDateTo(v); setPage(1); }} />
          {hasActiveFilters && (<button onClick={() => { setSearch(""); setPaymentFilter(""); setTypeFilter(""); setCompanyFilter(""); setDateFrom(""); setDateTo(""); }} className="text-sm text-gray-500 underline transition hover:text-gray-700">{t("common.resetFilters")}</button>)}
          <div className="md:ms-auto mt-2 md:mt-0 flex gap-2"><RefreshButton onRefresh={refresh} refreshing={refreshing} /><ExportButton filename="sales-orders" getExport={exportSales} disabled={filtered.length === 0} /></div>
        </div>
        {loading ? (
          <div className="flex min-h-[320px] w-full items-center justify-center px-4 py-8">
            <PrinterLoader size="md" label={t("common.loading")} />
          </div>
        )
        : orders.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        )
        : filtered.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-sm text-gray-400">{t("common.noData")}</p>
          </div>
        )
        : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("sales.orderNumber")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.company")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("sales.customer")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("sales.orderType")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("sales.category")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("sales.total")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("sales.discount")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("sales.paymentMethod")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("sales.paymentStatus")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.date")}</th>
                  <th className="px-4 py-3 text-start text-sm font-medium text-gray-500">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paged.map((order) => {
                  const kind = orderKind(order);
                  const rowStyle = ORDER_KIND_STYLE[kind];
                  return (
                  <Fragment key={order.id}>
                    <tr className={`hover:bg-gray-50 ${rowStyle.row}`}>
                      <td className="px-4 py-3 text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${rowStyle.dot}`} title={ORDER_KIND_LABEL[kind]}></span>
                          {order.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{order.company?.name || companies.find(c => c.id === order.companyId)?.name || "—"}</td>
                      <td className="px-4 py-3 text-sm">{order.customer.name}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-col gap-1">
                          <span>{ORDER_TYPE_LABELS[order.orderType] || order.orderType}</span>
                          <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${rowStyle.badge}`}>{ORDER_KIND_LABEL[kind]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {order.salesCategory ? (
                          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">{order.salesCategory.name}</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {order.total.toLocaleString()}
                        {(order as any).tradeInTotal > 0 && (
                          <div className="text-xs text-amber-600">🔄 -{(order as any).tradeInTotal.toLocaleString()} ج.م</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{order.discount > 0 ? `${order.discount} (${order.discountType === "FIXED" ? t("sales.discountTypeFixed") : t("sales.discountTypePercent")})` : "-"}</td>
                      <td className="px-4 py-3 text-sm">{PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${paymentStatusColors[order.paymentStatus] || ""}`}>
                          {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm"><DateTimeCell value={order.orderDate || order.createdAt} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={(e) => { e.stopPropagation(); setViewingOrder(order); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-100" title={t("common.view")}>
                            <Eye size={14} />{t("common.view")}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); openEdit(order); }} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-medium text-blue-600 transition hover:bg-blue-100" title={t("common.edit")}>
                            <Pencil size={14} />{t("common.edit")}
                          </button>
                          <PrintMenu type="sale" id={order.id} />
                          {order.items.length > 0 && (
                            <button onClick={() => setExpandedId(expandedId === order.id ? null : order.id)} className="text-blue-600 hover:underline text-xs">
                              {expandedId === order.id ? t("sales.hide") : `${order.items.length} ${t("sales.items")}`}
                            </button>
                          )}
                          <button onClick={() => handleDelete(order.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100" title={t("common.delete")}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === order.id && (
                      <tr key={`${order.id}-items`}>
                        <td colSpan={11} className="px-4 py-3 bg-gray-50">
                          <div className="overflow-x-auto">
                          <table className="w-full min-w-[560px]">
                            <thead>
                              <tr>
                                <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("sales.product")}</th>
                                <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("sales.qty")}</th>
                                <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("sales.unitPrice")}</th>
                                <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("sales.discount")}</th>
                                <th className="px-3 py-2 text-start text-xs font-medium text-gray-500">{t("sales.subtotal")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {order.items.map((item) => (
                                <tr key={item.id}>
                                  <td className="px-3 py-2 text-sm">
                                    {item.product.name}
                                    {(item as any).tradeInProduct && (
                                      <div className="mt-1 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-1.5">
                                        <div className="flex items-center gap-1 text-[11px] text-amber-700">
                                          <span>🔄 استبدال:</span>
                                          <span className="font-medium">{(item as any).tradeInProduct.name}</span>
                                          {(item as any).tradeInProduct.brand && <span>({(item as any).tradeInProduct.brand})</span>}
                                          {(item as any).tradeInValue > 0 && <span className="font-bold">- {(item as any).tradeInValue.toLocaleString()}</span>}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-sm">{item.quantity}</td>
                                  <td className="px-3 py-2 text-sm">{item.unitPrice.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-sm">{item.discount > 0 ? item.discount.toLocaleString() : "-"}</td>
                                  <td className="px-3 py-2 text-sm">{(item.quantity * item.unitPrice - item.discount).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
          </>
        )}
      </div>
    </div>
  );
}
