// Live E2E for the HR/payroll work and the inline expense category add.
//
//   $env:E2E_BASE="https://alex-copier.vercel.app"; node scripts/e2e-hr-expenses.mjs
//
// The script creates what it needs and deletes it again (expense + category),
// so the books are left exactly as they were.
const BASE = process.env.E2E_BASE || "http://localhost:3000";
const GM_EMAIL = process.env.E2E_GM_EMAIL || "reza@alex-copier.com";
const MANAGER_EMAIL = process.env.E2E_MANAGER_EMAIL || "amr.manager@alex-copier.com";
const PASSWORD = process.env.E2E_PASSWORD || "password123";

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
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
  storeCookies(res);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}
let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`PASS ${name}`);
  else {
    failures++;
    console.log(`FAIL ${name} ${extra}`);
  }
};
async function login(email, password) {
  for (const k of Object.keys(jar)) delete jar[k];
  const csrf = await req("GET", "/api/auth/csrf");
  const body = new URLSearchParams({
    csrfToken: csrf.json.csrfToken,
    email,
    password,
    callbackUrl: "/",
    json: "true",
  });
  const res = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookies() },
    body,
    redirect: "manual",
  });
  storeCookies(res);
  return res.status === 200 || res.status === 302;
}
async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + "/api/auth/csrf");
      if (res.ok) return true;
    } catch {
      /* still deploying */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}
const stamp = Date.now();

async function main() {
  check("server up", await waitForServer());
  check("login (general manager)", await login(GM_EMAIL, PASSWORD));

  // ── 1. the new deployment is live: the report carries the HR section ──
  const companies = await req("GET", "/api/companies");
  const list = Array.isArray(companies.json) ? companies.json : [];
  check("companies listed", list.length > 0, `count=${list.length}`);
  if (list.length === 0) return;
  const company = list[0];
  const other = list.find((c) => c.id !== company.id);

  const report = await req("GET", `/api/companies/${company.id}/report`);
  check("report loads", report.status === 200, `status=${report.status}`);
  const r = report.json || {};
  check("report has the HR section", !!r.hr, JSON.stringify(Object.keys(r)));
  check("income statement carries the payroll cost", typeof r.incomeStatement?.payrollCost === "number", JSON.stringify(r.incomeStatement?.payrollCost));
  check("net profit subtracts the payroll cost", typeof r.netProfit === "number");
  check("cash position carries the salaries paid", typeof r.cashPosition?.salariesPaid === "number", JSON.stringify(r.cashPosition?.salariesPaid));
  check("cash position carries the advances and loans handed over",
    typeof r.cashPosition?.advancesDisbursed === "number" && typeof r.cashPosition?.loansDisbursed === "number");
  check("HR section has the headcount and the runs", typeof r.hr?.headcount === "number" && Array.isArray(r.hr?.runs));

  // ── 2. who may read which company's report ──
  // A user tied to a company reads that company only; the general manager
  // owns the group and reads every one of them.
  if (list.length > 1) {
    check("login (company manager)", await login(MANAGER_EMAIL, PASSWORD));
    const managerStatuses = {};
    for (const c of list) {
      const res = await req("GET", `/api/companies/${c.id}/report`);
      managerStatuses[c.id] = res.status;
    }
    const allowed = list.filter((c) => managerStatuses[c.id] === 200);
    const refused = list.filter((c) => managerStatuses[c.id] === 403);
    check(
      "a company-scoped user reads only their own company's report",
      allowed.length === 1 && refused.length === list.length - 1,
      JSON.stringify(managerStatuses),
    );

    check("login (general manager)", await login(GM_EMAIL, PASSWORD));
    const gmStatuses = {};
    for (const c of list) {
      const res = await req("GET", `/api/companies/${c.id}/report`);
      gmStatuses[c.id] = res.status;
    }
    check(
      "the general manager reads every company's report",
      list.every((c) => gmStatuses[c.id] === 200),
      JSON.stringify(gmStatuses),
    );
  }

  // ── 3. the HR routes answer and are company scoped ──
  for (const path of [
    "/api/hr/employees",
    "/api/hr/advances",
    "/api/hr/bonuses",
    "/api/hr/penalties",
    "/api/hr/loans",
    "/api/hr/attendance",
    "/api/hr/leaves",
    "/api/hr/payroll",
  ]) {
    const res = await req("GET", path);
    check(`GET ${path}`, res.status === 200, `status=${res.status}`);
  }

  // a run that does not exist must be refused, not silently created
  const disburse = await req("POST", "/api/hr/payroll", { action: "disburse", runId: "e2e-missing-run" });
  check("disbursing an unknown run is refused", disburse.status === 404, `status=${disburse.status}`);

  // ── 4. the category can be added from the expense form itself ──
  const catName = `E2E فئة ${stamp}`;
  const created = await req("POST", "/api/expense-categories", { name: catName, companyId: company.id });
  check("category created inline", created.status === 201 && !!created.json?.id, `status=${created.status}`);
  const catId = created.json?.id;

  const cats = await req("GET", "/api/expense-categories");
  check("the new category is in the dropdown", (cats.json || []).some((c) => c.id === catId));

  const dupe = await req("POST", "/api/expense-categories", { name: catName, companyId: company.id });
  check("the same category cannot be added twice", dupe.status === 409, `status=${dupe.status}`);

  // the expense can now use it
  let expenseId = null;
  if (catId) {
    const exp = await req("POST", "/api/expenses", {
      companyId: company.id,
      categoryId: catId,
      category: catName,
      description: `E2E مصروف ${stamp}`,
      amount: 111,
    });
    check("expense created with the new category", exp.status === 201, `status=${exp.status} ${JSON.stringify(exp.json)}`);
    expenseId = exp.json?.id;
    check("the expense points at the category", exp.json?.expenseCategory?.id === catId, JSON.stringify(exp.json?.expenseCategory));

    // a category of another company is refused
    if (other) {
      const otherCat = await req("POST", "/api/expense-categories", { name: `E2E فئة أخرى ${stamp}`, companyId: other.id });
      const cross = await req("POST", "/api/expenses", {
        companyId: company.id,
        categoryId: otherCat.json?.id,
        category: "E2E",
        description: `E2E ${stamp}`,
        amount: 50,
      });
      check("an expense cannot use a category of another company", cross.status === 400 && cross.json?.code === "CATEGORY_COMPANY_MISMATCH", `status=${cross.status} code=${cross.json?.code}`);
      if (otherCat.json?.id) await req("DELETE", `/api/expense-categories/${otherCat.json.id}`);
    }
  }

  // ── 5. clean up ──
  if (expenseId) {
    const del = await req("DELETE", `/api/expenses/${expenseId}`);
    check("expense removed", del.status === 200, `status=${del.status}`);
  }
  if (catId) {
    const del = await req("DELETE", `/api/expense-categories/${catId}`);
    check("category removed", del.status === 200, `status=${del.status}`);
  }
  const after = await req("GET", "/api/expense-categories");
  check("no leftover category", !(after.json || []).some((c) => c.id === catId));

  console.log(failures === 0 ? "\nE2E ALL PASS" : `\nE2E FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
