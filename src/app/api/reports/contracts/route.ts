import { withApiErrors } from "@/lib/api-errors";
import { loadContractProfitability, reportResponse } from "@/lib/reports";

async function GET__raw() {
  return reportResponse(loadContractProfitability);
}

export const GET = withApiErrors(GET__raw);
