// E2E verification for the Access migration (run with dev server up):
//   1. node scripts/e2e-access.mjs
// Checks: engineer login, scoped customers, test creation with counters +
// collected cash -> settlement + accountant notification.
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
function cookieHeader() {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}
async function req(method, path, body) {
  const headers = { cookie: cookieHeader() };
  let payload;
  if (body !== undefined) {
    if (body instanceof FormData) payload = body;
    else { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
  }
  const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
  storeCookies(res);
  return res;
}

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`PASS ${name}`);
  else { failures++; console.log(`FAIL ${name} ${extra}`); }
}

async function login(email, password) {
  for (const k of Object.keys(jar)) delete jar[k];
  const csrfRes = await req("GET", "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: "/", json: "true" });
  const res = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
    body,
    redirect: "manual",
  });
  storeCookies(res);
  return res.status === 200 || res.status === 302;
}

async function main() {
  // 1. Engineer login (seeded Access engineer account)
  check("engineer login", await login("eng-shaaban@alex-copier.com", "password123"));
  const meRes = await req("GET", "/api/auth/session");
  const session = await meRes.json().catch(() => ({}));
  check("engineer role", session?.user?.role === "ENGINEER", JSON.stringify(session?.user));

  // 2. Engineer's customers are scoped to his assignments
  const custRes = await req("GET", "/api/customers");
  const customers = await custRes.json();
  check("customers scoped", custRes.status === 200 && Array.isArray(customers) && customers.length > 100, `count=${customers.length}`);
  const engineersRes = await req("GET", "/api/engineers");
  const engineers = await engineersRes.json();
  const shaaban = engineers.find((e) => e.name.includes("شعبان"));
  const allMine = customers.every((c) => c.engineerId === (shaaban && shaaban.id));
  check("all customers assigned to shaaban", allMine);

  // 3. Record a test with counters + collected cash (no image)
  const target = customers.find((c) => (c.machines || []).length > 0) || customers[0];
  const form = new FormData();
  form.append("engineerId", shaaban.id);
  form.append("pageCount", "12345");
  form.append("blackCounter", "12345");
  form.append("colorCounter", "678");
  form.append("repairStatement", "اختبار تحقق E2E");
  form.append("spareParts", "درام");
  form.append("collectedAmount", "250");
  form.append("collectionNote", "زيارة E2E");
  const postRes = await req("POST", `/api/customers/${target.id}/tests`, form);
  const created = await postRes.json().catch(() => ({}));
  check("test created", postRes.status === 201, `status=${postRes.status} ${JSON.stringify(created).slice(0, 200)}`);
  check("settlement linked", !!created.settlementId, JSON.stringify(created).slice(0, 200));

  // 4. Engineer cannot touch unassigned customers
  const gmLogin = await login("reza@alex-copier.com", "password123");
  check("manager login", gmLogin);
  const allRes = await req("GET", "/api/customers");
  const all = await allRes.json();
  const foreign = all.find((c) => c.engineerId !== shaaban.id);
  await login("eng-shaaban@alex-copier.com", "password123");
  if (foreign) {
    const fRes = await req("GET", `/api/customers/${foreign.id}`);
    check("foreign customer blocked", fRes.status === 403, `status=${fRes.status}`);
  } else {
    console.log("SKIP foreign customer blocked (no foreign customer found)");
  }

  // 5. Accountant sees the PAYMENT_PENDING notification + settlement
  await login("accountant@alex-copier.com", "password123");
  const notifRes = await req("GET", "/api/notifications");
  const notifs = await notifRes.json();
  check("accountant notified", Array.isArray(notifs) && notifs.some((n) => n.type === "PAYMENT_PENDING"), `count=${notifs.length}`);

  console.log(failures === 0 ? "E2E ALL PASS" : `E2E ${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
