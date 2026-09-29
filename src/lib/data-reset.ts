/**
 * Whether the "zero a company's / the whole database's" reset endpoints are
 * allowed to run.
 *
 * In production they stay dark unless the deployment explicitly opts in with
 * ENABLE_DATA_RESET=1, so a stray click can never wipe live ledgers. In
 * development and test they are always allowed.
 *
 * The POST routes keep returning 404 while disabled (that is what the tests
 * and the security posture expect); the UI asks the GET handlers instead so it
 * can hide or explain the button rather than showing one that always fails.
 */
export function isDataResetEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ENABLE_DATA_RESET === "1";
}
