import { describe, expect, it } from "vitest";

import {
  buildSupplierBalances,
  buildSupplierStatement,
  isFinalReturn,
  isPayableOrder,
  type PurchaseOrderLite,
  type PurchaseReturnLite,
} from "@/lib/supplier-statement";

const order = (id: string, supplierId: string, total: number, status = "RECEIVED"): PurchaseOrderLite => ({
  id,
  supplierId,
  status,
  total,
  orderDate: "2026-02-01",
  createdAt: "2026-02-01T10:00:00.000Z",
});

const ret = (
  id: string,
  supplierId: string | null,
  purchaseOrderId: string | null,
  total: number,
  status = "APPROVED",
): PurchaseReturnLite => ({
  id,
  supplierId,
  purchaseOrderId,
  total,
  status,
  createdAt: "2026-03-01T10:00:00.000Z",
});

describe("isPayableOrder", () => {
  it("counts CONFIRMED and RECEIVED as payable", () => {
    expect(isPayableOrder("CONFIRMED")).toBe(true);
    expect(isPayableOrder("RECEIVED")).toBe(true);
  });

  it("excludes DRAFT and CANCELLED orders", () => {
    expect(isPayableOrder("DRAFT")).toBe(false);
    expect(isPayableOrder("CANCELLED")).toBe(false);
  });
});

describe("isFinalReturn", () => {
  it("counts APPROVED and COMPLETED only", () => {
    expect(isFinalReturn("APPROVED")).toBe(true);
    expect(isFinalReturn("COMPLETED")).toBe(true);
    expect(isFinalReturn("PENDING")).toBe(false);
    expect(isFinalReturn("REJECTED")).toBe(false);
  });
});

describe("buildSupplierStatement", () => {
  it("balance equals the sum of payable order totals (returns already netted, never subtracted twice)", () => {
    // The purchase order total is already reduced when a return is approved
    // (returns route: newTotal = total - returnTotal), so the statement must
    // NOT subtract returnsTotal again.
    const orders = [order("po1", "sup1", 8000), order("po2", "sup1", 2000)];
    const returns = [ret("r1", "sup1", "po1", 2000)];
    const st = buildSupplierStatement("sup1", orders, returns);
    expect(st.ordersCount).toBe(2);
    expect(st.totalPurchases).toBe(10000);
    expect(st.returnsTotal).toBe(2000);
    expect(st.balance).toBe(10000);
  });

  it("ignores DRAFT and CANCELLED orders", () => {
    const orders = [
      order("po1", "sup1", 5000, "RECEIVED"),
      order("po2", "sup1", 9999, "DRAFT"),
      order("po3", "sup1", 7777, "CANCELLED"),
    ];
    const st = buildSupplierStatement("sup1", orders, []);
    expect(st.ordersCount).toBe(1);
    expect(st.balance).toBe(5000);
  });

  it("matches returns via the parent order when supplierId is null", () => {
    const orders = [order("po1", "sup1", 5000), order("po9", "sup2", 3000)];
    const returns = [ret("r1", null, "po1", 500)];
    const st = buildSupplierStatement("sup1", orders, returns);
    expect(st.returns).toHaveLength(1);
    expect(st.returnsTotal).toBe(500);
    // The other supplier must not see this return.
    const other = buildSupplierStatement("sup2", orders, returns);
    expect(other.returns).toHaveLength(0);
  });

  it("scopes statements per supplier", () => {
    const orders = [order("po1", "sup1", 4000), order("po2", "sup2", 6000)];
    const a = buildSupplierStatement("sup1", orders, []);
    const b = buildSupplierStatement("sup2", orders, []);
    expect(a.balance).toBe(4000);
    expect(b.balance).toBe(6000);
  });
});

describe("buildSupplierBalances", () => {
  it("aggregates one row per supplier", () => {
    const orders = [order("po1", "sup1", 4000), order("po2", "sup2", 0, "DRAFT")];
    const map = buildSupplierBalances(["sup1", "sup2"], orders, []);
    expect(map.get("sup1")?.balance).toBe(4000);
    expect(map.get("sup2")?.balance).toBe(0);
  });
});
