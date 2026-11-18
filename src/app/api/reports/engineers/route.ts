import { withApiErrors } from "@/lib/api-errors";
import { loadEngineerPerformance, reportResponse } from "@/lib/reports";

async function GET__raw() {
  return reportResponse(loadEngineerPerformance);
}

export const GET = withApiErrors(GET__raw);
