import { loadInvestorDistribution, reportResponse } from "@/lib/reports";

export async function GET() {
  return reportResponse(loadInvestorDistribution);
}
