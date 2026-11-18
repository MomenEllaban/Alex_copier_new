import { withApiErrors } from "@/lib/api-errors";
import { loadCustomerSatisfaction, reportResponse } from "@/lib/reports";

async function GET__raw() {
  return reportResponse(loadCustomerSatisfaction);
}

export const GET = withApiErrors(GET__raw);
