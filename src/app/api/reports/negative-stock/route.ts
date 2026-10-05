import { loadNegativeStock, reportResponse } from "@/lib/reports";

export async function GET() {
  return reportResponse(() => loadNegativeStock());
}
