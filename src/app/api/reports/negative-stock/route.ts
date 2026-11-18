import { withApiErrors } from "@/lib/api-errors";
import { loadNegativeStock, reportResponse } from "@/lib/reports";

async function GET__raw() {
  return reportResponse(() => loadNegativeStock());
}

export const GET = withApiErrors(GET__raw);
