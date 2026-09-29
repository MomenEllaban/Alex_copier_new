import { loadCustomerSatisfaction, reportResponse } from "@/lib/reports";

export async function GET() {
  return reportResponse(loadCustomerSatisfaction);
}
