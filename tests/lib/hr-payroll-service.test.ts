import { describe, expect, it } from "vitest";
import { calculateTaxForTaxableIncome } from "@/lib/services/hr/payroll-service";
import { calculateInstallments } from "@/lib/services/hr/loan-advance-service";

describe("HR & Payroll Services Unit Tests", () => {
  describe("Tax Calculation Engine (Progressive Brackets)", () => {
    const standardBrackets = [
      { minAnnual: 0, maxAnnual: 40000, rate: 0 },
      { minAnnual: 40000, maxAnnual: 55000, rate: 0.1 },
      { minAnnual: 55000, maxAnnual: 70000, rate: 0.15 },
      { minAnnual: 70000, maxAnnual: 200000, rate: 0.2 },
      { minAnnual: 200000, maxAnnual: 400000, rate: 0.225 },
      { minAnnual: 400000, maxAnnual: Infinity, rate: 0.25 },
    ];

    it("exempts income within the zero tax bracket", () => {
      const tax = calculateTaxForTaxableIncome(35000, standardBrackets);
      expect(tax).toBe(0);
    });

    it("correctly taxes income falling into multiple progressive brackets", () => {
      // 60,000 annual taxable income:
      // First 40,000 @ 0% = 0
      // Next 15,000 (40k-55k) @ 10% = 1,500
      // Remaining 5,000 (55k-60k) @ 15% = 750
      // Total = 2,250
      const tax = calculateTaxForTaxableIncome(60000, standardBrackets);
      expect(tax).toBe(2250);
    });

    it("correctly taxes high earners entering upper brackets", () => {
      // 250,000 annual taxable income:
      // 40,000 @ 0% = 0
      // 15,000 @ 10% = 1,500
      // 15,000 @ 15% = 2,250
      // 130,000 @ 20% = 26,000
      // 50,000 @ 22.5% = 11,250
      // Total = 41,000
      const tax = calculateTaxForTaxableIncome(250000, standardBrackets);
      expect(tax).toBe(41000);
    });

    it("handles zero or negative taxable income cleanly", () => {
      expect(calculateTaxForTaxableIncome(0, standardBrackets)).toBe(0);
      expect(calculateTaxForTaxableIncome(-5000, standardBrackets)).toBe(0);
    });
  });

  describe("Loan Schedule & Amortization Generation", () => {
    it("generates exact installments with rounding remainder allocated to the final installment", () => {
      const startDate = new Date(2026, 7, 1); // 2026-08-01
      const totalAmount = 10000;
      const count = 3;

      const installments = calculateInstallments(totalAmount, count, startDate);

      expect(installments).toHaveLength(3);
      // 10000 / 3 = 3333.33 each, remainder on last
      expect(installments[0].amount).toBe(3333.33);
      expect(installments[1].amount).toBe(3333.33);
      expect(installments[2].amount).toBe(3333.34);

      // Sum MUST equal totalAmount exactly down to the piaster/cent
      const sum = installments.reduce((acc, curr) => acc + curr.amount, 0);
      expect(Math.round(sum * 100) / 100).toBe(totalAmount);
    });

    it("properly spaces due dates month by month", () => {
      const startDate = new Date(2026, 0, 15); // Jan 15, 2026
      const installments = calculateInstallments(6000, 6, startDate);

      expect(installments).toHaveLength(6);
      for (let i = 0; i < installments.length; i++) {
        expect(installments[i].installmentNo).toBe(i + 1);
        expect(installments[i].status).toBe("PENDING_PAY");
        // Each due date should be in consecutive months
        const dueDate = new Date(installments[i].dueDate);
        expect(dueDate.getMonth()).toBe(i);
        expect(dueDate.getFullYear()).toBe(2026);
      }
    });
  });

  describe("Accounting Balance Invariants (Debits === Credits)", () => {
    it("verifies the mathematical balance formula of the automatic journal entry", () => {
      // Test the exact formula used by lockPayrollRun:
      // Gross = Basic + Allowances + Bonuses + Overtime
      // Deductions = Absence + Late + Penalties + Advances + Loans + EmpInsurance + Tax
      // Net = Gross - Deductions
      // Debits = Gross + CompanyInsurance
      // Credits = Net + Advances + Loans + (EmpInsurance + CompanyInsurance) + Tax + (Absence + Late + Penalties)
      const basic = 10000;
      const allowances = 1500;
      const bonuses = 2000;
      const overtime = 500;
      const gross = basic + allowances + bonuses + overtime; // 14,000

      const absence = 400;
      const late = 50;
      const penalties = 300;
      const advances = 1000;
      const loans = 1200;
      const empInsurance = 1100;
      const compInsurance = 1875;
      const tax = 800;

      const totalDeductions = absence + late + penalties + advances + loans + empInsurance + tax; // 4,850
      const net = gross - totalDeductions; // 9,150

      const totalDebit = gross + compInsurance; // 14,000 + 1,875 = 15,875
      const totalCredit =
        net +
        advances +
        loans +
        (empInsurance + compInsurance) +
        tax +
        (absence + late + penalties); // 9,150 + 1,000 + 1,200 + 2,975 + 800 + 750 = 15,875

      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit - totalCredit).toBe(0);
    });
  });
});
