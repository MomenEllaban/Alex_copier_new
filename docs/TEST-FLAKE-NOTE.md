# Pre-existing test flake: `reports > 401s an anonymous caller`

**Status:** present before the RBAC work; unrelated to it. Verified by stashing all
RBAC changes and running the suite on the untouched tree — the same case fails there.

**Where:** `tests/api/get-page-guards.test.ts`, case "401s an anonymous caller"
for the `/api/reports` route. It fails intermittently (1–3 of 100 cases per run,
and the affected route varies between runs: reports, settlements, machines,
investors, dashboard…).

**Cause.** Every case in that file shares one set of module-level guard stubs
(`mocks.requirePageAccess`, `mocks.requireAuth`, `mocks.requireAnyPage`), and
each route is pulled in with a lazy `await import(...)` inside the test body.
Vitest runs the cases concurrently, so:

1. test A calls `wireGuardsFor(null)`
2. test A starts `await import("@/app/api/reports/route")`
3. test B (a different route) calls `wireGuardsFor(GM)`
4. test A's route now reads the stubs and sees the general manager

The guard then lets the anonymous caller through, the route reaches Prisma, and
`mocks.db` has no `report` model, so the handler throws and returns 500. The
assertion `[401, 404]` fails. This is why the failing route is different on each
run — it is whichever import lost the race.

**Why it is not a real security finding.** The race lives entirely in the test
harness. In the running app the guards read a real session and a cached
permission set, so an anonymous caller is refused with 401. The RBAC suites added
with this work (`tests/api/rbac-action-guards.test.ts`,
`tests/lib/auth-helpers-any-page.test.ts`) do not share stubs across concurrent
cases and are stable.

**Fix options, in the order I would pick them.**

1. Give each case its own stubs instead of sharing the module-level object — the
   real fix, but it means reworking the file's `wireGuardsFor` contract.
2. `describe.sequential` on that block. Tried; it silences the symptom in
   isolation but the file still fails under a full parallel run, so it is not a
   sufficient fix on its own.
3. Move the route imports out of the test bodies into a single pre-`beforeEach`
   pass, so no import happens while another test is mid-flight.

I left the file working as-is rather than half-apply one of these, because it is
outside the scope of the permissions work and any of them changes assertions
that predate it. Worth a dedicated pass.

**How to run without the noise:** `npx vitest run --no-file-parallelism` passes
692/692.
