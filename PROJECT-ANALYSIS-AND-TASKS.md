# Alex Copier ERP — تحليل المشروع وخريطة التحسينات
# Alex Copier ERP — Project Analysis & Improvement Backlog

> تاريخ التحليل / Analysis date: 2026-11-18
> النسخة / Snapshot: `4e55b53` (بعد تاسك 1 وتاسك 2 / after Task 1 & Task 2)
> المسار / Workspace: `E:\alex_new`

---

## 1. كيف تستخدم الملف / How to use this file

كل تحسين مكتوب كـ **تاسك مستقل** باسم `TASK-XX`. تقولي «اعمل التاسك ١٢» وأبدأ فيه فوراً.
Each improvement is an independent **task** named `TASK-XX`. Just say "do task 12" and I'll start it.

كل تاسك فيه: الأولوية، الوضع الحالي، المشكلة، المقترح، الملفات المتأثرة، ومعايير القبول.
Every task has: priority, current state, problem, proposal, affected files, and acceptance criteria.

**الأولويات / Priorities:** `P0` خطر أمني أو يمنع النشر / security or deploy-blocking · `P1` مهم للمال أو Experiments اليومية / important for money or daily operations · `P2` تحسين جودة / quality improvement.

---

## 2. الخلاصة التنفيذية / Executive summary

### عربي
المشروع **مرن فعلاً** ومبني بطريقة صحية: صلاحيات ديناميكية (Table-driven RBAC) مش مكتوبة بالكود، أدوات مساعدة جاهزة (`company-scope`, `stock-movement-helper`, `customer-credit`, `payment-status`, `statement-token`)، استبدال متعدد الأصناف، تابات شركات في ١٤ صفحة، ٦٨ ملف اختبار، و٤٥٠+ نقطة نهاية محمية. المشكلة مش في التعقيد — المشكلة إن **بعض اللوجيك القوي مش مت использован** في كل المسارات، وإن فيه **روابط مباشرة للداتابيز** بدل ما تمر على helper واحد.

أكبر ٥ مخاطر حالياً:
1. مفاتيح إنتاج حقيقية في `.env` + أزرار دخول تجريبية بصلاحيات كاملة مفعّلة في الإنتاج.
2. تعديل صلاحيات المستخدمين عبر الواجهة ما بيكتبش `roleId` → الماتريكس مش بيطبّق عليهم.
3. التقارير وبعض الـ APIs مش معزولة بالشركة → مستخدم شركة يقدر يشوف داتا شركات تانية.
4. الربح (P&L) بيحسب التحصيلات (settlements) كإيراد → مضاعفة الربح.
5. النشر على Vercel موقوف: `Account is blocked` (مشكلة حساب مش كود).

### English
The project is **genuinely flexible** and well-structured: table-driven RBAC (not hard-coded permissions), ready-made helpers (`company-scope`, `stock-movement-helper`, `customer-credit`, `payment-status`, `statement-token`), multi-item trade-ins, company tabs on 14 pages, 68 test files, and guarded endpoints. The problem is not complexity — it is that **some strong helpers are not called from every flow**, and money is often written **directly to Float fields** instead of through one posting helper.

Top 5 risks right now:
1. Live production credentials in `.env` + full-privilege demo accounts enabled in production.
2. User create/update via UI never sets `roleId`, so the permissions matrix does not apply to those users.
3. Reports and several list APIs are not company-isolated → a company user can read other companies' data.
4. P&L counts settlements as revenue → profit is double-counted.
5. Vercel deploy is blocked: `Account is blocked` (account issue, not code).

---

## 3. خريطة الصفحات والداتا / Page & data map

### 3.1 الصفحات / Pages

| المجموعة / Group | الصفحات / Pages | ملاحظات / Notes |
|---|---|---|
| مبيعات / Sales | `/sales`, `/sales/categories` | 3 أنواع فاتورة (عادي/استبدال/داخلي)، استبدال متعدد الأصناف، تابات شركات |
| مشتريات / Purchases | `/purchases` | تبويب خارجي/بين الشركات، فلترين شركات مستقلين |
| عملاء وموردون / Customers & suppliers | `/customers`, `/customers/balances`, `/customers/[id]/tests`, `/suppliers`, `/suppliers/balances` | كشف حساب برابط مشاركة، تحصيلات، استيراد |
| مخزون / Stock | `/inventory`, `/inventory/settings`, `/warehouses`, `/products`, `/trade-ins` | حركات مخزون، سياسة سالب، مستودعات، أصناف مستبدلة |
| خدمة وورشة / Service & workshop | `/machines`, `/contracts`, `/service-requests`, `/tests`, `/workshop`, `/workshop-daily` | استبدال ماكينات، عقود، زيارات، يومية خزنة |
| مالي / Finance | `/expenses`, `/expenses/categories`, `/settlements`, `/investors`, `/reports` (+9 تقارير) | مصروفات، تسويات، توزيعات، ٩ تقارير عبر `ReportView` |
| موارد بشرية / HR | `/hr`, `/hr/employees`, `/hr/attendance`, `/hr/leaves`, `/hr/payroll`, `/hr/departments` | حضور، إجازات، رواتب، سلف وقروض |
| إعدادات / Admin | `/settings`, `/settings/roles`, `/users`, `/notifications`, `/companies`, `/companies/[id]/report` | مستخدمون، ماتريكس صلاحيات، إشعارات، تقرير شركة |

### 3.2 الداتا / Data (~93 model)

| النطاق / Domain | أهم الجداول / Key models |
|---|---|
| هوية وصلاحيات / Identity & RBAC | `User`, `Role`, `Page`, `Action`, `RolePage`, `RoleActionPermission`, `UserCompanyAccess`, `Session`, `ApprovalLog` |
| شركات وعملاء / Companies & customers | `Company`, `Customer`, `CustomerLedger`, `CustomerPayment`, `Supplier`, `SupplierPayment`, `Engineer`, `Investor` |
| مبيعات / Sales | `SalesOrder`, `SalesOrderItem`, `TradeInItem`, `Installment`, `Contract`, `ContractMachine`, `SalesCategory` |
| مشتريات ومخزون / Purchases & stock | `PurchaseOrder`, `PurchaseInvoice`, `InterCompanyInvoice`, `Product`, `Warehouse`, `WarehouseInventory`, `StockMovement`, `ReturnTransaction`, `MachineReplacement` |
| مالي / Finance | `Account`, `JournalEntry`, `JournalEntryItem`, `Settlement`, `Expense`, `ExpenseCategory`, `BankReconciliation` |
| موارد بشرية / HR | `Employee`, `Department`, `JobTitle`, `Shift`, `DailyAttendanceRecord`, `LeaveRequest`, `PayrollPeriod`, `PayrollRun`, `PayrollItem`, `EmployeeLoan`, `EmployeeAdvance`, `HrSetting` |
| خدمة / Service | `ServiceRequest`, `Visit`, `CopierTest`, `Warranty`, `WorkshopDailyBook`, `WorkshopTransaction`, `WorkshopPartMovement` |

> ملاحظة: `PurchaseInvoice` و`BankReconciliation` موجودان في الـ schema لكن **لا يكتبهما أي كود** — جداول «شكلية».
> Note: `PurchaseInvoice` and `BankReconciliation` exist in the schema but **no code writes them** — placeholder tables.

---

## 4. كتالوج التاسكات / Task catalogue

### GROUP A — الأمن والصلاحيات / Security & access (ابدأ هنا / start here)

---

#### `TASK-01` — تدوير المفاتيح وإخفاء حسابات الاختبار في الإنتاج
**Rotate secrets & disable demo accounts in production** · `P0` · الأمان / Security

- **الحالي / Current:** `.env` contains live Neon DB URL, Cloudinary key/secret, `AUTH_SECRET`, and `NEXT_PUBLIC_SHOW_TEST_ACCOUNTS=true`; `/login` then shows 8 privileged accounts with shared password `password123`.
- **المشكلة / Problem:** أي شخص عنده الملف أو النسخة المترجمة يقدر يدخل قاعدة البيانات ويدخل كمدير عام فوراً. / Anyone with the file or built JS gets DB access and instant admin login.
- **المقترح / Proposal:** rotate every credential; verify git history has no `.env`; add `.env.example` (sanitized); force the flag off/unset in prod; make `verify:prod` fail the build when it is `true` in a production env.
- **الملفات / Files:** `.env`, `.env.example` (new), `src/app/login/page.tsx`, `scripts/verify-prod.ts`, `README.md`.
- **القبول / Acceptance:** `verify:prod` exits non-zero when the flag is enabled; no real secret in any tracked file.

---

#### `TASK-02` — إصلاح روابط كشف الحساب العامة
**Unblock public statement links** · `P0` · الأمان/وظيفة / Security/Function

- **الحالي / Current:** `middleware.ts` public Paths = `/login`, `/api/auth` only; `/s/[token]` and `/e/[token]` are inside the matcher.
- **المشكلة / Problem:** العميل اللي عنده رابط كشف حساب بيتحوّل لصفحة الدخول — الميزة كلها معطلة. / Recipients get redirected to login; the share feature is broken.
- **المقترح / Proposal:** add both prefixes to public paths + a middleware test for anonymous access; keep token expiry/revocation as-is.
- **الملفات / Files:** `src/middleware.ts`, `src/app/s/[token]/page.tsx`, `src/app/e/[token]/page.tsx`, new test.
- **القبول / Acceptance:** anonymous GET `/s/<valid>` returns 200 and renders the statement.

---

#### `TASK-03` — حدّ الدخول وسياسة الباسورد والجلسة
**Rate limiting, password policy & session hardening** · `P0` · الأمان / Security

- **الحالي / Current:** direct bcrypt compare, no throttling/lockout; 6-char minimum; JWT session with no `maxAge`; `trustHost: true`.
- **المقترح / Proposal:** per-IP + per-email throttle at NextAuth `authorize`, lock after N failures with cooldown; 12+ char policy + forced reset for generated accounts; `maxAge` 8h and scoped `trustHost`; distinct login error states (locked vs wrong password).
- **الملفات / Files:** `src/auth.ts`, `src/auth.config.ts`, `src/app/login/page.tsx`, `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`.
- **القبول / Acceptance:** automated test shows 429/lock after repeated failures; short password rejected.

---

#### `TASK-04` — سد ثغرات الصلاحيات (roleId + تصعيد)
**Close RBAC holes: persist roleId & prevent escalation** · `P0` · الصلاحيات / RBAC

- **الحالي / Current:** `/api/users` POST/PUT never writes `roleId`; `resolvePermissions()` falls back to a hard-coded table. `requireSuperAdmin()` covers 6 roles, and any of them can create a new `GENERAL_MANAGER`.
- **المشكلة / Problem:** الماتريكس مش بيطبّق على مستخدمين جدد؛ أي مدير يقدر يعمل أدمن جديد. / Matrix edits don't apply to new users; any manager can mint a root admin.
- **المقترح / Proposal:** resolve+persist `roleId` from `role` on create/update (400 on unknown); restrict user/role admin to `GENERAL_MANAGER`; forbid non-GM from assigning GM; fail closed (empty permissions) when `roleId` is invalid; unify `role` vs `roleId` into one source of truth gradually.
- **الملفات / Files:** `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`, `src/lib/auth-helpers.ts`, `src/lib/permissions-server.ts`, `src/lib/permissions.ts`, `prisma/seed-rbac.ts`.
- **القبول / Acceptance:** tests for all 6 non-GM roles trying to create a GM; matrix change reflected for a user created through the UI.

---

#### `TASK-05` — عزل الشركات فعلياً في الـ APIs والتقارير
**Server-side company isolation for APIs, reports & dashboard** · `P0/P1` · الأمان/مال / Security/Finance

- **الحالي / Current:** list APIs return all companies and the UI filters client-side; `reports.ts` loaders have no `companyId`; `dashboard` returns group finance to every role; by-id routes have no company assertion (IDOR).
- **المشكلة / Problem:** مستخدم شركة يقدر يقرأ داتا مالية لشركات تانية عبر Postman. / A company-bound user can read other companies' money via direct API calls.
- **المقترح / Proposal:** apply existing `companyScopeFilter` / `reportCompanyIds` in `/api/sales`, `/api/customers`, `/api/purchases`, `/api/returns`, `/api/products`, `/api/dashboard`, and all `/api/reports/*`; add `scopedFindUnique(actor, model, id)` for every `[id]` route; tests per role/company.
- **الملفات / Files:** `src/lib/company-scope.ts`, `src/app/api/{sales,customers,purchases,returns,products,dashboard}/route.ts`, `src/app/api/reports/**`, all `src/app/api/**/[id]/route.ts`.
- **القبول / Acceptance:** one-company grant sees only that company on all 9 reports; cross-company id returns 403.

---

#### `TASK-06` — تحميل آمن وتحقق موحّد من المدخلات
**Safe uploads & consistent input validation** · `P1` · الأمان / Security

- **الحالي / Current:** `/api/upload` accepts any MIME, no size cap, buffers in memory; only 3 of ~88 routes use zod; some routes spread raw body into Prisma; intercompany `costPrice` is trusted from the client.
- **المقترح / Proposal:** allow-list JPEG/PNG/PDF + 5 MB cap; `parseBody(schema)` helper with zod/strict field picking for all mutating routes; load cost from `Product` not from request; reuse `copier-test-upload.ts`.
- **الملفات / Files:** `src/app/api/upload/route.ts`, `src/lib/copier-test-upload.ts`, `src/app/api/{investors,service-requests,machines,sales/intercompany}/route.ts`, `src/lib/import-schemas.ts`.
- **القبول / Acceptance:** `.exe`/oversized upload rejected; tampered `costPrice` has no effect on journal entries.

---

#### `TASK-07` — توحيد شكل الأخطاء ومنع تسريب الـ stack
**Unified error envelope, no stack traces** · `P1` · الأمان/جودة / Security/Quality

- **الحالي / Current:** sales/intercompany return `detail: error.stack` or raw `message`; mixed `{error}`, `{error,code}`, Arabic text; `traceError()` (returns a status number) is put into a `detail` field in the replace route.
- **المقترح / Proposal:** one `fail(status, code, message, requestId)` helper; log stack server-side only, return correlation id; structured JSON logs with user/request context; fix the `traceError` misuse.
- **الملفات / Files:** `src/lib/prisma-errors.ts`, `src/lib/api-client.ts`, `src/app/api/sales/**`, `src/app/api/machines/[id]/replace/route.ts`.
- **القبول / Acceptance:** no HTTP response contains a filesystem path or stack line.

---

### GROUP B — المال والمخزون والموارد البشرية / Money, stock & HR

---

#### `TASK-08` — بوست محاسبي واحد لكل حركة مالية
**One posting helper for every financial event** · `P0` · مال / Finance

- **الحالي / Current:** sales/settlements/payments/returns update `Customer.totalDebt`, `remainingDebt`, `CustomerLedger.balance`, `Account.balance` directly. `JournalEntry` is used only by payroll and intercompany.
- **المشكلة / Problem:** دفترين متوازيين مش متطابقين؛ تقرير الأرباح مش قابل للمراجعة. / Two parallel ledgers disagree; no auditable trail.
- **المقترح / Proposal:** `postFinancialEvent(tx, {type, amount, companyId, accountCodes, party})` writes balanced `JournalEntry` + items; derive `Account.balance` from entries (or drop the stored field); call from sale, purchase receipt, settlement, payment, return, expense, trade-in.
- **الملفات / Files:** `src/lib/` (new `financial-posting.ts`), `src/app/api/sales/**`, `src/app/api/settlements/**`, `src/lib/returns-simple.ts`, `src/lib/trade-in-items.ts`, `src/lib/services/hr/payroll-service.ts`.
- **القبول / Acceptance:** for every money event, debit = credit and `Account.balance` equals the sum of its journal items.

---

#### `TASK-09` — تصحيح حساب الربح والضريبة
**Fix P&L: settlements are not revenue** · `P0` · مال / Finance

- **الحالي / Current:** `netProfit` adds `totalSettlementsForProfit`; VAT is embedded in `SalesOrder.total` and counted as revenue; purchase returns are excluded by `reason.includes("مرتجع مشتريات")`.
- **المشكلة / Problem:** تحصيل فاتورة مسدودة بيضرب الربح مرتين؛ ضريبة القيمة المضافة بتظهر كإيراد. / A paid invoice inflates profit twice; VAT counted as sales.
- **المقترح / Proposal:** remove settlements from profit; add explicit `eventType` instead of string matching; store `taxAmount`/`taxableAmount` on sales and exclude VAT from revenue.
- **الملفات / Files:** `src/app/api/companies/[id]/report/route.ts`, `src/app/api/sales/route.ts`, `prisma/schema.prisma`, migration.
- **القبول / Acceptance:** a fully paid cash sale changes profit only once; tax invoice report shows VAT separately.

---

#### `TASK-10` — سياسة موحّدة للمرتجعات والاستبدال
**Unified policy for returns & trade-ins** · `P0` · مال/مخزون / Finance/Stock

- **الحالي / Current:** sale return decrements cash account even for credit sales; purchase return creates a `SupplierPayment`; trade-in creates a Product + `PURCHASE_IN` at a user-entered value with no counterpart entry.
- **المقترح / Proposal:** define per event type (CASH vs CREDIT vs NON_CASH_ASSET); post via `TASK-08`; for trade-ins, record asset-in at a documented valuation rule and the corresponding credit/customer equity entry; never key behaviour off `reason` strings.
- **الملفات / Files:** `src/lib/returns-simple.ts`, `src/lib/trade-in-items.ts`, `src/app/api/returns/**`, `src/app/api/sales/**`.
- **القبول / Acceptance:** credit-sale return does not move cash; every trade-in has a balanced journal entry.

---

#### `TASK-11` — مصدر واحد لمديونية العميل وتخصيص الدفعات
**Single source of customer debt + explicit payment allocation** · `P1` · مال / Finance

- **الحالي / Current:** global `Customer.totalDebt/remainingDebt` vs per-company `CustomerLedger.balance`; payment→invoice matching is re-derived from note strings; statement fakes an opening balance to hide drift; `creditLimit` stored but never enforced.
- **المقترح / Proposal:** make `CustomerLedger` authoritative; keep Customer fields as cached sums updated by one function; add `CustomerPaymentAllocation {paymentId, orderId, amount}`; enforce credit limit at sale; document the negative-balance sign convention (رصيد تحت الحساب).
- **الملفات / Files:** `prisma/schema.prisma` + migration, `src/lib/customer-credit.ts`, `src/lib/customer-payment-sync.ts`, `src/lib/customer-statement.ts`, `src/app/api/sales/route.ts`.
- **القبول / Acceptance:** per-company ledger equals the sum of that company's documents; no reconciliation depends on note text.

---

#### `TASK-12` — إزالة الدفتر الثابت للموردين من الكود
**Remove hard-coded supplier ledger from source** · `P0` · مال / Finance

- **الحالي / Current:** `src/lib/jumla-suppliers-ledger.ts` hard-codes customer/supplier ledger rows and matches them by **name substring** (`getJumlaSupplierLedger`), overriding DB data.
- **المشكلة / Problem:** أي مورد اسمه مشابه ياخد رصيد حد تاني؛ مصدر الحقيقة في ملف TS مش الداتابيز. / A similarly named supplier inherits someone else's balance.
- **المقترح / Proposal:** migrate those rows into `PurchaseInvoice`/`JournalEntry` seed data keyed by ID; delete the fallback; derive supplier balance from `Σ invoices − payments`.
- **الملفات / Files:** `src/lib/jumla-suppliers-ledger.ts`, `src/lib/supplier-statement.ts`, `prisma/`.
- **القبول / Acceptance:** no supplier balance depends on string name matching.

---

#### `TASK-13` — اكتمال محرك الرواتب والإجازات والحضور
**Complete payroll, leave & attendance mechanics** · `P0/P1` · موارد بشرية / HR

- **الحالي / Current:** social insurance forced to 0 although `HrSetting` has rates/min/max; attendance derived minutes stay 0 (late/overtime always 0); leave days = calendar days with no balance check; bonus/penalty `%` ignored; `src/lib/hr/{payroll,leave,attendance}-engine.ts` are dead code; `AdvanceStatus` reused for bonuses/penalties.
- **المقترح / Proposal:** wire the engines into routes; implement insurance with caps and post employer share; compute minutes from punches/shift; use business days + balance validation + CANCEL reversal; honour `calcType`; introduce `BonusStatus`/`PenaltyStatus`; set advance status to `DEDUCTING` on disbursement.
- **الملفات / Files:** `src/lib/hr/*.ts`, `src/lib/services/hr/payroll-service.ts`, `src/app/api/hr/{attendance,leaves,advances,bonuses,penalties}/route.ts`, `prisma/schema.prisma`, tests.
- **القبول / Acceptance:** payroll test with insurance enabled produces non-zero employee+company shares; leave beyond balance is rejected.

---

#### `TASK-14` — تقييم المخزون وحركات غير قابلة للتعديل
**Inventory valuation & immutable stock movements** · `P1` · مخزون / Stock

- **الحالي / Current:** `WarehouseInventory.quantity` only, no value; `Product.purchasePrice` is overwritten on every receipt; movements are deleted on edit/reversal; direction encoded only in `movementType`.
- **المقترح / Proposal:** add `averageCost`/valuation layers (or `StockValuationLayer`); append cost layers instead of overwriting; never delete posted movements — add explicit reversal records with `unitCost`, `balanceAfter`, `referenceType`; add `StockAdjustment` with approval/reason for write-offs.
- **الملفات / Files:** `prisma/schema.prisma` + migration, `src/lib/stock-movement-helper.ts`, `src/app/api/purchases/**`.
- **القبول / Acceptance:** inventory value report equals Σ(layer qty × cost); audit trail keeps original + reversal.

---

#### `TASK-15` — ربط حركات بين الشركات والورشة بالمخزون
**Pair intercompany stock movements & integrate workshop** · `P1` · مخزون / Stock

- **الحالي / Current:** `INTER_COMPANY_IN/OUT` enums exist but the intercompany sale flow posts money only; `WorkshopPartMovement` has free-text `description` and no `productId`/quantity/stock effect.
- **المقترح / Proposal:** post paired OUT/IN movements in one transaction; add `productId`, `quantity`, `stockMovementId` to workshop movements; record returned machine serial in a real `TradeInItem`/`Product` field.
- **الملفات / Files:** `src/app/api/sales/intercompany/route.ts`, `prisma/schema.prisma` + migration, `src/app/api/workshop/**`.
- **القبول / Acceptance:** intercompany invoice always leaves both warehouses with opposite, equal movements.

---

#### `TASK-16` — تقارير معزولة وميزانية حقيقية
**Scoped reports + real statements (balance sheet, aging, valuation)** · `P1` · تقارير / Reports

- **الحالي / Current:** 9 reports via `ReportView`, no company filter (see TASK-05); contract profitability uses hard-coded margin rates; no balance sheet, cash flow, AR aging or inventory valuation; `TASKS.md` already flags these.
- **المقترح / Proposal:** add company scope to every loader; compute margins from real COGS where available else label «تقديري / estimate»; add server-side pagination; build balance sheet from `Account`/`JournalEntry`, AR aging buckets, inventory valuation report.
- **الملفات / Files:** `src/lib/reports.ts`, `src/app/api/reports/**`, `src/app/(dashboard)/reports/**`, `src/components/reports/ReportView.tsx`.
- **القبول / Acceptance:** one-company user sees only their rows; no report shows an unlabelled invented number.

---

#### `TASK-17` — ترقيم المستندات والفاتورة الضريبية وأرشفة الكشوف
**Document numbering, tax compliance & statement snapshots** · `P1` · مال/امتثال / Finance/Compliance

- **الحالي / Current:** printed invoice id is a CUID; tax invoice only sets `taxRate=14` with no tax-number validation or stored tax amount; statements are built live from mutable rows; token expires after 30 days.
- **المقترح / Proposal:** per-company+year sequential `invoiceNumber` with unique constraint; store `taxAmount`/`taxableAmount`; validate company/customer tax numbers; freeze issued invoices (no edit after print); store immutable `CustomerStatementSnapshot` linked to the token.
- **الملفات / Files:** `prisma/schema.prisma` + migration, `src/app/api/sales/route.ts`, `src/app/api/invoices/route.ts`, `src/lib/customer-statement.ts`, `src/lib/statement-token.ts`.
- **القبول / Acceptance:** two invoices in the same company/year never share a number; a shared statement link's content never changes retroactively.

---

#### `TASK-18` — موافقات ومسارات آمنة للتدمير
**Approval workflows & safer destructive endpoints** · `P1` · حوكمة / Governance

- **الحالي / Current:** `SalesOrder.status` has DRAFT but POST always writes CONFIRMED; settlement verification only checks generic action; collector and verifier can be the same person; per-company reset is enabled by default (`ENABLE_COMPANY_RESET !== "0"`).
- **المقترح / Proposal:** explicit status transitions + approve endpoints per module; settlement verifier ≠ collector; require env opt-in for **both** resets in prod with 2-step confirm token + audit entry; use FK references instead of string-based deletes.
- **الملفات / Files:** `src/lib/data-reset.ts`, `src/app/api/companies/[id]/reset-transactions/route.ts`, `src/app/api/settlements/[id]/route.ts`, `src/app/api/sales/route.ts`, `prisma/schema.prisma`.
- **القبول / Acceptance:** no reset endpoint works in prod without explicit env opt-in; verified settlement cannot be re-verified by the collector.

---

### GROUP C — تجربة المستخدم / UI & UX

---

#### `TASK-19` — استكمال الترجمة (عربي/إنجليزي)
**Finish i18n: Arabic & English everywhere** · `P0` · ترجمة / i18n

- **الحالي / Current:** 500+ Arabic literals directly in TSX (`sales/page.tsx`, `hr/payroll/page.tsx`, `companies/[id]/report/page.tsx`, supplier modals, dashboard, most tables). Shared components (`SearchableSelect`, `PrinterLoader`, `SubmitButton`, `ProductFormModal`, `SelectWithAdd`) show Arabic even in EN. Supplier payment methods are stored as Arabic strings. Layout forces `dir="rtl"`, locale is localStorage-only so SSR is always Arabic.
- **المقترح / Proposal:** extraction pass by module (dashboard → sales → payroll → company report → modals); move strings to `ar.json`/`en.json`; convert stored Arabic enum values to stable codes via migration; locale cookie for SSR; locale-aware fonts/date/number formatting.
- **الملفات / Files:** `src/i18n/{ar,en}.json`, `src/components/**`, `src/app/(dashboard)/**`, `src/app/layout.tsx`, migration.
- **القبول / Acceptance:** switch to EN and browse every page — no Arabic text in labels, confirmations, toasts, or printed invoices.

---

#### `TASK-20` — نافذة موحّدة وتأكيدات وتراجع
**Unified modal, confirms & undo** · `P1` · UX

- **الحالي / Current:** 3 modal implementations (`FormModal`, `ProductFormModal`, `SelectWithAdd`) with different Escape/focus/backdrop behaviour; backdrop closes long forms with no dirty guard; no confirm on settlement verify, contract terminate, policy toggle, roles «enable all»; toasts auto-dismiss with no undo.
- **المقترح / Proposal:** one modal primitive with Escape, focus trap, focus restore, body scroll lock, dirty-form guard; confirm (with reason) for all financial/state changes; toast `kind` + `undo` callback; role-based menu/button gating consistent with server.
- **الملفات / Files:** `src/components/FormModal.tsx`, `ProductFormModal.tsx`, `SelectWithAdd.tsx`, `UIProvider.tsx`, `src/components/roles/**`, `src/app/(dashboard)/{settlements,contracts,inventory/settings}/**`.
- **القبول / Acceptance:** keyboard-only flow works in every modal; closing a dirty form asks first; destructive financial actions require confirm.

---

#### `TASK-21` — حماية الصفحات نفسها / إخفاء الأزرار
**Apply page guards & canAct consistently** · `P1` · صلاحيات/UX / RBAC/UX

- **الحالي / Current:** `RequirePermission.tsx` exists but is used **nowhere**; only 6 pages call `canAct()`, so Add/Edit/Delete buttons appear for users who will get 403.
- **المقترح / Proposal:** wrap every dashboard page (or route group) with `RequirePermission`; apply `usePermissions().canAct()` on all action buttons; add a test that every page with a `Page` key uses the guard.
- **الملفات / Files:** `src/components/RequirePermission.tsx`, `src/app/(dashboard)/layout.tsx`, all page files.
- **القبول / Acceptance:** direct URL to a forbidden page redirects to `/unauthorized`; no forbidden action button visible.

---

#### `TASK-22` — تابات الشركات في كل الصفحات وحفظ الاختيار
**Company tabs everywhere + URL persistence** · `P1` · UX

- **الحالي / Current:** `CompanyTabs` on 14 pages; customers, machines, engineers, contracts, service requests, tests, workshop and reports still lack it. Tabs have no counts, no arrow-key navigation, no URL persistence, and overflow with many companies.
- **المقترح / Proposal:** extend `CompanyTabs` to all multi-company lists; horizontally scrollable strip; per-tab counts; roving tabindex; sync selection to `?company=`; shared `companyLabel(company, locale)` helper for consistent naming.
- **الملفات / Files:** `src/components/CompanyTabs.tsx`, `src/lib/`, page files listed above.
- **القبول / Acceptance:** selection survives refresh/share via URL; keyboard arrow keys move between tabs.

---

#### `TASK-23` — فرز، تحديد متعدد، طباعة وتصدير أفضل
**Sorting, bulk actions, print & better export** · `P1` · UX

- **الحالي / Current:** no page has column sorting or row selection; `Pagination` hides on single page and has no page-size; CSV exports only the current client-filtered array with no column choice; no global print stylesheet (`no-print` class is undefined); intercompany tab has no refresh/export.
- **المقترح / Proposal:** reusable `useTable` (sort + selection + page size + URL sync); contextual bulk bar (delete/verify/assign/export selected); global `@media print` rules; export scope chooser (filtered/all), column picker, CSV formula-injection escaping; add refresh/export/print to the intercompany tab.
- **الملفات / Files:** `src/components/Pagination.tsx`, `ExportButton.tsx`, `src/lib/csv.ts`, `src/app/globals.css`, list pages, `src/app/(dashboard)/purchases/page.tsx`.
- **القبول / Acceptance:** user can sort any column, select 50 rows and export/act in one request, and print a clean report without sidebar.

---

#### `TASK-24` — إصلاح زر «إضافة» السريع
**Fix broken quick-add `?add=1` deep links** · `P0` · UX

- **الحالي / Current:** the sidebar quick-add pushes `?add=1` for customers, suppliers, expenses, sales/categories, expenses/categories but those pages never mount both `AddFormBoundary` and `useAutoAddForm`, so nothing opens.
- **المقترح / Proposal:** fix the 5 pages or remove the `canAdd` flag; add a test that every `canAdd` sidebar entry has a working handler; also make dashboard quick-action cards deep-link correctly.
- **الملفات / Files:** `src/components/Sidebar.tsx`, the 5 page files, `src/app/(dashboard)/page.tsx`.
- **القبول / Acceptance:** clicking every sidebar plus icon opens the matching form.

---

#### `TASK-25` — تقارير أوضح وأخطاء حقيقية
**ReportView: real errors, filter labels, consistent KPIs** · `P1` · UX/تقارير

- **الحالي / Current:** fetch failures are rendered as an empty table (indistinguishable from no data); `filter.label` is ignored so several "All" combos appear; server `summary` is not recomputed after client filtering; 7/9 reports lack a date range; raw enum labels shown.
- **المقترح / Proposal:** error + retry state; render filter labels; always recompute summary from visible rows; add `DateRangeFilter` to all reports; reuse i18n status/type dictionaries; key rows by id.
- **الملفات / Files:** `src/components/reports/ReportView.tsx`, `src/app/(dashboard)/reports/**`.
- **القبول / Acceptance:** a forced API error shows a retry button; KPI cards always match the visible table.

---

#### `TASK-26` — لوحة معلومات للإدارة
**Management dashboard with KPIs & drilldown** · `P1` · بيزنس / Business

- **الحالي / Current:** 6 counts, monthly table, workload bars; no period picker, no revenue trend, no receivables aging, no low-stock value, no cash position, no payroll cost; EN users see Arabic dates.
- **المقترح / Proposal:** period selector + KPI cards (sales, collections, overdue, inventory value, payroll cost) sourced from existing APIs; sparklines; click-through drilldown to the relevant list with filters applied; i18n number/date formatting.
- **الملفات / Files:** `src/app/(dashboard)/page.tsx`, `src/lib/dashboard.ts`, `src/app/api/dashboard/route.ts`, `src/app/api/reports/**`.
- **القبول / Acceptance:** changing period updates all KPIs; each KPI links to a filtered list.

---

#### `TASK-27` — سجل التغييرات وتفضيلات الإشعارات
**Audit trail UI & notification preferences** · `P1/P2` · بيزنس / Business

- **الحالي / Current:** `data-events` is same-tab only; no `reports`/`hr*`/`roles` entities; notification bell has no search/grouping/undo; no UI answers «who changed this invoice/permission?».
- **المقترح / Proposal:** emit audit events from mutations into a typed log page (actor, entity, action, diff, export); BroadcastChannel for cross-tab freshness; pause auto-refresh while a modal is open; notification digest + per-type preferences + actionable deep links.
- **الملفات / Files:** `src/lib/data-events.ts`, `src/hooks/useAutoRefresh.ts`, `src/components/Header.tsx`, `src/app/(dashboard)/notifications/page.tsx`, new audit page + model.
- **القبول / Acceptance:** changing a role permission appears in the audit log with actor and before/after.

---

### GROUP D — التشغيل، الاختبارات، التوثيق / Ops, tests & docs

---

#### `TASK-28` — خطة نشر وتشغيل كاملة
**Deploy & operations runbook (incl. blocked Vercel account)** · `P0` · تشغيل / Ops

- **الحالي / Current:** `vercel.json` runs `prisma generate` only (no `migrate deploy`); Vercel status for the last commits is `failure: Account is blocked`; live site returns 402; region `cdg1` vs Neon `us-east-2`; no backup/restore/rollback doc; docs disagree about which GitHub remote deploys.
- **المقترح / Proposal:** `docs/DEPLOY-RUNBOOK.md` with current blocked status, owner, unblock criteria, env var table, migration checklist, verification (`verify:prod`), backup/restore and rollback steps; add `db:backup`, `db:restore`, `db:migrate:status`, `verify:all` scripts; align region; document that pushes go to **both** `mo3id/Alex_copier` (backup) and `MomenEllaban/Alex_copier_new` (deploy).
- **الملفات / Files:** `vercel.json`, `package.json`, `docs/DEPLOY-RUNBOOK.md` (new), `README.md`, `.env.example`.
- **القبول / Acceptance:** a new developer can deploy/rollback from the runbook alone; deploy status is visible and owned.

---

#### `TASK-29` — أساس الـ migration ومزامنة الداتابيز
**Create a baseline migration** · `P0` · داتابيز / Database

- **الحالي / Current:** 15 migrations exist but the ~76 base tables came from `prisma db push`, so a fresh `migrate deploy` on an empty DB fails (`relation "SalesOrder" does not exist` in the shadow DB). We work around it with hand-written migrations + `migrate deploy`.
- **المقترح / Proposal:** generate a baseline from the current schema (`prisma migrate diff --from-empty --to-schema-datamodel`), mark it applied, document the db-push origin; add `migrate status` as a pre-deploy gate.
- **الملفات / Files:** `prisma/migrations/`, `README.md`, `docs/DEPLOY-RUNBOOK.md`.
- **القبول / Acceptance:** a brand-new database can be built with `migrate deploy` alone.

---

#### `TASK-30` — اختبارات أسرع وأشمل وCI
**Faster, broader test suite + CI** · `P1` · اختبارات / Tests

- **الحالي / Current:** 68 files / 1653 tests, ~6 min; known flake in `get-page-guards` from shared module-level stubs (workaround `--no-file-parallelism`); no React component tests (node env only); no CI; docs quote 259/483/692/1270 tests inconsistently; tests excluded from typecheck.
- **المقترح / Proposal:** fix the flake with per-case stubs; add `test:ci` (sequential + coverage), jsdom + Testing Library for shared components, CI workflow (`test:ci`, `lint`, `build`, `verify:rbac`), one generated test count in README; include tests in a `typecheck` script.
- **الملفات / Files:** `vitest.config.ts`, `docs/TEST-FLAKE-NOTE.md`, `tests/api/get-page-guards.test.ts`, `package.json`, `.github/workflows/ci.yml` (new), `tsconfig.json`.
- **القبول / Acceptance:** CI green on every push; no documented workaround needed for flake.

---

#### `TASK-31` — تنظيف التوثيق والمستودع والإعدادات
**Docs, repo hygiene & config cleanup** · `P1/P2` · جودة / Quality

- **الحالي / Current:** `README.md` references a missing `.env.example` and `.opencode/skills`; `PROGRESS.md` frozen at P0; `HR_TASKS.md` says all done while other docs say pending; `NEEDS_DECISION.md` has 13 empty answers; `CODE-AUDIT.md` numbers stale; `.gitignore` ignores all `*.md` so 3 docs are invisible to clones; double-encoded Arabic comments in `schema.prisma`; 3 duplicate skill trees; `middleware.ts` deprecated on Next 16; `vitest.config.ts` uses `__dirname` in ESM; `@prisma/pg-worker` is v6 while Prisma is v7; no security headers in `next.config.ts`.
- **المقترح / Proposal:** reconcile docs with a status/date header, add architecture diagram + data dictionary + development guide, allowlist important `.md`, fix encoding, keep one skill tree, rename `middleware.ts`→`proxy.ts`, switch to `import.meta.url`, align Prisma versions, add CSP/nosniff headers.
- **الملفات / Files:** `README.md`, `TASKS.md`, `PROGRESS.md`, `CODE-AUDIT.md`, `NEEDS_DECISION.md`, `.gitignore`, `.gitattributes`, `prisma/schema.prisma`, `vitest.config.ts`, `src/middleware.ts`, `next.config.ts`, `package.json`.
- **القبول / Acceptance:** no doc contradicts another; fresh clone contains all important docs; build has no deprecation warnings.

---

## 5. ترتيب التنفيذ المقترح / Suggested execution order

1. **الخطر الفوري / Immediate:** TASK-01 → 02 → 03 → 04 → 24 → 07 → 06
2. **سلامة المال والداتا / Money & data integrity:** TASK-05 → 08 → 09 → 10 → 11 → 12 → 13 → 28 → 29
3. **البيزنس والتقارير / Business & reporting:** TASK-14 → 15 → 16 → 17 → 18 → 26 → 27
4. **تجربة المستخدم / UX:** TASK-19 → 20 → 21 → 22 → 23 → 25
5. **الجودة والتشغيل / Quality & ops:** TASK-28 → 29 → 30 → 31

> ملاحظة: التاسكات مرتبة بالأولوية مش بالاعتمادية فقط — ممكن نبدأ أي تاسك لوحده لما تقولي.
> Note: ordered by priority, not only by dependency — any task can be started on its own when you ask.

---

## 6. نقاط قوة ما تلمسش / Strengths to preserve

- صلاحيات مش مكتوبة بالكود:صفحات وإجراءات بتتسجل تلقائياً (`rbac:scan`) — مرنة جداً.
- Table-driven RBAC with auto-scan — very flexible.
- `company-scope.ts`, `stock-movement-helper.ts`, `customer-credit.ts`, `payment-status.ts`, `statement-token.ts` — helpers جاهزة، المطلوب بس استخدامها في كل المسارات.
- سياسة المخزون السالب قابلة للإعداد لكل شركة (`InventorySetting`) بدل قاعدة ثابتة.
- استبدال متعدد الأصناف + تابات شركات + ١٦٥٣ اختبار — أساس قوي للبناء عليه.
- كل الـ APIs محمية بـ guards، وفي اختبار يقرأ كل المسارات ويتأكد إنها محمية.
