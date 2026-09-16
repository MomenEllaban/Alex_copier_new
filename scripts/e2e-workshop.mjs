// Live E2E for workshop-daily flow. Dev server must be up:
//   $env:E2E_BASE="http://localhost:3101"; node scripts/e2e-workshop.mjs
const BASE = process.env.E2E_BASE || "http://localhost:3000";
const jar = {};
function storeCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
}
const cookies = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
async function req(method, path, body) {
  const headers = { cookie: cookies() };
  let payload;
  if (body !== undefined) { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
  const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
  storeCookies(res);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}
let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`PASS ${name}`);
  else { failures++; console.log(`FAIL ${name} ${extra}`); }
};
async function login(email, password) {
  for (const k of Object.keys(jar)) delete jar[k];
  const csrf = await req("GET", "/api/auth/csrf");
  const body = new URLSearchParams({ csrfToken: csrf.json.csrfToken, email, password, callbackUrl: "/", json: "true" });
  const res = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookies() }, body, redirect: "manual",
  });
  storeCookies(res);
  return res.status === 200 || res.status === 302;
}
async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + "/api/auth/csrf");
      if (res.ok) return true;
    } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}
async function main() {
  check("server up", await waitForServer());
  check("workshop login", await login("ali@alex-copier.com", "password123"));
  // add OUT 200 supplies
  const add = await req("POST", "/api/workshop-daily", { direction: "OUT", amount: 200, reason: "E2E supplies" });
  // need a category: fetch book payload for categories
  const g0 = await req("GET", "/api/workshop-daily");
  const cat = g0.json && g0.json.categories && g0.json.categories[0];
  check("categories available", !!cat, JSON.stringify((g0.json && g0.json.categories || []).length));
  const add2 = await req("POST", "/api/workshop-daily", { direction: "OUT", amount: 200, categoryId: cat.id, reason: "E2E شراء مستلزمات" });
  check("add OUT pending", add2.status === 201 && add2.json && !add2.json.expenseId, `status=${add2.status}`);
  const txId = add2.json.id;
  // workshop staff cannot confirm
  const selfConfirm = await req("POST", `/api/workshop-daily/${txId}/confirm`);
  check("staff confirm blocked", selfConfirm.status === 403, `status=${selfConfirm.status}`);
  // expense must NOT exist yet
  const exp0 = await req("GET", "/api/expenses");
  const before = Array.isArray(exp0.json) ? exp0.json.filter((e) => e.description && e.description.includes("E2E")) : [];
  check("no expense before confirm", before.length === 0, `found=${before.length}`);
  // accountant confirms
  check("accountant login", await login("amr.accountant@alex-copier.com", "password123"));
  const conf = await req("POST", `/api/workshop-daily/${txId}/confirm`);
  check("confirmed+posted", conf.status === 200 && conf.json.postedToBooks === true, `status=${conf.status}`);
  const exp1 = await req("GET", "/api/expenses");
  const after = Array.isArray(exp1.json) ? exp1.json.filter((e) => e.description && e.description.includes("E2E")) : [];
  check("expense posted to Sectory", after.length === 1 && after[0].companyId === "company3", JSON.stringify(after.map((e) => e.companyId)));
  // add IN 1000 funding, confirm it (no expense)
  const inTx = await req("POST", "/api/workshop-daily", { direction: "IN", amount: 1000, reason: "E2E تمويل" });
  check("add IN", inTx.status === 201, `status=${inTx.status}`);
  const confIn = await req("POST", `/api/workshop-daily/${inTx.json.id}/confirm`);
  check("IN confirmed w/o expense", confIn.status === 200 && confIn.json.postedToBooks === false, `status=${confIn.status}`);
  // balance check
  const g1 = await req("GET", "/api/workshop-daily");
  check("remaining reflects entries", g1.json.book.totals.inTotal >= 1000 && g1.json.book.totals.outTotal >= 200, JSON.stringify(g1.json.book.totals));
  // close blocked? no pending now -> should succeed
  const close = await req("POST", "/api/workshop-daily/close", { handoverTo: "E2E treasury" });
  check("day closed", close.status === 200 && close.json.status === "CLOSED", `status=${close.status}`);
  const g2 = await req("GET", "/api/workshop-daily");
  check("no open day after close", g2.json.book === null && g2.json.closedBooks.length >= 1, JSON.stringify(g2.json.closedBooks.length));
  console.log(failures === 0 ? "E2E ALL PASS" : `E2E ${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
