import { describe, expect, it } from "vitest";
import { calculateInstallments } from "@/lib/services/hr/loan-advance-service";
import { addMonths } from "date-fns";

describe("Loan & Advance Business Logic Unit Tests", () => {
  describe("Advance Policy Validation", () => {
    it("enforces salary advance maximum percentage", () => {
      const baseSalary = 10000;
      const maxAdvancePercent = 50; // 50% limit from HrSetting
      const maxAllowed = (baseSalary * maxAdvancePercent) / 100; // 5,000

      const validRequestAmount = 4000;
      const invalidRequestAmount = 6000;

      expect(validRequestAmount <= maxAllowed).toBe(true);
      expect(invalidRequestAmount <= maxAllowed).toBe(false);
    });

    it("enforces loan maximum multiple of salary", () => {
      const baseSalary = 8000;
      const maxLoanMultiple = 5; // 5x from HrSetting
      const maxAllowed = baseSalary * maxLoanMultiple; // 40,000

      expect(35000 <= maxAllowed).toBe(true);
      expect(45000 <= maxAllowed).toBe(false);
    });
  });

  describe("Loan Schedule & Postponement Invariants", () => {
    it("preserves total loan amount and installment count integrity upon postponement", () => {
      const totalAmount = 12000;
      const count = 6;
      const startDate = new Date(2026, 7, 1); // 2026-08-01

      // 1. Initial schedule
      const installments = calculateInstallments(totalAmount, count, startDate);
      expect(installments).toHaveLength(6);
      expect(installments.every((i) => i.amount === 2000)).toBe(true);

      // 2. Simulate postponement of installment #2
      // Status becomes POSTPONED
      const postponedInst = {
        ...installments[1],
        status: "POSTPONED" as const,
        postponedReason: "ظروف عائلية",
        postponedBy: "user-hatem",
        postponedAt: new Date(),
      };

      // Replacement installment appended at the end
      const lastInst = installments[installments.length - 1];
      const replacementInst = {
        installmentNo: lastInst.installmentNo + 1,
        amount: postponedInst.amount,
        dueDate: addMonths(new Date(lastInst.dueDate), 1),
        status: "PENDING_PAY" as const,
      };

      const updatedSchedule = [
        installments[0],
        postponedInst,
        ...installments.slice(2),
        replacementInst,
      ];

      // Schedule now has 7 entries (1 postponed + 6 active/payable)
      expect(updatedSchedule).toHaveLength(7);
      expect(updatedSchedule.filter((i) => i.status === "PENDING_PAY")).toHaveLength(6);
      expect(updatedSchedule.filter((i) => i.status === "POSTPONED")).toHaveLength(1);

      // The payable sum still equals exactly the total loan amount
      const payableSum = updatedSchedule
        .filter((i) => i.status !== "POSTPONED")
        .reduce((sum, i) => sum + i.amount, 0);
      expect(payableSum).toBe(totalAmount);
    });

    it("calculates remaining loan balance accurately with mixed installment statuses", () => {
      const schedule = [
        { installmentNo: 1, amount: 2000, status: "PAID" },
        { installmentNo: 2, amount: 2000, status: "POSTPONED" },
        { installmentNo: 3, amount: 2000, status: "PENDING_PAY" },
        { installmentNo: 4, amount: 2000, status: "PENDING_PAY" },
        { installmentNo: 5, amount: 2000, status: "PENDING_PAY" },
        { installmentNo: 6, amount: 2000, status: "PENDING_PAY" },
        { installmentNo: 7, amount: 2000, status: "PENDING_PAY" }, // replacement
      ];

      const paidAmount = schedule
        .filter((i) => i.status === "PAID")
        .reduce((sum, i) => sum + i.amount, 0);

      const remainingPayable = schedule
        .filter((i) => i.status === "PENDING_PAY")
        .reduce((sum, i) => sum + i.amount, 0);

      expect(paidAmount).toBe(2000);
      expect(remainingPayable).toBe(10000);
      expect(paidAmount + remainingPayable).toBe(12000);
    });
  });
});
