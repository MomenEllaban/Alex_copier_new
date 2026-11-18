import { withApiErrors } from "@/lib/api-errors";
import { loadCashPosition, reportResponse } from "@/lib/reports";

async function GET__raw() {
  return reportResponse(loadCashPosition);
}

export const GET = withApiErrors(GET__raw);
