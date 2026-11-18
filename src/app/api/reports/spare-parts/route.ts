import { withApiErrors } from "@/lib/api-errors";
import { loadSparePartMatrix, reportResponse } from "@/lib/reports";

async function GET__raw() {
  return reportResponse(loadSparePartMatrix);
}

export const GET = withApiErrors(GET__raw);
