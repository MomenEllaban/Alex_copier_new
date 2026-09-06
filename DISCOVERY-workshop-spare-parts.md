# تقرير فحص استكشافي (Discovery) — صيانة ماكينات التصوير + حركة قطع الغيار

> **الحالة:** فحص فقط، بدون أي تعديل كود أو Migration.
> **الغرض:** فهم الوضع الحالي قبل اتخاذ أي قرار، ربما لإعادة بناء صفحة **الورشة** وصفحة **الأجهزة** ودعم **بيان حركة قطع غيار الورشة** (تاريخ / مهندس / عميل / بيان / طالب / بيع أو استبدال أو مرتجع / القائم بالعمل / استلام ورشة ومَن استلمها).
> **التاريخ:** 2026-09-06

---

## 0) الملخص التنفيذي (أهم النتائج في 8 نقاط)

1. توجد **طبقتان منفصلتان تمامًا** تخصّان قطع الغيار:
   - **المخزون الحقيقي:** `StockMovement` + `WarehouseInventory.quantity` + `Product` — يعمل فعلاً عبر البيع/الشراء/المرتجعات/صفحة المخزون.
   - **عهدة المهندس (`SparePartCustody`) وأعمال الزيارة (`Visit`):** موديلات موجودة في `schema.prisma` وفي الـ seed فقط، لكن **لا يوجد لها أي API route** في كامل `src` — لا إصدار عهدة، لا استهلاك، لا إرجاع، لا زيارة.
2. **الاستهلاك داخل أمر صيانة غير موجود عمليًا.** `CONSUMED` موجود فقط كخيار يدوي في نموذج مخزون؛ لا يرتبط بأمر صيانة ولا بزيارة ولا بمهندس ولا بعميل ولا بماكينة.
3. **أوامر الشراء لا تدخل المخزون أبدًا** (`purchases/route.ts` خالٍ تمامًا من أي تحديث للمخزون). `PURCHASE_IN` يأتي فقط من: إنشاء منتج، استبدال (trade-in)، والنموذج اليدوي.
4. **رصيد القطعة کژملي = عمود واحد** `WarehouseInventory.quantity` يُعدَّل مباشرة عند كل حركة (بدون Trigger في قاعدة البيانات، بدون حساب عند الطلب)، مع سجل `StockMovement` بلا علاقات FK على الطرف الآخر (polymorphic عبر حقل `referenceId` نصّي).
5. **لا يوجد منع شامل للرصيد السالب**: بعض المسارات محمي (المبيعات، الحركة اليدوية، التحويل بين الشركات في مصدره)، وبعضها يخصم أعمى ويمكن أن يسحب تحت الصفر (مرتجع الشراء، عكس مرتجع البيع، عكس استبدال)، وبعضها **يتخطى الخصم بصمت مع استمرار حساب العميل** (التحويل بين الشركات الجهة الهدف).
6. **لا يوجد تمييز فعلي "بيع" مقابل "استهلاك" بمصطلحات العمل** — هناك `SALE_OUT` و`CONSUMED` كقيمتين، لكن "الاستهلاك" بلا أي ربط؛ ولا يوجد مفهوم "استبدال" في بيان حركة الورشة (الاستبدال موجود كـ trade-in في المبيعات فقط).
7. **الحقول المطلوبة لبيان الورشة (تاريخ/مهندس/عميل/بيان/طالب/نوع/مَن استلم/استلام ورشة) غير موجودة** ككل في أي سجل موحد — انظر §10.
8. **صفحة الورشة حاليًا «عرض + إتلاف» فقط**؛ وصفحة الأجهزة لعرض السجل الكامل للحياة؛ وكثير من النصوص الهامة معروض بلغة enum الإنجليزية غير المترجمة، وبعض الفلاتر مبني على مطابقة أسماء شركات عربية بالـ substring.

---

## 1) الموديلات (Models) الموجودة فعلاً والخاصة بالموضوع

ملف السكيما: `prisma/schema.prisma` (1150 سطرًا) — قاعدة PostgreSQL.

### 1.1 `Product` (سطر 412–444) — بطاقة الصنف (كورس/سبير بارت)
| الحقل | النوع | ملاحظة |
|---|---|---|
| `id` | String @id | |
| `name` / `description` | String / String? | |
| `productType` | `ProductType` | `MACHINE` أو `SPARE_PART` |
| `companyId` | FK → Company | |
| `sku` / `gs1Code` / `egsCode` | String? | |
| `purchasePrice` | Float? | **سعر التكلفة** |
| `wholesalePrice` | Float? | سعر جملة (legacy) |
| `retailPrice` | Float? | سعر بيع (legacy) |
| `pricingTiers` | Json? | **6 شرائح أسعار هي الأصل المعمول به اليوم** |
| `isActive` / `isTradeIn` | Boolean | `isTradeIn` يمييّز منتج جاي من استبدال |
| `tradeInValue` | Float? | قيمة الاستبدال |
| `brand` / `condition` | String? | |

التعليقات في السكيما: `machines`, `orderItems` (OrderItems), `tradeInItems` (TradeInItems), `purchaseItems`, `inventoryItems`, `custodies`, `stockMovements`, `returnTransactions`, `sparePartCompatibilities`.

### 1.2 `Warehouse` (519–531) — المستودع
`id, name, companyId (FK), isMain (Bool), createdAt, updatedAt` + علاقات `inventory` / `stockMovements` / `returnTransactions`.

### 1.3 `WarehouseInventory` (533–543) — رصيد صنف في مستودع
`id, warehouseId, productId, quantity (Int, default 0)` مع **`@@unique([warehouseId, productId])`** — هذا هو "رصيد القطعة" الوحيد.

### 1.4 `StockMovement` (545–558) — سجل الحركة
`id, warehouseId (FK), productId (FK), quantity (Int), movementType (enum), referenceId (String?), notes (String?), createdAt, updatedAt`
> **حرج:** `referenceId` نصّ بدون أي relation — polymorphic: قد يشير لفاتورة بيع أو مرتجع أو عهدة... بالتطبيق لا بالداتابيز، و**لا يوجد أي عمود لبضعة مهندس/عميل/ماكينة/أمر صيانة** على الحركة.

### 1.5 `SparePartCustody` (592–607) — عهدة المهندس
`id, engineerId (FK), productId (FK), quantityIssued, quantityUsed, quantityReturned (Int, def 0), status (CustodyStatus), issuedAt (مطلوب يدويًا), visitId (String? بدون relation), createdAt, updatedAt`
> بلا أي API. `visitId` لا relation؛ الرابط بالتطبيق فقط. **لم يُحدَّث أي حقل من حقوله في وقت التشغيل.**

### 1.6 `SparePartCompatibility` (508–517) — توافق قطعة مع موديل
`sparePartId FK→Product, machineModelId FK→Product` + `@@unique([sparePartId, machineModelId])`.

### 1.7 `Machine` (446–474) — الجهاز
`id, serialNumber (@unique), manufacturer?, model?, isColor, paperSize, currentStatus (MachineStatus def IN_WAREHOUSE), purchaseDate?, purchasePrice? (تكلفة الجهاز), salePrice?, saleDate?, notes?, productId? FK→Product, currentOwnerId? FK→Customer, customerLocationId?, ...` مع علاقات `history` / `meterReadings` / `serviceRequests` / `contracts` / `scrapOrder` / `warranty`.

### 1.8 `MachineOwnerHistory` (476–492) — سجل دورة حياة الجهاز
`machineId (FK Cascade), transactionType (TransactionType), customerId?, companyId? (بدون relation), date, financialValue?, notes?, salesOrderId?, contractId?, createdAt...`

### 1.9 `MeterReading` (494–506)
`machineId (FK Cascade), reading (Int), source (ReadingSource), readingDate, visitId? (String? بدون relation), notes?`.

### 1.10 `ServiceRequest` (882–904) — طلب الصيانة (أمر الصيانة)
`id, requestNumber (@unique), customerId (FK Cascade), locationId?, machineId?, description, priority (def NORMAL), status (RequestStatus def NEW), engineerId? FK→Engineer, companyId (String؟ بدون relation), customerRating?, ratingNotes?` + `problems` / `visits`.
> الطلب يعرف العميل والجهاز والمهندس — لكن **لا يعرف أي قطع غيار**.

### 1.11 `Visit` (916–932) — الزيارة
`id, serviceRequestId (FK Cascade), engineerId (FK Cascade), contractId?, visitedAt, resolved, resolutionNotes?, partsUsed (String? — نص حر وليس علاقة), meterReadingId (String? بدون relation)`.
> **لا يوجد API يسمح بإنشاء الزيارة** في كامل `src` (فقط seed). `partsUsed` نص حر لا يخصم من المخزون.

### 1.12 `ReturnTransaction` (560–590) — المرتجع
`id, companyId (FK), type (ReturnType: SALE_RETURN/PURCHASE_RETURN), salesOrderId?/salesOrderItemId?, purchaseOrderId?/purchaseOrderItemId?, priceTier? (String), warehouseId?, customerId?, supplierId?, productId (FK Cascade), quantity, unitPrice, total, reason? (نص حر), status (ReturnStatus def PENDING), ...`

### 1.13 `SalesOrder` / `SalesOrderItem` (762–824)
- الطلب: `customerId, engineerId?, orderType (OrderType: MACHINE_SALE/SPARE_PART_SALE), paymentMethod, status (def CONFIRMED), total, tradeInTotal (def 0), ...` + `items / installments / returns`.
- البند: `productId FK, quantity, unitPrice, discount, tradeInProductId? FK→Product (stTadeInItems), tradeInValue`.
> البيع هو الطريق الوحيد الذي **يخصم الرصيد ويسجل SALE_OUT** بجانب إنشائه.

### 1.14 `PurchaseOrder` / `PurchaseOrderItem` (620–672)
`PurchaseOrder{ supplierId, status (PurchaseOrderStatus def DRAFT), total, orderDate }` / `Item{ productId, quantity, unitPrice }`.
> كائن الشراء **لا يخصم/يضيف مخزون**؛ مفصول تمامًا عن المخزون.

### 1.15 اخرى ذات صلة: `Contract`(826) / `ContractMachine`(850) / `Engineer`(254) / `EngineerSalary`(1132) / `Warranty`(1094) / `ScrapOrder`(944) / `ProblemDetail`(906)

### 1.16 رابط مختصر: حقول FK «نصّية بلا Relation» في كل السكيما (أخطاء تصميم مؤجلة)
`StockMovement.referenceId`، `SparePartCustody.visitId`، `MeterReading.visitId`، `Visit.meterReadingId`، `ServiceRequest.companyId`، `MachineOwnerHistory.companyId/salesOrderId/contractId`، `PurchaseInvoice.companyId`، `ScrapOrder.approvedBy`، `InterCompanyInvoice.purchaseOrderId/salesOrderId`، `Visit.partsUsed`.

---

## 2) أنواع الحركة المعرّفة (بالظبط، كما في الكود)

### 2.1 `StockMovementType` (سطر 392–402) — 11 قيمة (أنواع حركة المخزون)
```
PURCHASE_IN, INTER_COMPANY_IN, INTER_COMPANY_OUT, SALE_OUT,
SALE_RETURN_IN, PURCHASE_RETURN_OUT, ENGINEER_CUSTODY_OUT,
ENGINEER_RETURN, CONSUMED, SCRAP, ADJUSTMENT
```

### 2.2 الحالات الأخرى ذات الصلة
- `MachineStatus`: `SOLD, RENTED, IN_WAREHOUSE, UNDER_MAINTENANCE, UNDER_INSPECTION, SCRAPPED`
- `ReturnType`: `SALE_RETURN, PURCHASE_RETURN`
- `ReturnStatus`: `PENDING, APPROVED, REJECTED, COMPLETED`
- `CustodyStatus`: `ISSUED, PARTIALLY_USED, FULLY_USED, RETURNED`
- `RequestStatus`: `NEW, ASSIGNED, VISITED, RESOLVED, NOT_RESOLVED, REASSIGNED, CLOSED`
- `TransactionType` (سجل حياة الجهاز): `SALE, RENTAL, RETURN, TRADE_IN, TRANSFER, MAINTENANCE, SCRAP`
- `ProductType`: `MACHINE, SPARE_PART`

### 2.3 أين كُتبت كل حركة في الكود فعلاً (المسارات الحقيقية الوحيدة)
| النوع | مكان الكتابة %100 في الكود | التوضيح |
|---|---|---|
| `PURCHASE_IN` | `products/route.ts:163-177` (إدخال أولي) • `sales/route.ts:245-263` و`sales/[id]/route.ts:345-359` (استبدال trade-in) | **أوامر الشراء لا تولدها أبدًا** |
| `SALE_OUT` | `sales/route.ts:279-290` • `sales/[id]/route.ts:373-384` • `intercompany/route.ts:257-266` • `intercompany/[id]/route.ts:344-353` | خصم الرصيد + بند للعميل |
| `INTER_COMPANY_IN/OUT` | `sales/intercompany/route.ts:201-243` • `intercompany/[id]/route.ts:285-330` | تحويل بين مستودعي شركتين |
| `SALE_RETURN_IN` | `returns/route.ts:156-173` • `returns/[id]/route.ts:122-139` | مرتجع بيع → يدخل المخزون |
| `PURCHASE_RETURN_OUT` | `returns/route.ts:308-325` • `returns/[id]/route.ts:151-168` | مرتجع شراء → يخرج للمورد |
| `ADJUSTMENT` | `products/[id]/route.ts:157-171` • `returns/[id]/route.ts:73-82, 258-267` | تسوية / عكس مرتجع |
| `ENGINEER_CUSTODY_OUT / ENGINEER_RETURN` | **لا يوجد كتابة فعلية في أي API** | فقط labels في UI + `ENGINEER_RETURN` يُعامل incoming في `inventory/route.ts:44` |
| `CONSUMED` | `inventory/route.ts:44-68` (النموذج اليدوي فقط) | خصم بلا ربط بأي كيان |
| `SCRAP` | **لا يُكتب أبدًا في المخزون** (إتلاف بتغيير حالة الجهاز فقط في `workshop/*/scrap/route.ts:43-51`) | الخيار موجود في النموذج اليدوي لكنه فقط يخصم كـ outward |

### 2.4 الخلاصة
- المخزون لديه **11 نوع حركة** لكن **المخاطب الفعلي منها 9** في أفضل الحالات، و3 منها (`ENGINEER_CUSTODY_OUT`, `ENGINEER_RETURN`, `SCRAP`) بدون مسار حقيقي له أي أثر إلا التسجيل اليدوي بصيغة "صادر/وارد".
- لا يوجد `TRANSFER/MAINTENANCE` في الـ StockMovement (كلها في `TransactionType` الخاص بتاريخ الجهاز فقط).

---

## 3) هل هناك تفرقة فعلية بين «بيع» و«استهلاك»؟

- **في التصميم:** نعم — قيمتان منفصلتان `SALE_OUT` (بيع، مربوط بفاتورة، يخصم من الرصيد، يتحرك عند إنشاء/تعديل/حذف الفاتورة) و`CONSUMED` (استهلاك).
- **في التنفيذ:** **شبه معدومة.** لا يوجد أي مسار يربط الاستهلاك بأمر صيانة. `CONSUMED` يُنشأ فقط من النموذج اليدوي في صفحة المخزون (`inventory/page.tsx:184-234` → `POST /api/inventory`) بحقول: مستودع، منتج، كمية، نوع حركة، ملاحظات — **بلا مهندس، بلا عميل، بلا ماكينة، بلا أمر صيانة**، وبلا ربط رصيدي بعهدة المهندس.
- «الاستبدال» (trade-in) مفهوم في موديول البيع فقط (بنود سطرية `tradeInValue` + منتج `isTradeIn` + `tradeInTotal`) — **ليس له وجود في بيان الورشة**.

---

## 4) كيف يُحسب رصيد القطعة حاليًا؟

- **المصدر الوحيد:** `WarehouseInventory.quantity` (عمود مباشر). لا يوجد Trigger ولا دالة تجميع عند الطلب — كل نقرة تعدّل العمود مباشرة ثم تسجّل الحركة في `StockMovement`.
- الأمثلة: شراء `products/route.ts:163-167` (upsert SET عدد)، بيع `sales/route.ts:149-152` (decrement)، مرتجع `returns/route.ts:158-162` (increment)، حركة يدوية `inventory/route.ts:57-68` (increment/decrement).
- الملاحظة: صفحة المخزون تعرض فقط `inventory` من `GET /api/inventory` (من تجاوب المجموع عبر الـ inventory map) — بلا ترّاکم تاريخي مقروء في الصفحة؛ سجل الحركات يظهر فقط في `GET /api/warehouses/[id]/inventory` (آخر 200 صف لمستودع واحد).

---

## 5) هل توجد صلة بين حركة القطعة وأمر الصيانة؟

**لا — لا توجد صلة حقيقية:**
- `StockMovement` لا يحمل أي عمود `serviceRequestId/visitId/customerId/engineerId/machineId`.
- `StockMovement.referenceId` نصّي يمكن تشغيله على أي معرّف، لكن **لا يوجد كود يقصد به أمر صيانة**.
- `Visit` لم تُنشأ قط في أي API؛ `partsUsed` خانة نصية.
- `SparePartCustody.visitId` يربط العهدة بالزيارة بالتطبيق — لكن لا يوجد API يملأ هذا الحقل أصلًا.
- الخلاصة: **السلسلة "أمر صيانة → زيارة → قطع مستهلكة/مُرجعـة → خصم/إضافة رصيد" غير موصولة نهائيًا في الكود**؛ الشكل الموجود مبني فقط في السكيما والـ seed.

---

## 6) سعر التكلفة وسعر البيع — منفصلان؟

- **الملفات في التصميم نعم:** `Product.purchasePrice` (تكلفة) مقابل `retailPrice/wholesalePrice`.
- **الواقع:** صفحة المنتجات تدخل وتعرض **الـ 6 شرائح أسعار فقط** عبر `pricingTiers` (Json):
  `legacyCustomer (عميل قديم), newCustomer (عميل جديد), jumlaMachines (شركة جملة آلات), jumlaParts (شركة جملة قطع غيار), sectori (قطاعي), engineer (مهندس)`.
- `wholesalePrice/retailPrice` تظهر فقط في نافذة العرض كاشتقاق من الشرائح (`products/page.tsx:379,383`)، لكن **صفحة المبيعات** ترجع إليهما كـ fallback في `getProductTierPrice` (`sales/page.tsx:111-117`). → **مصدران للحقيقة** يمكن أن يتعارضا.
- على الجهاز `Machine.purchasePrice/salePrice` سعره الخاص المستقل.

---

## 7) منع الرصيد السالب — الوضع الحالي بدقة (بالأماكن)

### محمي بشكل صحيح (فحص الكمية قبل الخصم)
- `inventory/route.ts:50` (الحركة اليدوية العامة)
- `sales/route.ts:146` (إنشاء الفاتورة)
- `sales/[id]/route.ts:223` (تعديل الفاتورة)
- `sales/intercompany/route.ts:202` (تحويل بين الشركات — الجهة المصدرة)
- `sales/intercompany/[id]/route.ts:290` (نفس الشيء في التعديل)

### خصم «أعمى» يمكن أن يسحب تحت الصفر (لا فحص)
- مرتجع الشراء: `returns/route.ts:310-314` و`returns/[id]/route.ts:153-157` (decrement بدون فحص؛ وفي غياب صف الرصيد يُنشأ صفًا جديدًا صفر!).
- عكس مرتجع (REJECT/DELETE): `returns/[id]/route.ts:66-71, 251-256` (increment بقيمة سالبة).
- عكس استبدال trade-in عند تعديل/حذف البيع: `sales/[id]/route.ts:169-175, 512-518`.

### مشكلة أخطر (تخطٍّ بصمت مع حساب العميل)
- التحويل بين شركات الطرف الهدف: `sales/intercompany/route.ts:251` و`intercompany/[id]/route.ts:338` — إن لم تكفِ الكمية **يتخطى الخصم لكن يسجّل SALE_OUT ويُحصّل العميل**.
- ولو لم يوجد `warehouse isMain` مرسل للشركة، يُنشأ البيع **بلا أي خصم مخزون ومتابعة حركة** (`sales/route.ts:140-154`).

---

## 8) الفني/المهندس المسؤول عن الحركة؟

- يوجد `Engineer` كامل (خطة، منطقة، مهارات، مرتب، عهدة، زيارة، مبيعات، تسويات) وقائمة بمساعدتها للإدارة.
- **لكن لا يوجد حقل `engineerId` على `StockMovement`** ولا على `ReturnTransaction` ولا على `WarehouseInventory`. المهندس "المرتبط" بالحركة يظهر فقط عبر طرف آخر غير مباشر (مثل فاتورة بيع بمرجع engineering أو زيارة/عهدة لا API لها).

---

## 9) تسجيل سبب المرتجع / مَن رجّعه؟

- `ReturnTransaction.reason` نص حر (يملأه المستخدم في `POST /api/returns` ويمكن تعديله بـ `PUT`).
- يُسجَّل لداخل المرتجع: العميل (`customerId`) أو المورد (`supplierId`) + `type` (بيع/شراء) + `status` + مراجع الفاتورة/الأمر.
- **مفقود:** تمييز «مرتجع فني لم يُستخدم» (بدون فاتورة بيع/شراء) — كل إنشاء مرتجع يتطلب فاتورة أو أمر شراء (`returns/route.ts:104-122, 255-273`)، فلا يوجد مسار مرتجع داخلي من الورشة/المهندس إلى المخزن.
- **مفقود:** من استلم المرتجع/من أنشأه (لا حقل مستخدم/فني على المرتجع).
- ملاحظة: الإنشاء يتيح `APPROVED` مباشرة (لا عملية موافقة فعلية؛ مسار PENDING→APPROVED في `returns/[id]/route.ts` شبه ميت).

---

## 10) «بيان حركة قطع غيار الورشة» المطلوب — خريطة الحقول المطلوبة مقابل الواقع

| الحقل المطلوب في البيان | هل موجود؟ | أين / كيف؟ | ملاحظة الفجوة |
|---|---|---|---|
| **التاريخ** | ✅ جزئي | `StockMovement.createdAt` (التاريخ الكامل) وفي `MachineOwnerHistory.date`/`Visit.visitedAt` | التاريخ موجود كحقل لكن لا توجد شاشة تقرير تجمعه |
| **المهندس** | ⚠️ جزئي | على فاتورة بيع `SalesOrder.engineerId` وعلى عهدة/زيارة (بلا API) | **مفقود على `StockMovement` و`ReturnTransaction`** |
| **العميل** | ⚠️ جزئي | على الفاتورة/المرتجع/أمر الصيانة | **مفقود على `StockMovement`** — الحركة المفردة لا تعرف صاحبها |
| **البيان (الوصف/الملاحظة)** | ✅ | `StockMovement.notes` / `ReturnTransaction.reason` | كخذة نصية |
| **الطالب (مَن طلب القطعة)** | ❌ | غير موجود إطلاقًا | لا حقل `requestedBy` على أي كيان |
| **النوع: بيع / استبدال / مرتجع** | ⚠️ جزئي | بيع=`SALE_OUT`، مرتجع=`SALE_RETURN_IN/PURCHASE_RETURN_OUT`، استبدال=`trade-in` موجود لكن غير مرئي في بيان الورشة | مبسط بـ «صادر/وارد» في الواجهة؛ لا تمييز "استبدال" في الحركة |
| **القائم بالعمل (مَن نفّذ)** | ❌ | غير موجود | لا حقل `performedBy`/`doneBy` على الحركة |
| **استلام الورشة (دخول الجهاز للورشة)** | ⚠️ نصفي | حالة الجهاز `UNDER_INSPECTION/UNDER_MAINTENANCE` تُعدّل يدويًا من `machines/[id]` PUT | **بلا تسجيل**: مَن استلم، ومتى، ومن مخزن/عميل، ولا سجل تاريخي (`MachineOwnerHistory` غير مُحدَّث عند تغيير الحالة) |
| **مَن استلم الجهاز في الورشة** | ❌ | غير موجود | لا حقل `receivedBy` |

> الخلاصة: البيان المطلوب **غير موجود كتقرير**، وأجزاء البيانات اللازمة إما ناقصة على كيان الحركة أو غير مترابطة.

---

## 11) الوضع الحالي لصفحات الواجهة (ما يظهر للمستخدم الآن)

### 11.1 صفحة الورشة `workshop/page.tsx` (247 سطرًا)
- `GET /api/workshop` → يرد فقط بالآلات التي `currentStatus ∈ {UNDER_INSPECTION, UNDER_MAINTENANCE}` (`workshop/route.ts:11`).
- الأعمدة: الرقم التسلسلي، الشركة المصنعة، الطراز، الحالة، تاريخ الشراء، ملاحظات، **أمر تلف** (الزر الوحيد).
- `POST /api/workshop/[machineId]/scrap` → ينشئ `ScrapOrder` ويُحوّل الحالة إلى `SCRAPPED`.
- **مربكات:**
  - فلتر الحالة يعرض كل الحالات (مباع/مؤجر/مستودع...) بينما الـ API لا يعيدها أبدًا — خيارات ميتة.
  - لا يوجد أي شكل من أشكال نقل الجهاز إلى الورشة من هذه الشاشة، ولا استلام، ولا قطع غيار، ولا عهد، ولا طلبات صيانة.
  - زر/شريحة "عهدة قطع الغيار" موجود في ملفات الترجمة (`workshop.sparePartCustody`) **بلا أي UI**.

### 11.2 صفحة الأجهزة `machines/page.tsx` (471 سطرًا)
- القائمة + إضافة/تعديل/حذف/استيراد مع نافذة **سجل دورة الحياة**: مالك حالي، ضمان، عقود، عدادات مطبوعة، طلبات خدمة، نطاق زمني.
- `GET /api/machines/[id]` يجلب للتفاصيل: `meterReadings, history, contracts, serviceRequests, warranty, customerLocation`.
- الحقول في الفورم: رقم تسلسلي، مصنّع، طراز، ملون، حجم ورق، تاريخ وسعر الشراء، **المالك الحالي** (بدون مالك)، ملاحظات.
- **مربكات:**
  - `contract.status` و`request.status` تُعرض بـ **الإنجليزية الخام** في النافذة (`machines/page.tsx:425,433`) — غير مترجمة.
  - لا يوجد حقل "استلام ورشة" ولا سجل مَن غيّر الحالة؛ تغيير الحالة من الفورم ليس له أثر تاريخي.
  - عمود "تاريخ" يعرض `createdAt` وليس تاريخ البيع/الشراء الضروري.
  - إشارة "الرقم الحالي للعداد" من آخر قراءة — لكن لا توجد إضافة قراءة من الشاشة (فقط عبر طلبات الخدمة/المراجعات اليدوية المحلية).

### 11.3 صفحة المخزون `inventory/page.tsx` (309 سطرًا)
- جدول الرصيد (منتج/مستودع/كمية) + نموذج **حركة يدوية** (+9 من 11 نوع، والـ `SALE_RETURN_IN` غير معروض مع أن الـ API يقبله).
- **مستند غريب:** فلتر الشركة مبني على **substring لأسماء عربية** (`شركة جملة الآلات`=جملة+آلات، ...) — إذا اختلفت أسماء الشركات الفعلية يُرجع فارغًا بصمت.
- خلاية الألوان: المستودع >10 اخضر/>0 amber/0 rose، بينما المنتجات >0/0 — تباين بلا مبرر.

### 11.4 صفحة المنتجات `products/page.tsx` (461 سطرًا)
- جدول: اسم، نوع، شركة، SKU، **سعر الشراء**، الكمية المتاحة، الحالة (نشط/غير نشط).
- الفورم: النوع (ماكينة/قطعة غيار)، الشركة، SKU/EGS، **سعر الشراء + الكمية الأولية**، **6 شرائح أسعار البيع**.
- **مربكات:** `wholesalePrice/retailPrice` بها مصادر مزدوجة وتختلف عن الشرائح.

### 11.5 صفحات أخرى مهمة
- `warehouses/page.tsx` (493 سطرًا): إدارة المستودعات + نافذة تفاصيل (أصناف + حركات) — أفضل عرض للحركات، لكن `isIncoming` فيها ينقص `SALE_RETURN_IN` مقابل الـ API (`warehouses/page.tsx:73-75`).
- `service-requests/page.tsx` (474 سطرًا): إدارة الطلبات بالحالات، **بدون أي قطع غيار** (لا استهلاك/عهدة من هذه الشاشة).
- `engineers`/تقارير المهندس: كشف حساب **مالي** فقط، و"عهد قطع الغيار" مجرد عداد `SparePartCustody` في البيان العام (`engineer-statement.ts:368-372`).

---

## 12) أسئلة تحتاج ردًّا صريحًا منك (تستثمر القرارات)

1. **الاستهلاك** — هل يُسمح بالاستهلاك بدون «أمر صيانة» مربوط؟ (مثال: تخزين/تصليح داخلي بلا طلب عميل) أم كل استهلاك يجب أن يتبع `ServiceRequest`؟
2. **ربط الحركة** — عند تسجيل أي حركة قطع غيار تريد ربطها كاملةً بـ: (العميل، الجهاز، أمر الصيانة، المهندس، الطالب، مَن نفّذ) — هل كلها إلزامية أم الخيارية؟ ما الحقل الذي يجب ألا يكون فارغًا أبدًا؟
3. **نوع الحركة المطلوب في الورشة** — هل الأربعة لك هي بالضبط: **استلام (إدخال رصيد) — بيع (خصم برصيد وفاتورة) — استهلاك (خصم داخل أمر صيانة) — مرتجع (إضافة رصيد)**؟ (انتبه: "استلام" عندك يعني إدخال مخزون جديد، أو استلام جهاز في الورشة؟)
4. **رصيد موحد أو مفرّق** — هل رصيد كل قطعة رصيد واحد مشترك بين كل الشركات/المستودعات، أم لكل شركة/مستودع رصيده؟ (الموديل الحالي: رصيد لكل `[مستودع, صنف]`.) هل "بيع قطعة لأكثر من جهة مع وصول رصيد سالب" مقبول؟
5. **المرتجع** — هل المرتجع قد يكون:
   - من عميل (مرتجع بيع بعد فاتورة)؛
   - من فني لم يُستخدم (مرتجع داخلي بلا فاتورة)؛
   - للمورد الخارجي (كما يوجد الآن)
   وهل يجب تمييزها في الشاشة والحسابات؟
6. **الاستبدال** — عندك استبدال لجهاز قديم مقابل جهاز/قطعة جديدة: هل يظهر كصف في بيان الورشة (مثل "بيع / استبدال / مرتجع") وهل يخصم المنتج الجديد ويدخل القديم برصيد مخزون؟ (الموجود الآن: يعامل كـ trade-in داخل المبيعات.)
7. **التسعير** — التسعير لكل قطعة ثابت؟ أم حسب شريحة العميل (الـ 6 شرائح الحالية)؟ أم حسب كل فاتورة يحددها البائع يدويًا؟ وهل تريد تكلفة + هامش احتياطي على الشاشة؟
8. **استلام الورشة** — عند دخول جهاز للورشة: هل نحتاج سجلًا صريحًا "استلم X الجهاز من Y في التاريخ D، بسبب Z (عطل تجربة/ضمان/إعاره/بيع)؟" وهل يجب أن يعاد تلقائيًا إلى مالكه/حالته بعد الانتهاء؟
9. **الطالب** — "الطالب" في بيانك يعني مَن طلب القطعة من الورشة؟ أهو فني أم مستخدم أم عميل؟ وهل يجب ربطه بكيان في النظام (مستخدم/مهندس/عميل) أم نص حر؟
10. **بيان الورشة التقرير** — هل تريد صفحة/تقرير "بيان حركة قطع غيار الورشة" (بتقنية تصفية تاريخ + مهندس + عميل + نوع) مطبوع/CSV؟ وما الحقول التي تظهر في البيان بالترتيب الدقيق عند الشركة؟
11. **أنواع حركة إضافية** — هل هناك حركات «تحويل/نقل» بين الورشة والمستودع، أو «إصلاح قطعة» لا تغير المخزون، يجب تمثيلها بصورة منفصلة؟
12. **العهد (السلفة) للمهندس** — هل تريد استعادة موديول كامل: إصدار عهدة لمهندس (خصم رصيد) → استخدام أو إرجاع (إضافة رصيد)، بما فيها حالة `PARTIALLY_USED`؟ وأين تظهر في الواجهة؟
13. **الأجهزة — تعريف "استلام"** — في صفحة الأجهزة: هل تريد تفعيل «استلام جهاز في الورشة» كزر يغيّر الحالة وينشئ سجل تاريخي (مَن ومتى)، مع إمكانية عكسه؟

---

## 13) جدول الفجوات مرتبة بالأولوية

### 🔴 أولوية قصوى — أخطاء محتملة في المخزون/الحسابات (لو تُرك للوضع الحالي)
| # | الفجوة | الموقع | الأثر |
|---|---|---|---|
| 1 | **التحويل بين الشركات: الطرف الهدف يتخطى خصم الرصيد بصمت مع تحصيل العميل** | `sales/intercompany/route.ts:251`، `intercompany/[id]/route.ts:338` | خسارة مالية + رصيد خاطئ |
| 2 | **أوامر الشراء لا تدخل المخزون أصلاً** (`PURCHASE_IN` لا يربط بـ purchaseOrder) | `purchases/route.ts` | الرصيد ناقص بمشتريات كاملة |
| 3 | **مرتجع الشراء يخصم أعمى ويمكن أن يسحب تحت الصفر + إنشاء صف رصيد صفر بدل الخصم** | `returns/route.ts:310-314`، `returns/[id]/route.ts:153-157` | رصيد سالب غير مشروط |
| 4 | **عكس المرتجعات/الاستبدال عند الإلغاء يمكن أن يسقط الرصيد في السالب** | `returns/[id]/route.ts:66-71,251-256`، `sales/[id]/route.ts:169-175,512-518` | رصيد سالب |
| 5 | **لا يوجد أي حقل لمنع الفروقات: `StockMovement` بلا `customerId/engineerId/machineId/serviceRequestId`** وشىء الـ `referenceId` النصي | `StockMovement` كامل؛ مواضع create في §2.3 | يستحيل إنتاج بيان قطع غيار دقيق |
| 6 | **بيع بدون مستودع `isMain` يمرّ بلا أي خصم** (`if (warehouse)`) | `sales/route.ts:140-154` | رصيد لا يتأثر بالمبيع |

### 🟠 أولوية متوسطة — متطلبات الميزة مفقودة
| # | الفجوة | الوضع الحالي |
|---|---|---|
| 7 | **لا يوجد مسار "استهلاك داخل أمر صيانة"** (`CONSUMED` بلا ربط بـ ServiceRequest/Visit/مهندس/عميل/جهاز) | موجودة فقط كنموذج يدوي |
| 8 | **عهدة المهندس (`SparePartCustody`) بلا أي API ولا تحديث للرصيد** — `quantityUsed/quantityReturned/visitId` لا تتغير أبدًا | model + seed فقط |
| 9 | **زيارة (`Visit`) بلا API**؛ النشاط الحقيقي لا يُسجل؛ `partsUsed` نص حر | model + seed فقط |
| 10 | **لا يوجد «استلام ورشة» مسجل (مَن استلم، متى، من أين، لماذا)** — تغيير حالة الجهاز بلا سجل تاريخي | `machines/[id] PUT` يغيّر `currentStatus` بلا `MachineOwnerHistory` |
| 11 | **لا يوجد «بيان حركة قطع غيار الورشة»** (لا endpoint ولا صفحة) | تظهر الحركات فقط في `warehouses/[id]/inventory` (آخر 200 صف) |
| 12 | **لا يوجد تمييز «مرتجع فني لم يُستخدم»** — كل مرتجع يتطلب فاتورة/أمر شراء | `returns/route.ts` |
| 13 | **لا تقرير قائماً حسب التاريخ/المهندس/العميل/النوع للحركات** | مخصّصات التقرير لا تغطي الحركات (`reports/route.ts` يوفّر sparePartMatrix فقط) |

### 🟡 تحسينات واجهة/اتساق
| # | التحسين | الموضع |
|---|---|---|
| 14 | ترجمة `contract.status` و`request.status` إلى العربية في نافذة الأجهزة | `machines/page.tsx:425,433` |
| 15 | فلتر الحالة في الورشة يعرض حالات لا تظهر بالـ API؛ + فلتر شركة المخزون يعتمد على substring عربي هش | `workshop/page.tsx:39-46`، `inventory/page.tsx:76-82,250-256` |
| 16 | اختلاف مصدرين للأسعار (`pricingTiers` vs `retailPrice/wholesalePrice`) | `products/page.tsx` + `sales/page.tsx:111-117` |
| 17 | توحيد خلاية ألوان الكمية بين الصفحات؛ وإضافة `SALE_RETURN_IN` لقائمة الـ UI | `inventory/page.tsx:288`، `warehouses/page.tsx:73-75` |
| 18 | `isIncoming` غير متسق بين الصفحة والـ API (`SALE_RETURN_IN`) | `warehouses/page.tsx:73-75` vs `inventory/route.ts:44` |

---

## 14) ما المطلوب منك الآن

1. **الرد على أسئلة §12** (حتى نقف بدقة على النموذج المطلوب: الحركات الأربعة، ربط الاستهلاك بأمر الصيانة، المرتجع الداخلي، استلام الورشة، البيع/الاستبدال/المرتجع في البيان، التسعير).
2. **تحديد نطاق التغيير**: هل نبدأ بإغلاق فجوات 🔴 (أمان المخزون) أم نبني أولاً صفحة الورشة + البيان (الفجوات 🟠) ؟
3. **موافقة صريحة على الخطة** (نموذج بيانات جديد / تعديلات علاقات / صفحات جديدة) — عندها فقط أبدأ التنفيذ.

✋ **لم يتم تعديل أي كود في هذه المرحلة** — هذا التقرير مجرد فحص لاتخاذ القرار.