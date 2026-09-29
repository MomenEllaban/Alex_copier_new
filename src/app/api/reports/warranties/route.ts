import { loadExpiringWarranties, reportResponse } from "@/lib/reports";

export async function GET() {
  return reportResponse(() => loadExpiringWarranties());
}
