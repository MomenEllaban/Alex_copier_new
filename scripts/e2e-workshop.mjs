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
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const yesterdayKey = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
};
async function main() {
  check("server up", await waitForServer());
  check("workshop login", await login("ali@alex-copier.com", "password123"));
  const stamp = Date.now();

  // ── categories: the workshop files its outgoing entries under its own list ──
  const catName = `E2E مستلزمات ${stamp}`;
  const created = await req("POST", "/api/workshop-daily/categories", { name: catName });
  check("category created", created.status === 201 && !!created.json.id, `status=${created.status}`);
  const catId = created.json && created.json.id;

  const g0 = await req("GET", "/api/workshop-daily");
  const listed = Array.isArray(g0.json && g0.json.categories) ? g0.json.categories : [];
  check("categories listed for the dropdown", listed.some((c) => c.id === catId), `count=${listed.length}`);

  // ── an outgoing entry under that category stays pending until finance signs it ──
  const add2 = await req("POST", "/api/workshop-daily", { direction: "OUT", amount: 200, categoryId: catId, reason: `E2E شراء مستلزمات ${stamp}` });
  check("add OUT pending", add2.status === 201 && add2.json && !add2.json.expenseId, `status=${add2.status}`);
  const txId = add2.json && add2.json.id;

  // ── an entry without a category stays uncategorised (no placeholder category) ──
  const addNoCat = await req("POST", "/api/workshop-daily", { direction: "OUT", amount: 50, reason: `E2E بدون تصنيف ${stamp}` });
  check("add OUT without category", addNoCat.status === 201 && addNoCat.json.categoryId === null, `status=${addNoCat.status}`);
  const noCatId = addNoCat.json && addNoCat.json.id;

  // workshop staff cannot confirm
  const selfConfirm = await req("POST", `/api/workshop-daily/${txId}/confirm`);
  check("staff confirm blocked", selfConfirm.status === 403, `status=${selfConfirm.status}`);
  // expense must NOT exist yet
  const exp0 = await req("GET", "/api/expenses");
  const before = Array.isArray(exp0.json) ? exp0.json.filter((e) => e.description && e.description.includes(`E2E شراء مستلزمات ${stamp}`)) : [];
  check("no expense before confirm", before.length === 0, `found=${before.length}`);
  // accountant confirms
  check("accountant login", await login("amr.accountant@alex-copier.com", "password123"));
  const conf = await req("POST", `/api/workshop-daily/${txId}/confirm`);
  check("confirmed+posted", conf.status === 200 && conf.json.postedToBooks === true, `status=${conf.status}`);
  const exp1 = await req("GET", "/api/expenses");
  const after = Array.isArray(exp1.json) ? exp1.json.filter((e) => e.description && e.description.includes(`E2E شراء مستلزمات ${stamp}`)) : [];
  check("expense posted to Sectory", after.length === 1 && after[0].companyId === "company3", JSON.stringify(after.map((e) => e.companyId)));
  check("expense keeps the picked category", after.length === 1 && after[0].expenseCategory && after[0].expenseCategory.id === catId, JSON.stringify(after[0] && after[0].expenseCategory));

  // the uncategorised entry posts as "غير مصنف" — a label, not a category row
  const confNoCat = await req("POST", `/api/workshop-daily/${noCatId}/confirm`);
  check("uncategorised entry confirmed", confNoCat.status === 200, `status=${confNoCat.status}`);
  const exp2 = await req("GET", "/api/expenses");
  const uncategorised = Array.isArray(exp2.json) ? exp2.json.filter((e) => e.description && e.description.includes(`E2E بدون تصنيف ${stamp}`)) : [];
  check("uncategorised expense labelled, not filed", uncategorised.length === 1 && uncategorised[0].category === "غير مصنف" && !uncategorised[0].expenseCategory, JSON.stringify(uncategorised.map((e) => [e.category, e.expenseCategory])));

  // a category that is already used cannot be deleted, but it can be renamed
  // (the workshop manager owns the workshop pages; the accountant never deletes)
  check("workshop login again", await login("ali@alex-copier.com", "password123"));
  const delUsed = await req("DELETE", `/api/workshop-daily/categories/${catId}`);
  check("used category cannot be deleted", delUsed.status === 409, `status=${delUsed.status}`);
  const renamed = await req("PUT", `/api/workshop-daily/categories/${catId}`, { name: `${catName} (معدّل)` });
  check("category renamed", renamed.status === 200 && renamed.json.name.includes("معدّل"), `status=${renamed.status}`);

  // add IN 1000 funding, confirm it (no expense)
  const inTx = await req("POST", "/api/workshop-daily", { direction: "IN", amount: 1000, revenueType: "OTHER_INCOME", reason: "E2E تمويل" });
  check("add IN", inTx.status === 201, `status=${inTx.status}`);
  check("accountant login again", await login("amr.accountant@alex-copier.com", "password123"));
  const confIn = await req("POST", `/api/workshop-daily/${inTx.json.id}/confirm`);
  check("IN confirmed w/o expense", confIn.status === 200 && confIn.json.postedToBooks === false, `status=${confIn.status}`);
  // a future date is refused
  const future = new Date();
  future.setDate(future.getDate() + 5);
  const futureTx = await req("POST", "/api/workshop-daily", { direction: "OUT", amount: 10, reason: "E2E مستقبلي", bookDate: dayKey(future) });
  check("future date refused", futureTx.status === 400 && futureTx.json.code === "FUTURE_DATE_NOT_ALLOWED", `status=${futureTx.status}`);
  // balance check
  const g1 = await req("GET", "/api/workshop-daily");
  check("remaining reflects entries", g1.json.book.totals.inTotal >= 1000 && g1.json.book.totals.outTotal >= 250, JSON.stringify(g1.json.book.totals));
  // nothing may be left pending — the day cannot be closed otherwise
  const pendings = (g1.json.book.transactions || []).filter((t) => t.status === "PENDING");
  for (const p of pendings) {
    const c = await req("POST", `/api/workshop-daily/${p.id}/confirm`);
    check(`pending entry ${p.id} confirmed`, c.status === 200, `status=${c.status}`);
  }
  // the workshop manager closes the day
  check("workshop login for close", await login("ali@alex-copier.com", "password123"));
  const close = await req("POST", "/api/workshop-daily/close", { handoverTo: "E2E treasury" });
  check("day closed", close.status === 200 && close.json.status === "CLOSED", `status=${close.status}`);
  const g2 = await req("GET", "/api/workshop-daily");
  const openBook = g2.json.book;
  const openIsToday = openBook && dayKey(new Date(openBook.bookDate)) === dayKey(new Date());
  check("today is closed", !openIsToday && Array.isArray(g2.json.days) && g2.json.days.length >= 1, JSON.stringify(openBook && openBook.bookDate));

  // the closed day is listed and can be opened to see what was booked on it
  const days = g2.json.days || [];
  const closedDay = days[0];
  const detail = await req("GET", `/api/workshop-daily/books/${closedDay.id}`);
  check("day details readable", detail.status === 200 && detail.json.transactions.length >= 1, `status=${detail.status}`);

  // ── the day log pages by the workshop week (Saturday → Thursday) ─────────
  check("week 1 is the current week", g2.json.weekIndex === 1 && g2.json.weeksTotal >= 1, JSON.stringify({ w: g2.json.weekIndex, t: g2.json.weeksTotal }));
  check("the week carries its own range", typeof g2.json.weekStart === "string" && typeof g2.json.weekEnd === "string", JSON.stringify({ s: g2.json.weekStart, e: g2.json.weekEnd }));
  const week2 = await req("GET", "/api/workshop-daily?weekIndex=2");
  check(
    "the previous week is reachable",
    week2.status === 200 &&
      (g2.json.weeksTotal >= 2
        ? week2.json.weekIndex === 2 && week2.json.weekStart !== g2.json.weekStart
        : week2.json.weekIndex === 1),
    JSON.stringify({ w: week2.json.weekIndex, s: week2.json.weekStart, t: g2.json.weeksTotal }),
  );
  const weekFar = await req("GET", "/api/workshop-daily?weekIndex=99");
  check("a week past the last one is clamped", weekFar.status === 200 && weekFar.json.weekIndex === weekFar.json.weeksTotal, JSON.stringify({ w: weekFar.json.weekIndex, t: weekFar.json.weeksTotal }));
  check("the days left open are listed", Array.isArray(g2.json.openDays), JSON.stringify(g2.json.openDays));

  // a back-dated entry reopens that day
  const back = await req("POST", "/api/workshop-daily", { direction: "OUT", amount: 30, reason: "E2E متأخر", bookDate: yesterdayKey() });
  check("back-dated entry accepted", back.status === 201, `status=${back.status}`);
  const g3 = await req("GET", "/api/workshop-daily");
  check("back-dated day reopened", g3.json.book !== null && g3.json.book.isOldDay === true, JSON.stringify(g3.json.book && g3.json.book.bookDate));

  console.log(failures === 0 ? "E2E ALL PASS" : `E2E ${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
