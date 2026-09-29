import { loadEngineerPerformance, reportResponse } from "@/lib/reports";

export async function GET() {
  return reportResponse(loadEngineerPerformance);
}
