import { loadCashPosition, reportResponse } from "@/lib/reports";

export async function GET() {
  return reportResponse(loadCashPosition);
}
