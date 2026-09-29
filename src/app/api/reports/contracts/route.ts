import { loadContractProfitability, reportResponse } from "@/lib/reports";

export async function GET() {
  return reportResponse(loadContractProfitability);
}
