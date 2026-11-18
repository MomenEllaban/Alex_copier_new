import { withApiErrors } from "@/lib/api-errors";
import { loadMachinesNeedingInspection, reportResponse } from "@/lib/reports";

async function GET__raw() {
  return reportResponse(loadMachinesNeedingInspection);
}

export const GET = withApiErrors(GET__raw);
