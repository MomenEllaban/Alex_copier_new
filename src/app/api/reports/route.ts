import { withApiErrors } from "@/lib/api-errors";
import { loadReportsOverview, reportResponse } from "@/lib/reports";

/**
 * Overview counts for the reports landing page.
 *
 * The eight report datasets that used to be returned from this route now have
 * their own endpoints under /api/reports/* so each report page only pays for
 * the data it renders.
 */
async function GET__raw() {
  return reportResponse(loadReportsOverview);
}

export const GET = withApiErrors(GET__raw);
