import { loadSparePartMatrix, reportResponse } from "@/lib/reports";

export async function GET() {
  return reportResponse(loadSparePartMatrix);
}
