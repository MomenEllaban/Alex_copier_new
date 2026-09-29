import { loadMachinesNeedingInspection, reportResponse } from "@/lib/reports";

export async function GET() {
  return reportResponse(loadMachinesNeedingInspection);
}
