import { prisma } from "@/lib/prisma";

export async function getWorkshopCompany() {
  const company = await prisma.company.findFirst({
    where: { name: { contains: "القطاعي" } },
    select: { id: true, name: true },
  });
  return company;
}

export interface WorkshopTotals {
  inTotal: number;
  outTotal: number;
  remaining: number;
  confirmedIn: number;
  confirmedOut: number;
  pendingCount: number;
  pendingAmount: number;
}

export function calcTotals(
  transactions: Array<{ direction: "IN" | "OUT"; amount: number; status: string }>,
): WorkshopTotals {
  let inTotal = 0;
  let outTotal = 0;
  let confirmedIn = 0;
  let confirmedOut = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  for (const t of transactions) {
    if (t.status === "REJECTED") continue;
    const amount = Number(t.amount) || 0;
    if (t.direction === "IN") inTotal += amount;
    else outTotal += amount;
    if (t.status === "CONFIRMED") {
      if (t.direction === "IN") confirmedIn += amount;
      else confirmedOut += amount;
    } else if (t.status === "PENDING") {
      pendingCount++;
      pendingAmount += amount;
    }
  }
  return { inTotal, outTotal, remaining: inTotal - outTotal, confirmedIn, confirmedOut, pendingCount, pendingAmount };
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
