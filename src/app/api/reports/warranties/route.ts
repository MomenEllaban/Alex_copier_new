import { withApiErrors } from "@/lib/api-errors";
import { loadExpiringWarranties, reportResponse } from "@/lib/reports";

async function GET__raw() {
  return reportResponse(() => loadExpiringWarranties());
}

export const GET = withApiErrors(GET__raw);
