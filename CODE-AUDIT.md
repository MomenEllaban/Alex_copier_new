# مراجعة شاملة للكود والسيستم — Alex Copier ERP

> التاريخ: analysed على آخر كوميت في `Alex_copier_new` (النسخة الحية على https://alex-copier.vercel.app)
> النطاق: **87 مسار API** · **41 صفحة** · **20 كومبوننت مشترك** · **71 موديل Prisma** · **48 enum** · **259 اختبار**
> كل بند مكتوب: **الملف:السطر** — المشكلة — الأثر على البيزنس — الكود بالظبط.

**ترتيب القراءة المقترح:** مشاكل الأمان الحرجة (P0) ← بعدها الفلوس والبيانات (P1) ← الأداء والواجهة (P2) ← التقارير والفيتشر (P3).

---

## 0. ملخص تنفيذي — أهم 10 حاجات

| # | المشكلة | الملف | الأثر |
|---|---|---|---|
| 1 | مسح `/api/returns/<id>` **مفتوح بدون أي تسجيل دخول** | `src/app/api/returns/[id]/route.ts:6-31` | أي حد على الإنترنت يقرأ بيانات عملاء وموردين |
| 2 | **موديول الـ HR كله** (رواتب/موظفين/إجازات) بدون صلاحيات — أي مستخدم يعدّل رواتب | `src/app/api/hr/**` (7 ملفات) | فوضى مالية + مخاطرة على بيانات الموظفين |
| 3 | **XSS مخزّن** في كل فاتورة/سند طباعة (مفيش تهريب HTML) | `src/lib/invoice-template.ts` | اسم منتج واحد ممكن يمسح الدفاتر |
| 4 | **الرواتب بتقع** لو موظف مالوش حضور أو راتب أساسي | `prisma/schema.prisma` (enum `PayrollItemFlag`) + `src/lib/hr/payroll-engine.ts:65-70` | 500 عند حساب كشف الشهر |
| 5 | **تكلفة البيع بين الشركات من عند البائع** (مش من قاعدة البيانات) | `src/app/api/sales/intercompany/route.ts:139-142` | تلاعب في الأرباح |
| 6 | **رقمان مختلفان لصافي الربح** — والتقرير الخاطئ هو اللي بيتوزع على المستثمرين | `src/app/api/companies/[id]/report/route.ts:262-267` vs `src/app/api/companies/route.ts:56` | توزيعات مستثمرين غلط |
| 7 | **تسوية معتمدة ترجع INITIAL** وتتحقق تاني = **الدين بيتنقص مرتين** | `src/app/api/settlements/[id]/route.ts:71` | ضياع فلوس |
| 8 | **دفع الأقساط مرتين من ضغطة مزدوجة** = دين العميل ينقص مرتين | `src/app/api/sales/[id]/installments/route.ts:53-108` | ضياع فلوس |
| 9 | **1,590,342 ج.م تحصيل مالهوش رابط بمصدره** (لا يوجد FK) | `prisma/schema.prisma` (`Settlement`) | مستحيل تتبّع أو تراجعه |
| 10 | **seed.ts بيمسح قاعدة الإنتاج كلها** بدون أي حماية | `prisma/seed.ts:14-58` (45 جملة TRUNCATE) | فقدان بيانات لا يُردّ |

---

## P0 — أمان (لازم يتعمل فورًا)

### 1.1 مسح المرتجعات مفتوح تمامًا
**الملف:** `src/app/api/returns/[id]/route.ts:6-31`
`requirePageAccess` مستورد في السطر 3 لكن **مش مستخدم** في الـ GET — بيرجع `company / customer / supplier / product` لأي حد.

```ts
// قبل: السطر 10-11
try {
  const { id } = await params;
  const ret = await prisma.returnTransaction.findUnique({ where: { id }, include: { ... } });

// بعد:
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const actor = await requirePageAccess("returns");
    if (!actor) return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    const { id } = await params;
    const ret = await prisma.returnTransaction.findUnique({ where: { id }, include: { ... } });
```

### 1.2 موديول HR بدون صلاحيات
**الملفات:** `src/app/api/hr/{payroll,employees,employees/[id],leaves,attendance,departments,job-titles}/route.ts`
كلهم `requireAuth()` بس. `permissions.ts:38-45` بيعرّف `hrPayroll / hrEmployees / hrLeaves / hrAttendance` بس **محدش بيفرضه**.

```ts
// src/app/api/hr/payroll/route.ts:44
const actor = await requirePageAccess("hrPayroll");
if (!actor) {
  const authed = await requireAuth();
  return NextResponse.json(
    { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
    { status: authed ? 403 : 401 },
  );
}
```
نفس التغيير في: `employees:49` → `hrEmployees` · `employees/[id]:43,122` → `hrEmployees` ·
`leaves:45,109` → `hrLeaves` · `attendance:59` → `hrAttendance` · `departments:30` + `job-titles:30` → `hrSettings`.

### 1.3 XSS في الفواتير (خطير جداً)
**الملف:** `src/lib/invoice-template.ts` (247, 257, 328, 333, 360, 404, 457-464, 490) + `src/lib/supplier-statement.ts:178-205`
مفيش دالة تهريب ولا واحدة. كل نص بيتحط في HTML زي ما هو: اسم المنتج (يكتبه موظف المبيعات)، ملاحظات الفاتورة، اسم العميل، السيريال.

```ts
// src/lib/invoice-template.ts — في أول الملف
function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
// السطر 247 →  <td class="item">${esc(it.name)}</td>
// السطر 257 →  <div class="kv"><span>${esc(f.label)}</span><b>${esc(f.value)}</b></div>
// السطر 328 →  <h1>${esc(data.companyName)}</h1>
// السطر 333 →  <p class="name">${esc(data.counterpartyName)}</p>
```
```ts
// src/app/api/invoices/route.ts:279-283
return new NextResponse(html, {
  headers: { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  status: 200,
});
```

### 1.4 الـ seed بيمسح الإنتاج
**الملف:** `prisma/seed.ts:14-58` — فيه **45** جملة `TRUNCATE … CASCADE`، و`.env:1` فيه رابط Neon الإنتاج.

```ts
// prisma/seed.ts:6
const url = process.env.DATABASE_URL!;
if (!/localhost|127\.0\.0\.1/.test(url) && process.env.ALLOW_DESTRUCTIVE_SEED !== "1") {
  throw new Error("رفض التشغيل: DATABASE_URL ليس قاعدة بيانات محلية. ضع ALLOW_DESTRUCTIVE_SEED=1 للتجاوز.");
}
```

### 1.5 مسح الدفاتر متاح في الإنتاج
**الملفات:** `src/app/api/dev/reset-transactions/route.ts:16-47` و `src/app/api/companies/[id]/reset-transactions/route.ts:41-61`
بيعملوا `deleteMany({})` على كل الحركات المالية — محميين بالدور بس، **مفيش** حماية بيئة ولا تواكيد.

```ts
// أول حاجة جوّه الـ POST في الملفين
if (process.env.NODE_ENV === "production" && process.env.ENABLE_DATA_RESET !== "1") {
  return NextResponse.json({ error: "غير متاح", code: "DISABLED" }, { status: 404 });
}
```

### 1.6 رابط كشف الحساب ما بينتهيش أبدًا
**الملف:** `src/app/api/customers/[id]/statement-token/route.ts:19-29` + `src/app/api/public/statement/[token]/route.ts:18-24`
التوكن بيتولّد **مرة واحدة** عند إنشاء العميل وبيفضل صالح للأبد — يعني لو اتبعت على واتساب، مفيش أي طريقة تلغيه. ومفيش تاريخ انتهاء.

```prisma
// prisma/schema.prisma — model Customer
  statementToken          String?   @unique
  statementTokenCreatedAt DateTime?
  statementTokenExpiresAt DateTime?
```
```ts
// statement-token/route.ts — دوّر التوكن كل مرة (ده زرار الإلغاء)
const token = generateStatementToken();
await prisma.customer.update({
  where: { id },
  data: { statementToken: token, statementTokenCreatedAt: new Date(), statementTokenExpiresAt: new Date(Date.now() + 30 * 864e5) },
});
```
```ts
// public/statement/[token]/route.ts — نفّذ الانتهاء
if (!customer.statementTokenExpiresAt || customer.statementTokenExpiresAt < new Date()) {
  return NextResponse.json({ error: "انتهت صلاحية الرابط", code: "TOKEN_EXPIRED" }, { status: 410 });
}
```

### 1.7 كل القراءات مفتوحة لأي مستخدم
**الملفات:** ~50 مسار GET (كلهم `requireAuth()` بدل فحص الدور): `reports/route.ts:8`، `settlements/route.ts:8`، `companies/[id]/report/route.ts:31`، `investors/route.ts:7`، `engineers/[id]/statement`، `invoices/route.ts:14`.
**يعني:** موظف عادي (`EMPLOYEE`) يقدر يقرأ رواتب كل المهندسين، كل التسويات، وأرباح الشركات — حتى لو السايد بار مخفي له.

```ts
// src/lib/auth-helpers.ts — هيلبر جديد
export async function requireAnyPage(...pages: Page[]) {
  const user = await requireAuth();
  if (!user) return null;
  const role = (user as { role?: string }).role;
  return pages.some((p) => hasPageAccess(role, p)) ? user : null;
}
```
```ts
// reports/route.ts:8
const user = await requireAnyPage("reports");
if (!user) { /* 401 / 403 */ }
```

---

## P1 — فلوس وتطابق بيانات

### 2.1 الرواتب بتقع (500) — enum ناقص
**الملفات:** `prisma/schema.prisma` (enum `PayrollItemFlag` فيه 4 قيم فقط) + `src/lib/hr/payroll-engine.ts:65-70, 96, 100, 104, 140`
المحرك بيطلّع 7 قيم منها 5 مش موجودة في الـ enum.

```prisma
enum PayrollItemFlag {
  NONE
  NEGATIVE_NET
  HIGH_DEDUCTION
  MISSING_PUNCHES
  MISSING_ATTENDANCE
  HIGH_OVERTIME
  MISSING_SALARY
  CONTRACT_EXPIRED
  INACTIVE_EMPLOYEE
}
```
```sql
-- migration
ALTER TYPE "PayrollItemFlag" ADD VALUE IF NOT EXISTS 'MISSING_ATTENDANCE';
ALTER TYPE "PayrollItemFlag" ADD VALUE IF NOT EXISTS 'HIGH_OVERTIME';
ALTER TYPE "PayrollItemFlag" ADD VALUE IF NOT EXISTS 'MISSING_SALARY';
ALTER TYPE "PayrollItemFlag" ADD VALUE IF NOT EXISTS 'CONTRACT_EXPIRED';
ALTER TYPE "PayrollItemFlag" ADD VALUE IF NOT EXISTS 'INACTIVE_EMPLOYEE';
```

### 2.2 قفل الرواتب بيقفل الشهر الغلط
**الملف:** `src/app/api/hr/payroll/route.ts:262-263`
بيستخدم `run.createdAt` بدل شهر الفترة → لو روتّبت كشف الشهر اللي فات بيتقفل الشهر ده وتتم سحوبات مرتين.

```ts
// قبل
where: { employeeId: item.employeeId, status: "APPROVED", deductMonth: run.createdAt.getMonth() + 1, deductYear: run.createdAt.getFullYear() },
// بعد — جيب الفترة مع الـ run
const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { Period: true } });
where: { employeeId: item.employeeId, status: "APPROVED", deductMonth: run.Period.month, deductYear: run!.Period.year },
```

### 2.3 حساب كشف الرواتب مش idempotent
**الملف:** `src/app/api/hr/payroll/route.ts:173` — ضغطة مرتين = مستحقين مرتين.

```ts
const payrollRun = await prisma.$transaction(async (tx) => {
  const existing = await tx.payrollRun.findFirst({
    where: { periodId: period.id, status: { in: ["CALCULATED", "APPROVED", "LOCKED"] } },
  });
  if (existing) throw new Error(`PAYROLL_ALREADY_CALCULATED:${existing.id}`);
  return tx.payrollRun.create({ /* …البيانات الحالية… */ });
});
```

### 2.4 تكلفة المرتجعات من العميل (تلاعب في الأرباح)
**الملفات:** `src/app/api/sales/intercompany/route.ts:139-142` و `[id]/route.ts:129`
التكلفة جاية من `item.costPrice` في الـ body، وبيتقيّد في القيد المحاسبي (سطر 344-345).

```ts
// قبل
const costTotal = (items as InterItem[]).reduce((sum, i) => sum + i.quantity * (Number(i.costPrice) || 0), 0);

// بعد — التكلفة من قاعدة البيانات مش من العميل
const costRows = await prisma.product.findMany({
  where: { id: { in: (items as InterItem[]).map((i) => i.productId) } },
  select: { id: true, purchasePrice: true },
});
const costByProduct = new Map(costRows.map((p) => [p.id, Number(p.purchasePrice) || 0]));
const costTotal = (items as InterItem[]).reduce((s, i) => s + (costByProduct.get(i.productId) ?? 0) * i.quantity, 0);
```

### 2.5 رقمان مختلفان لصافي الربح
**الملفات:** `src/app/api/companies/route.ts:56` (صحيح) و `src/app/api/companies/[id]/report/route.ts:262-267` (غلط — بيضيف التحصيلات كأنها دخل)

```ts
// report/route.ts:262 — بدل
const netProfit = totalSales - totalPurchases - totalExpenses - salesReturns + totalSettlementsForProfit;
// حط
const netProfit = totalSales - totalPurchases - totalExpenses - salesReturns + purchaseReturns;
```
الأفضل: هنلبر واحد في `src/lib/report-math.ts` يستعمله الاتنين.

### 2.6 تسوية معتمدة ترجع INITIAL وتتحقق مرتين
**الملف:** `src/app/api/settlements/[id]/route.ts:71, 90, 109-123`
السطر 71 يسمح بـ `INITIAL` على تسوية `VERIFIED` → السطر 90 `verifyingNow = true` تاني → تأثير دين العميل بيتطبق **مرة تانية**.

```ts
// بعد السطر 70
if (existing.status === "VERIFIED" && body.status === "INITIAL") {
  return NextResponse.json(
    { error: "لا يمكن إرجاع تسوية معتمدة — استخدم تسوية عكسية", code: "REVERSE_VIA_NEW_SETTLEMENT" },
    { status: 409 },
  );
}
```

### 2.7 دفع الأقساط مرتين
**الملف:** `src/app/api/sales/[id]/installments/route.ts:53-108`
`updateMany` بلا شرط `status` → الدفعة بتتنفذ مرتين و`remainingDebt` بينقص مرتين.

```ts
const claimed = await tx.installment.updateMany({
  where: { id: { in: installmentIds }, salesOrderId: orderId, status: { not: "PAID" } },
  data: { status: "PAID", paidDate: paymentDateTime },
});
if (claimed.count === 0) throw new Error("INSTALLMENTS_ALREADY_PAID");
```

### 2.8 فقد تحديث في رصيد العميل
**الملف:** `src/app/api/customers/[id]/payments/route.ts:97, 112, 128-133`
يقرأ `remainingDebt` برّه الـ transaction ويمسححة بقيمة مطلقة → دفعتين متزامنتين بيمسحوا التانية.

```ts
await tx.customer.update({
  where: { id },
  data: { remainingDebt: { decrement: paymentAmount }, lastPaymentDate: payDate },   // ذرّي مش مطلق
});
```

### 2.9 الاختبار + التسوية مش في transaction واحدة
**الملف:** `src/app/api/customers/[id]/tests/route.ts:202-263`
لو `settlement.create` فشل، الاختبار بيفضل موجود وفيه مبلغ محصل من غير تسوية.

```ts
const { test, settlementId } = await prisma.$transaction(async (tx) => {
  const created = await tx.copierTest.create({ data: { … }, include: TEST_INCLUDE });
  let sid: string | null = null;
  if (collectedAmount != null) {
    const company = await tx.company.findFirst({ where: { id: (actor as any).companyId } });
    const settlement = await tx.settlement.create({ data: { …, copierTestId: created.id } });
    sid = settlement.id;
  }
  return { test: created, settlementId: sid };
});
```

### 2.10 مفيش رابط بين التسوية والمصدر (أهم سبب لفلوس الـ 1.59 مليون)
**الملف:** `prisma/schema.prisma` — `Settlement` فيها `customerId / engineerId` بس، **مفيش** `copierTestId` ولا `returnTransactionId` ولا `salesOrderId`. والنظام بيفرّق بينهم بالبحث في نص `reason`.

```prisma
model Settlement {
  // …
  sourceType          String?   // "COPIER_TEST" | "SALES_ORDER" | "RETURN" | "WORKSHOP_TX" | "MANUAL"
  copierTestId        String?
  salesOrderId        String?
  returnTransactionId String?
  copierTest        CopierTest?        @relation(fields: [copierTestId], references: [id], onDelete: SetNull)
  returnTransaction ReturnTransaction? @relation(fields: [returnTransactionId], references: [id])
  @@index([copierTestId])
  @@index([returnTransactionId])
}
model CustomerPayment {
  // …
  salesOrderId String?    // بدل البحث في notes بالـ contains
  kind         String?    // RECEIPT | CREDIT_USED | REFUND
  @@index([customerId, paymentDate])
}
```
وبكده نقدر نعمل:
- منع حذف اختبار عليه تسوية (409)
- تحديث التسوية لما يعدّل المبلغ المحصل
- استبدال البحث بالنص في `companies/[id]/report/route.ts:249`

### 2.11 الفلوس بتتخزن `Float` (مش precise)
**الملف:** `prisma/schema.prisma` — ~90 حقل فلوس (منها `Settlement.amount`، `Customer.remainingDebt`، `CustomerLedger.balance`، `JournalEntryItem.debit/credit`، `SalesOrder.total`).
Postgres `double precision` مش دقيق → `remainingDebt - Σ الحركات` مش بيساوي الرصيد الافتتاحي بالظبط.

```prisma
model Settlement { amount Decimal @db.Decimal(18,2) }
model Customer {
  creditLimit   Decimal @default(0) @db.Decimal(18,2)
  totalDebt     Decimal @default(0) @db.Decimal(18,2)
  remainingDebt Decimal @default(0) @db.Decimal(18,2)
}
```
مع migration: `ALTER TABLE "Settlement" ALTER COLUMN "amount" TYPE DECIMAL(18,2) USING round("amount"::numeric,2);`

### 2.12 ثلاث مصادر للرصيد الواحد
**الملفات:** `prisma/schema.prisma:198-199, 257` + `src/app/api/customers/route.ts:93-97` + `customers/[id]/route.ts:97-98`
`remainingDebt` و `CustomerLedger.balance` لازم يكونوا متساويين، بس:
- إنشاء العميل بيسجل `balance: 0` حتى لو `remainingDebt` اتحسب.
- تعديل العميل من الواجهة بيكتب `Math.max(0, …)` فـ**بيضيّع رصيد تحت الحساب** (السالب).

```ts
// customers/[id]/route.ts — امنع التعديل اليدوي للمبالغ
if (totalDebt !== undefined || remainingDebt !== undefined) {
  return NextResponse.json({ error: "المبالغ تُحسَب آليًا من الفواتير والتسويات", code: "AMOUNTS_READ_ONLY" }, { status: 400 });
}
```

### 2.13 حذف الماكينة بيمسح سجلها كله بصمت
**الملف:** `src/app/api/machines/[id]/route.ts:119-139` — بيتأكد من `serviceRequest` بس.

```ts
const [sr, mo, mr, wa, cm, so, ct] = await Promise.all([
  prisma.serviceRequest.count({ where: { machineId: id } }),
  prisma.machineOwnerHistory.count({ where: { machineId: id } }),
  prisma.meterReading.count({ where: { machineId: id } }),
  prisma.warranty.count({ where: { machineId: id } }),
  prisma.contractMachine.count({ where: { machineId: id, contract: { status: "ACTIVE" } } }),
  prisma.scrapOrder.count({ where: { machineId: id } }),
  prisma.copierTest.count({ where: { machineId: id } }),
]);
if ([sr, mo, mr, wa, cm, so, ct].reduce((a, b) => a + b, 0) > 0) {
  return NextResponse.json({ error: "الجهاز له سجلات — امسحه كخردة بدل الحذف", code: "MACHINE_IN_USE" }, { status: 409 });
}
```

### 2.14 حذف أمر شراء مستلَم بيسيب المخزون زائد
**الملف:** `src/app/api/purchases/[id]/route.ts:167-170` — DELETE مش بيعكس حركة المخزون زي ما PUT بيعمل.

```ts
if (existing.status === "RECEIVED") {
  return NextResponse.json({ error: "ألغِ الاستلام أولاً ثم احذف الأمر", code: "RECEIVED_BLOCKS_DELETE" }, { status: 409 });
}
```

### 2.15 الإجازات: `Math.abs` بيقبل تاريخ معكوس + ازدواج الخصم
**الملف:** `src/app/api/hr/leaves/route.ts:57-58, 132-145` + فيه تنفيذ مكرر في `src/lib/hr/leave-engine.ts` (**مش مستخدم في أي حتة**).

```ts
// قبل
const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
// بعد
if (endDate < startDate) return NextResponse.json({ error: "تاريخ النهاية قبل البداية", code: "END_BEFORE_START" }, { status: 400 });
const daysCount = calculateBusinessDays(startDate, endDate, [5, 6], await loadHolidays(actor.companyId));
// والخصم لازم يكون ذرّي داخل transaction مع claim على الطلب
const claimed = await tx.leaveRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED" } });
if (claimed.count !== 1) throw new Error("LEAVE_ALREADY_REVIEWED");
```

### 2.16 الماكينة يقدر يكون في حالتين في نفس الوقت
**الملف:** `src/app/api/machines/[id]/route.ts:60-99` + `prisma/schema.prisma:480-512`
`currentStatus` و `currentOwnerId` عمودين مستقلين، مفيش machine state ولا سجل `MachineOwnerHistory` بيتكتب.

```ts
const owned = ["SOLD", "RENTED", "UNDER_MAINTENANCE", "UNDER_INSPECTION"].includes(nextStatus);
if (owned !== Boolean(nextOwner)) {
  return NextResponse.json({ error: "حالة الجهاز لا تتوافق مع المالك", code: "STATUS_OWNER_MISMATCH" }, { status: 400 });
}
```

### 2.17 طلبات الشراء: الـ body كله بيتبعت لـ Prisma
**الملف:** `src/app/api/purchases/route.ts:78, 114-126` — مفيش تحقق من الكمية/السعر، والعميل يقدر يبعت `status: "RECEIVED"`.
نفس المشكلة في `investors/route.ts:31`، `investors/[id]/route.ts:42`، `service-requests/route.ts:116`، `machines/route.ts:62`.

```ts
for (const item of rawItems) {
  if (!item?.productId || !Number.isInteger(item.quantity) || item.quantity <= 0 ||
      !Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
    return NextResponse.json({ error: "بنود الشراء غير صالحة", code: "INVALID_PURCHASE_ITEMS" }, { status: 400 });
  }
}
```

### 2.18 أرقام المستندات `Date.now()` (تصادم)
**الملفات:** `settlements/route.ts:81`، `customers/[id]/tests/route.ts:230`، `workshop/[machineId]/scrap/route.ts:41`، `contracts/route.ts:103`
`Settlement.settlementNumber` `@unique` وبيتولّد من وقت الميلي ثانية → تصادم مع استيراد الكميات الكبيرة.

```ts
const settlementNumber = `STL-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
```

### 2.19 التحصيل بيتقيّد في شركة واحدة ثابتة بالاسم
**الملف:** `src/app/api/customers/[id]/tests/route.ts:226-228`

```ts
const company = (await prisma.company.findFirst({ where: { name: "اليكس كوبير" } })) ?? (await prisma.company.findFirst());
// بعد — من جلسة المستخدم
const companyId = (actor as { companyId?: string }).companyId;
```

### 2.20 فوترة المبالغ من `Float` + بدون قيود على مستوى القاعدة
**الملف:** `prisma/schema.prisma` — **صفر** `CHECK` constraints.

```sql
ALTER TABLE "Contract" ADD CONSTRAINT chk_contract_dates CHECK ("endDate" > "startDate");
ALTER TABLE "LeaveRequest" ADD CONSTRAINT chk_leave_dates CHECK ("endDate" >= "startDate" AND "daysCount" > 0);
ALTER TABLE "Settlement" ADD CONSTRAINT chk_settlement_amount CHECK (amount > 0);
ALTER TABLE "JournalEntryItem" ADD CONSTRAINT chk_je_side CHECK ((debit = 0) <> (credit = 0));
```

---

## P2 — الربط بين الفرونت والباك + أداء

### 3.1 `MeterReading` مفيش أي حاجة بتكتب فيه
**الملفات:** `prisma/schema.prisma` (الموديل موجود) + **مفيش ولا API** فيه `meterReading.create`
النتيجة: مفيش تاريخ عدادات لأي ماكينة من 2,451 → مستحيل نحسب فرق النسخ بين فترتين، وكمان من 1,664 عقد **صفر** بيفوتروا بعدد النسخ (`costPerCopy = 0`).

```ts
// src/app/api/customers/[id]/tests/route.ts — جوّه نفس الـ transaction
if (machineId && black != null) {
  await tx.meterReading.create({
    data: { machineId, reading: black, source: "MANUAL", readingDate: testDate ?? new Date(), notes: `اختبار ${created.id}` },
  });
}
```

### 3.2 البحث مش متوافق مع العربي
**الملف:** `src/components/SearchInput.tsx:44-47`
الدالة `matchesQuery` بتعمل `toLowerCase()` بس — يعني «احمد» مش بتلاقي «أحمد»، و«فاطمه» مش بتلاقي «فاطمة». وفي نسخة تانية **صح** في `SearchableSelect.tsx:26-33`، يعني البحث والسليكت بيتعاملوا مختلف.

```ts
// SearchInput.tsx
export function normalizeAr(s: string) {
  return String(s ?? "").toLowerCase()
    .replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ـ/g, "").trim();
}
export function matchesQuery(haystack: string | undefined | null, query: string): boolean {
  if (!query) return true;
  return normalizeAr(haystack).includes(normalizeAr(query));
}
// SearchableSelect.tsx:26 — امسح النسخة المحلية واستورد normalizeAr
```

### 3.3 قاعدة CSS بتلغي عرض الجداول
**الملف:** `src/app/globals.css:100-105`

```css
.overflow-x-auto > table, .responsive-table { min-width: min(44rem, 185vw); }
```
دي CSS مش في layer، فبتتغلب على Tailwind utility → كل `min-w-[1200px]` في الجداول (منها صفحة الاختبارات) بتتحوّل لـ 704px وتتكسر.

```css
.overflow-x-auto > table:not([class*="min-w-"]),
.responsive-table:not([class*="min-w-"]) { min-width: min(34rem, 150vw); }
```
وكمان `globals.css:130-141` — العمود الأول الثابت لونه أبيض صريح، بيغطي لون الصف في جدول المبيعات.

```css
.overflow-x-auto > table td:first-child { position: sticky; inset-inline-start: 0; background: inherit; }
```

### 3.4 ضغفت fetch على كل عملية تعديل
**الملفات:** 60 استدعاء `notifyDataChanged()` في 25 صفحة + `src/hooks/useAutoRefresh.ts:39-54`
الصفحة بتنادي `refresh()` وبعدها بتبعت حدث لنفسها → شبكة تانية.

```ts
// useAutoRefresh.ts في run()
state.current.running = true;
state.current.lastDoneAt = Date.now();   // سطر واحد يمنع الـ double fetch
```

### 3.5 استعلامات مفتوحة على جداول ضخمة
**الملفات:** `src/app/api/reports/route.ts:23-88` (بيسحب كل الـ visits مع 1,664 عقد) · `src/app/api/companies/[id]/report/route.ts:74-109` (كل تاريخ الشركة) · `src/app/api/upload/route.ts:10-28` (من غير حد حجم ولا نوع)

```ts
// reports/route.ts
prisma.contract.findMany({
  take: 200, orderBy: { endDate: "asc" },
  select: { id: true, contractNumber: true, value: true, status: true, endDate: true, _count: { select: { visits: true } } },  // بدل visits: true
});
```
```ts
// upload/route.ts — استخدم الفاليديشن الموجود فعلاً في copier-test-upload.ts
if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
  return NextResponse.json({ error: "نوع الملف غير مدعوم", code: "FILE_INVALID" }, { status: 400 });
}
if (file.size > 5 * 1024 * 1024) {
  return NextResponse.json({ error: "الحجم يتجاوز 5MB", code: "FILE_TOO_LARGE" }, { status: 400 });
}
```

### 3.6 فهارس ناقصة (11 `@index` بس في 71 موديل)
**الملف:** `prisma/schema.prisma`
الجداول اللي بتتفحص مع كل تحميل للوحة التحكم مالهاش فهارس: `ServiceRequest`، `Contract`، `Installment`، `Settlement`، `SalesOrder`، `CustomerPayment`، `WarehouseInventory`، و`CopierTest` (17,186 سجل) فهرسها الوحيد `[customerId, testDate]` رغم إن الصفحة بتطلب ترتيب `[testDate desc, createdAt desc]`.

```prisma
model ServiceRequest { @@index([status, createdAt]) @@index([engineerId, status]) @@index([companyId, status]) }
model Contract        { @@index([status, endDate]) }
model Installment     { @@index([status, dueDate]) }
model Settlement      { @@index([customerId, createdAt]) @@index([companyId, status, createdAt]) }
model SalesOrder      { @@index([customerId, paymentStatus]) @@index([companyId, orderDate]) }
model CopierTest      { @@index([testDate, createdAt]) @@index([engineerId, testDate]) }
```

### 3.7 مفيش `take` في تحميل العملاء (2,458 عميل بكل التفاصيل)
**الملفات:** `src/app/api/customers/route.ts:18-28` (locations + ledgers + engineer + payments) — بيحمّله صفحتا العملاء والاختبارات.

```ts
// src/app/api/customers/options/route.ts (جديد) — للاختيار والبحث بس
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  const rows = await prisma.customer.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    select: { id: true, name: true },
    take: 25, orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}
```
```tsx
// tests/page.tsx — بدل تحميل 2,458 عميل
const res = await fetch(`/api/customers/options?q=${encodeURIComponent(query)}`, { signal });
```

### 3.8 عناوين الصفحات غلط في 15 صفحة
**الملف:** `src/app/(dashboard)/layout.tsx:9-31, 37`
`pageTitles[pathname]` مطابقة تامة، فأي مسار مش موجود بيعرض **«لوحة التحكم»**: `/hr/*` كلهم، `/warehouses`، `/products`، `/trade-ins`، `/workshop-daily`، `/customers/balances`، `/suppliers/balances`، `/sales/categories`، `/expenses/categories`.

```ts
const titleKey = useMemo(() => {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (SEGMENT_TITLES[path]) return SEGMENT_TITLES[path];
  const parent = path.split("/").slice(0, -1).join("/") || "/";
  return SEGMENT_TITLES[parent] ?? "dashboard.title";
}, [pathname]);
```

### 3.9 الداشبورد مثبّت RTL حتى لو المستخدم على إنجليزي
**الملف:** `src/app/(dashboard)/layout.tsx:40`

```tsx
const { t, dir } = useI18n();
<div className="flex h-screen overflow-hidden bg-gray-50" dir={dir}>
```
وكمان `Sidebar.tsx:255,270` (`right-3`/`right-0` → `end-3`/`end-0`) و`Header.tsx:201` (`pr-16` → `pe-16`).

### 3.10 `new Date().toISOString()` بيسجّل اليوم غلط
**الملفات:** `customers/page.tsx:127, 396`، `purchases/page.tsx:109, 161, 303`
`toISOString()` بتوقيت UTC ومصر +2/+3 → بين 10 بالليل و12 بالليل التسجيل بياخد تاريخ **بكره**.

```ts
// src/lib/dates.ts (جديد)
export function todayLocal(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
```

### 3.11 عربية مكتوبة في كومبوننتات مشتركة
**الملفات:** `src/components/SearchableSelect.tsx:39-41,198,254,307,314` · `src/components/SelectWithAdd.tsx:89,97,114,123,162,196,204`
«اختر...»، «لا توجد نتائج»، «إلغاء»… بتظهر بالعربي لكل مستخدم إنجليزي، و`FilterSelect` مبني على `SearchableSelect` يعني **كل** سليكت في السيستم.

```tsx
// SearchableSelect.tsx
const { t } = useI18n();
placeholder = t("common.selectOption"), searchPlaceholder = t("common.search"), emptyText = t("common.noData"),
aria-label={t("common.clearSelection")}
```

### 3.12 مودال النظام كله ناقص وصولية
**الملف:** `src/components/FormModal.tsx:28-44` — مفيش `role="dialog"` ولا Escape ولا focus trap، وزرار الإغلاق بلا `aria-label`. كل مودالات الـERP (20+ صفحة) بتعدي من هنا.

```tsx
useEffect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
  document.addEventListener("keydown", onKey);
  document.body.style.overflow = "hidden";
  return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
}, [open, onClose]);
// <div role="dialog" aria-modal="true" aria-labelledby={titleId} …>
```

### 3.13 25 صفحة بتنادي `filtered` من غير `useMemo`
**أمثلة:** `sales/page.tsx:196` · `customers/page.tsx:160` · `contracts/page.tsx:242` · `purchases/page.tsx:173` · `machines/page.tsx:127` · `service-requests/page.tsx:210` (+ 19 ملف تاني)
البحث في المبيعات بيعمل join لكل بنود الطلب مع كل حرف.

```tsx
const filtered = useMemo(() => orders.filter(/* … */), [orders, paymentFilter, typeFilter, companyFilter, dateFrom, dateTo, search]);
```

### 3.14 17 صفحة البحث فيها مش بيرجع لصفحة 1
**الملفات:** `sales/page.tsx:1042` · `contracts/page.tsx:428` · `purchases/page.tsx:605` · `engineers/page.tsx:536` (+ 13 تاني)

```tsx
<SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} … />
```

### 3.15 صفحات بتتجاهل رد السيرفر (الأسوأ: الأجهزة)
**الملفات:** `src/app/(dashboard)/machines/page.tsx:178-206` · `investors/page.tsx:120-124`
مفيش فحص لـ `res.ok` → لو السيريال مكرر (وهو `UNIQUE`) بتفرقع رسالة **نجاح** وبتقفل المودال.

```tsx
const res = await fetch("/api/machines", { method: "POST", … });
const data = await res.json().catch(() => null);
if (!res.ok) { setError(apiErrorMessage(data, t)); return; }
```

### 3.16 بولينج كل 30 ثانية في الهيدر
**الملف:** `src/components/Header.tsx:190-192` — 2,880 طلب/يوم لكل مستخدم، وقاعدة المشروع نفسها بتقول «Never polls on an interval».

```tsx
// استبدل الـ setInterval ب refocus زي useAutoRefresh
const onVisible = () => { if (document.visibilityState === "visible") void fetchNotifications(); };
document.addEventListener("visibilitychange", onVisible);
```

### 3.17 أرقام عربية-هندية في كشف حساب العميل
**الملف:** `src/app/s/[token]/page.tsx:104-107, 184` — `toLocaleString("ar-EG")` بيطلع أرقام ٠١٢، وكمان "آخر تحديث" بيعرض تاريخ النهاردة بدل آخر تحديث حقيقي.

```tsx
const money = (n: number) => `${n.toLocaleString("en-GB")} ${t("hr.currency")}`;
<Stat label={t("statement.lastUpdate")} value={formatDate((lastUpdated ?? new Date()).toISOString())} … />
```

### 3.18 مفيش CSS للطباعة في كشوف الحساب
**الملفات:** `src/app/s/[token]/page.tsx` · `src/app/e/[token]/page.tsx` — مفيش أي `@media print` في `globals.css`، فطباعة كشف الحساب بتطلع فيها زرار الطباعة والديسك الديني.

```css
@media print {
  @page { size: A4; margin: 14mm; }
  .no-print { display: none !important; }
  thead { display: table-header-group; }
}
```

### 3.19 تكرار بيـ في الكود
| التكرار | العدد | الملف المقترح |
|---|---|---|
| `handleDelete` منسوخ | 23 صفحة | `src/hooks/useEntityDelete.ts` |
| بلاطة التفاصيل (`rounded-lg border…bg-gray-50 p-3`) | 49 نسخة + 3 clones | `src/components/DetailTile.tsx` |
| علامات `CREDIT/INSTALLMENT/MIXED` كلها «أجل» | `sales/page.tsx:27-32` | تفريقهم |
| `MAINTENANCE*` كلها «صيانه» | `contracts/page.tsx:35-44` | تفريقهم |
| تعريف «الطلب المفتوح» مختلف في 3 أماكن | `dashboard.ts:1` · `engineer-statement.ts:50` · `reports/route.ts:121,221` |صدّره من `dashboard.ts` |
| حساب حالة السداد بـ 3 خوارزميات | `payment-status.ts:37` · `companies/[id]/report:138-151` · `sales/route.ts:191` | `derivePaymentStatus()` واحدة |
| `requirePageAccess` guard مكرر | كل مسارات الكتابة | `requireAnyPage()` |

### 3.20 مفاتيح صلاحيات بلا صفحة
**الملف:** `src/lib/permissions.ts:44-45` — `hrSelfService` (ممنوح لكل الأدوار الـ9) و`hrReports` مفيش لهما صفحة ولا سايد بار. و`settings/page.tsx:31-39` فيه 7 badges من 9 أدوار، فـ`HR_MANAGER` و`EMPLOYEE` مفيش لهم ترجمة في `ar.json/en.json` (`roles.*`) — بيطلع النص الحرفي `roles.HR_MANAGER`.

### 3.21 الـ lint فيه ديون قديمة
`npx eslint .` بيطلع **73 error** (منها 29 `react-hooks/set-state-in-effect`) في 25 ملف. مش introduced من الشغل الجديد، بس لازم تتنضف دفعة واحدة — والأهم `src/components/SearchableSelect.tsx:99` و`src/components/PrintMenu.tsx:23`.

### 3.22 ملاحظات
- `prisma/seed-access.ts` فيه استيراد Access — لازم يتشال من مسار الإنتاج (حجم + بيانات عملاء).
- `prisma/seed-hr.ts` و`seed.ts` مالهمش سكربت في `package.json` (`db:seed:access` و`db:seed:hr` موجودين بس) — كويس، سيب كده.

---

## P3 — فيتشر وتقارير تفيد البيزنس

الأرقام دي **مقروءة من الإنتاج**، مش تخمين:

| المؤشر | القيمة |
|---|---|
| اختبارات فيها تحصيل | 1,156 بقيمة **1,590,342 ج.م** |
| تسويات متحقّقة | **0 من 1,156** |
| رصيد العملاء في الدفاتر | 23,500 ج.م |
| عقود | 1,664 (**1,308 منتهية**) |
| عقود بتفوترة بعدد النسخ | **0** |
| طلبات بيع / شراء | 11 / **0** |
| ماكينات / عملاء | 2,451 / 2,458 |

### 4.1 تقرير «أعمار الديون» (الأهم لفريقك المالي)
**الملفات:** `src/app/(dashboard)/customers/balances/page.tsx` + API جديد
```ts
// src/app/api/reports/aging/route.ts (جديد)
const rows = await prisma.customer.findMany({
  where: { remainingDebt: { gt: 0 } },
  select: { id: true, name: true, phone: true, remainingDebt: true, lastPaymentDate: true },
});
const now = Date.now();
const bucket = (d: Date | null) => {
  if (!d) return "noPayment";
  const days = Math.floor((now - new Date(d).getTime()) / 86_400_000);
  if (days <= 30) return "d0_30"; if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90"; return "d90plus";
};
// وبناءً عليه: تنبيه في الداشبورد + زرار «تسجيل دفعة» من التقرير نفسه
```

### 4.2 تسوية التحصيل: شاشة confirm + تقرير «معلّقة»
**الملفات:** `src/app/(dashboard)/settlements/page.tsx` + `src/lib/notifications.ts`
`notifications.settlementsUnverified` موجودة في الترجمة بس مفيش صفحة Triaged. المطلوب: صفحة «تسويات بانتظار التحقق» فيها كل الـ1,156 (بترتيب الأقدم) + **دفعة جماعية** + تقرير «نسبة التحصيل اليومي/الأسبوعي/الشهري».

### 4.3 توصيل العدادات بـ `MeterReading` + تقرير «تطور العدادات»
**الملفات:** `customers/[id]/tests/route.ts` (الكتابة) + `machines/[id]` (العرض) + تقرير جديد
```ts
// تقرير: لكل ماكينة آخر قراءة + الفروق الشهرية + متوسط النسخ/يوم
prisma.meterReading.groupBy({ by: ["machineId"], _max: { reading: true }, _min: { reading: true } });
```
ومعاها **قرار لازم تتخذه:** هل الفوتurance المفروض بعدد النسخ؟ لو أيوه، ده اللي ناقصك (`costPerCopy = 0` في كل الـ1,664 عقد).

### 4.4 تقرير «العقود المستحقة للتجديد»
**الملفات:** `src/app/(dashboard)/reports/page.tsx` + `contracts/route.ts`
```ts
// 1,308 عقد منتهية = دخل متكرر بيضيع
prisma.contract.findMany({
  where: { status: "ACTIVE" },
  select: { id: true, contractNumber: true, endDate: true, value: true, customer: { select: { name: true } } },
  orderBy: { endDate: "asc" },
});
// buckets: منتهية / 30 يوم / 60 يوم / 90 يوم + زر «تجديد» بينقل لصفحة تعديل العقد
```

### 4.5 عمود «حالة التحصيل» في صفحة الاختبارات
**الملفات:** `src/app/(dashboard)/tests/page.tsx` + `src/app/api/tests/route.ts`
المهندس بيقبض من العميل ومش شايف إن التسوية اتحققت ولا اترفضت.

```ts
// api/tests/route.ts — ضيف التسوية في الـ include
include: { …, settlement: { select: { id: true, status: true, verifiedBy: { select: { name: true } } } } }
// tests/page.tsx — عمود جديد
<td>{row.settlement ? <Badge tone={row.settlement.status}>{t(`settlements.status.${row.settlement.status}`)}</Badge> : "—"}</td>
```

### 4.6 تقرير إنتاجية المهندس بالتحصيل
**الملفات:** `src/app/(dashboard)/engineers/page.tsx` + `src/lib/engineer-statement.ts`
ملف المهندس مفيهوش أي ذكر لـ `CopierTest` — فلوسه اللي جمعها من العملاء مش باينة ليه.

```ts
// engineer-statement.ts — ضيف قسم
const collections = await prisma.copierTest.findMany({
  where: { engineerId: id, testDate: { gte: periodStart, lte: periodEnd } },
  select: { testDate: true, blackCounter: true, colorCounter: true, collectedAmount: true, customer: { select: { name: true } } },
});
```

### 4.7 «رسم بياني» بدل الأرقام بس
`StatsCards` موجود في `src/components/` — والداشبورد كله كروت. **اقتراح:** sparkline ربح/تحصيل 6 شهور، وbar chart للأ NYPD engineers، عشان ال GM يشوف الاتجاه من غير ما يفتح التقارير.

---

## خطة التنفيذ المقترحة (بالترتيب)

| المرحلة | المحتوى | Effort | ليه دلوقتي |
|---|---|---|---|
| **1 — أمان (يومين)** | 1.1، 1.2، 1.3، 1.4، 1.5، 1.6، 1.7 | ~2 يوم | مسح بيانات ومmanentة من غير تسجيل دخول، وتعديل رواتب من أي حساب |
| **2 — فلوس (3 أيام)** | 2.1، 2.4، 2.6، 2.7، 2.8، 2.9، 2.10، 2.18 | ~3 أيام | أخطاء معروفة بتفقد/تضاعف فلوس، والـ1.59 مليون محتاجة رابط بمصدرها |
| **3 — أداء (يومين)** | 3.5، 3.6، 3.7، 3.4، 3.13 | ~2 يوم | `/api/reports` و`companies/[id]/report` بيقتلوا السيرفر الأداء |
| **4 — واجهة (3 أيام)** | 3.2، 3.3، 3.8، 3.9، 3.11، 3.15، 3.20 | ~3 أيام | بحث عربي مش شغال، عناوين غلط، أخطاء بتتقفل في غيرها |
| **5 — فيتشر (5 أيام)** | 4.1، 4.2، 4.3، 4.4، 4.5 | ~5 أيام | تقارير بتكشف فلوس نايمة وعملاء ناسين |
| **6 — تنظيف (يومين)** | 2.11، 2.12، 2.20، 3.19، 3.21 | ~2 يوم | ديون تقنية هتكلّف أكتر كل ما اتأخرت |

> **ملاحظة:** البنود اللي في P1 و P3 محتاجة `prisma migrate` (schema). لازم تعمل **snapshot** من قاعدة الإنتاج قبلها:
> `npx prisma db pull` على نسخة + اختبار كل migration على نسخة staging الأول.

---

## ملحق: إزاي تتأكد إن كل إصلاح شغال

```bash
npm test        # 259 اختبار — لازم يعدي 100% بعد كل تعديل
npm run lint    # العدّاد حاليًا 73 error → لازم ينزل
npm run build   # ده الـ typecheck
```

وللتحقق من الإصلاح على البيانات الحقيقية (بلا ما تكسر حاجة):
```bash
# 1) Jesuit مؤقت على جدول صغير
npx tsx scripts/verify-access-counts.ts
# 2) اختبار المسارات بعد التغيير
node scripts/e2e-workshop.mjs
node scripts/e2e-access.mjs
```
