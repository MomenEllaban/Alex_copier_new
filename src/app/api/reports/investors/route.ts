import { withApiErrors } from "@/lib/api-errors";
import { loadInvestorDistribution, reportResponse } from "@/lib/reports";

async function GET__raw() {
  return reportResponse(loadInvestorDistribution);
}

export const GET = withApiErrors(GET__raw);
