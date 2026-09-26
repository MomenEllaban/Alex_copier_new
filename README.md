# اليكس كوبير — Alex Copier ERP

نظام ERP لشركة **اليكس كوبير** (بيع وصيانة ماكينات Copier و Printer في مصر).

| | |
|---|---|
| **🌐 الموقع الأونلاين** | **https://alex-copier.vercel.app/login** |
| صفحة الاختبارات الجديدة | https://alex-copier.vercel.app/tests |
| الريبو | https://github.com/MomenEllaban/Alex_copier_new |
| دليل الاختبار | [TESTING-GUIDE.md](./TESTING-GUIDE.md) |

> تسجيل الدخول السريع: صفحة الدخول نفسها فيها زرار لكل حساب تجريبي — اضغط الحساب وتدخل على طول.

---

## 👥 الحسابات التجريبية

| المستخدم | الدور | الإيميل | صفحة الاختبارات |
|---|---|---|---|
| رضا | مدير عام — كل حاجة في السيستم | `reza@alex-copier.com` | ✅ |
| عمرو | مدير إداري — شركة القطاعي + الورشة | `amr.manager@alex-copier.com` | ✅ |
| حاتم | محاسب — كل حاجة في السيستم | `hatem.accountant@alex-copier.com` | ❌ (مالي فقط) |
| عمرو | محاسب — كل حاجة في السيستم | `amr.accountant@alex-copier.com` | ❌ (مالي فقط) |
| أحمد خالد | الورشة — تسجيل الاختبارات + يومية الورشة | `ahmed.khaled@alex-copier.com` | ✅ |
| مؤمن | موظف مبيعات — شركة جملة قطع غيار | `moemen.sales.parts@alex-copier.com` | ✅ |
| مؤمن | موظف مبيعات — شركة جملة آلات | `moemen.sales.machines@alex-copier.com` | ✅ |
| مؤمن | مهندس صيانة | `moemen.engineer@alex-copier.com` | ✅ (عملاءه بس) |

كلمة المرور لكل الحسابات التجريبية: `password123` — وفي زرار دخول سريع لكل واحد منهم في صفحة الدخول.

---

## 🧰 المميزات

- **العملاء** والعقود وطلبات الصيانة والمهندسين والزيارات
- **اختبارات العملاء** (`/tests`): تسجيل قراءات العدادات + صورة + بيان الإصلاح + قطع الغيار + المبلغ المحصل (بيتحوّل لتسوية وتنبيه للمحاسب) — ببحث وفلاتر وباجينيشن وتصدير
- **الورشة** ويومية الورشة (خزنة يومية: وارد/صادر، تأكيد المحاسب، تسليم وإقفال اليوم)
- **المبيعات والمشتريات والمرتجعات** والمخزون والمستودعات
- **المالية**: المصروفات والتسويات والمستخدمون والشركات والمستثمرون
- **الموارد البشرية**: الموظفون والحضور والإجازات والرواتب
- **التقارير** وكشوف الحساب (للعميل/المورد/المهندس) برابط مشاركة
- عربي (RTL) + إنجليزي، مع دعم **طباعة** و**تصدير CSV/Excel** في كل الصفحات

## 🛠️ التقنيات

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Prisma 7](https://www.prisma.io) + PostgreSQL (Neon)
- [NextAuth v5](https://next-auth.js.org) (Credentials) + bcryptjs
- Tailwind CSS 4 + lucide-react
- Cloudinary (صور الاختبارات) · pdfkit (كشوف الحساب) · zod
- Vitest للاختبارات · ESLint

## 💻 تشغيل محلي

```bash
npm install
cp .env.example .env   # أو عدّل .env: DATABASE_URL / AUTH_SECRET / CLOUDINARY_*
npx prisma generate
npm run dev            # http://localhost:3000
```

### أوامر مهمة

```bash
npm run dev     # سيرفر التطوير
npm run build   # prisma generate + build (ده الـ typecheck)
npm run lint    # eslint
npm test        # vitest
```

> ⚠️ `npm run build` هو التحقق من الأنواع — لازم يلمس قبل أي رفع.

> 💡 بعد أي نشر: `npm run verify:prod` بيتأكد إن النسخة المنشورة فعلًا بترفض
> الأفعال الممنوعة (read-only، مش بيكتب في الداتابيز).

## 🔐 نظام الأدوار والصلاحيات

الصلاحيات **مش مكتوبة بالكود** — المدير العام بيتحكم فيها من
`/settings/roles`. كل صفحة في السيستم (31) وكل إجراء جواها (107) بيتسجلوا
تلقائيًا من الكود نفسه عن طريق سكربت الـ scan، مش مكتوبين بإيد.

```bash
npm run rbac:scan           # scan فقط: بيطبع الصفحات والإجراءات ومفيش drift
npm run rbac:sync           # scan + تحديث جداول Page/Action في الداتابيز
npm run db:seed:rbac            # يملا الأدوار وصلاحياتها المبدئية (idempotent)
npm run db:seed:rbac -- --reset # يرجّع الصلاحيات للافتراضي (بيمسح تعديلات المدير)
npm run verify:rbac             # اختبار حي: دخول كل دور + 403 على الأفعال الممنوعة
npm run verify:matrix           # اختبار حي: تعديل صلاحيات والتأكد إنها اتطبقت فورًا
npm run verify:prod             # نفس الفحوصات على الموقع المنشور (read-only)
```

**الشكل في الداتابيز:** `Role` و `Page` و `Action` و `RolePage` (canView) و
`RoleActionPermission` (isAllowed). `User.role` (الـ enum القديم) لسه موجود
للتوافق، و `User.roleId` هو اللي شغّال.

**القواعد المهمة:**

- **المدير العام محمي.** مش بيتغير اسمه ولا بيتشال، وصلاحياته مش بتقل — الـ API
  بيرفض أي محاولة تعديل (`403`).
- **الزر المخفي مش هو الحماية.** كل endpoint بيعمل تعديل بيتشيك على
  *الإجراء* مش الصفحة بس، فالطلب المباشر من Postman بيرجع `403`.
- **الصفحة مقفولة = كل إجراءاتها مقفولة.** في الماتريكس، لما تطفئ صفحة كل
  الـ switches بتاعتها بتقفل.
- **fallback:** لو `roleId` مش موجود (يوزر قديم)، النظام بيرجع للجدول الثابت
  في `permissions.ts` — عشان ما يحصلش lockout.

**اختبار Regression:** `tests/api/rbac-action-guards.test.ts` بيقرا كل الـ 88
مسار و بيتأكد إن كل POST/PUT/PATCH/DELETE عنده action guard بالاسم الصح — يعني
لو حد أضاف endpoint جديد بدون guard، الاختبار بيفشل.

> ⚠️ في Flake قديم في `get-page-guards.test.ts` (موجود قبل الشغل ده، ومش
> متعلق بيه) — شوف [`docs/TEST-FLAKE-NOTE.md`](docs/TEST-FLAKE-NOTE.md).
> الحله: `npm test -- --no-file-parallelism`.

## 🗂️ أهم المسارات

| المسار | الوصف |
|---|---|
| `src/app/(dashboard)/tests` | صفحة اختبارات العملاء |
| `src/app/api/tests` | قائمة الاختبارات (فلترة وباجينيشن على السيرفر) |
| `src/app/api/customers/[id]/tests` | إنشاء اختبار لعميل |
| `src/lib/permissions.ts` | الأدوار وصفحات كل دور (fallback + نوع `Page`) |
| `src/lib/permissions-server.ts` | حل الصلاحيات من الداتابيز مع كاش |
| `src/app/(dashboard)/settings/roles` | شاشة الأدوار والصلاحيات (للمدير العام فقط) |
| `scripts/scan-permissions.ts` | سكربت الـ scan للصفحات والإجراءات |
| `src/i18n/{ar,en}.json` | كل نصوص الواجهة |
| `.opencode/skills/*` | قواعد المشروع (استايل، صفحات، قواعد عمل) |

## 🚀 النشر (Deploy)

| | |
|---|---|
| مستودع Vercel | [`MomenEllaban/Alex_copier_new`](https://github.com/MomenEllaban/Alex_copier_new) |
| فرع الإنتاج | `main` |
| نطاق الاستضافة | https://alex-copier.vercel.app |
| طريقة النشر | تلقائي — أي `git push` على `main` بيعمل build ونشر (~3 دقايق) |

> ⚠️ **مهم:** لازم الـ push يكون على الريبو `MomenEllaban/Alex_copier_new` (اللي اسمه `new` عندنا محليًا).
> لو اتعمل push على أي ريبو تاني مش هيحصل نشر، لأن مشروع Vercel مربوط بالريبو ده بس.
> الريبو `origin` المحلي (`momendevelopertech/Alex_copier`) بياخد نفس الكوميتات كنسخة احتياطية، بس **مش** بي نشر.

---

## 🗄️ قواعد المايجريشن (لازم تتباع)

> ⚠️ **الـ deploy على Vercel بيشغّل `prisma generate` بس — مش `migrate deploy`.**
> يعني أي migration جديد في `prisma/schema.prisma` **مش** بيوصل لقاعدة بيانات الإنتاج تلقائيًا.
> لو نسيت تشغّلها، الكود هيفشل بـ `P2022: The column "..." does not exist in the current database`
> والصفحات اللي بتعمل `.filter()` على رد الـ API هتبقى بيضاء.

| الخطوة | الأمر |
|---|---|
| 1. بعد ما تضيف أي حقل/جدول/enum في `schema.prisma` | `npx prisma migrate dev --name <اسم>` (بيعمل ملف المايجريشن) |
| 2. **قبل** الـ push — تأكد إن المايجريشن متطبّقة على قاعدة الإنتاج | `npx prisma migrate status` |
| 3. لو المايجريشن اتطبقت بالفعل (أو الـ DB اتعملت بـ `db push` قبل كده) | `npx prisma migrate resolve --applied <اسم_المايجريشن>` |
| 4. اتأكد إن مفيش فرق بين الـ schema والـ DB | `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → لازم يطلع `This is an empty migration.` |

> ℹ️ **تاريخ القاعدة:** قاعدة الإنتاج اتعملت بـ `prisma db push`، يعني جدول `_prisma_migrations` مكانش
> موجود. اتعمله baseline يدوي في 2026-09-26 بـ `migrate resolve --applied` للمهجرين
> `20260906000000_phase1_stock_movement_purchase_order` و `20260925000000_statement_token_expiry`.
> من غير الـ baseline دول، `migrate deploy` كان هيقع عند `already exists`.

