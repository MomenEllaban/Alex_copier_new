/**
 * Single source of truth for user-facing error messages.
 * Plain data (no Next.js / React imports) so both the API layer and the browser
 * can use it. Arabic is the primary language; English is always included.
 */

export type ErrorDefinition = {
  ar: string;
  en: string;
  status: number;
  hintAr?: string;
  hintEn?: string;
};

export const ERROR_CATALOG: Record<string, ErrorDefinition> = {
  INTERNAL_ERROR: {
    ar: "حدث خطأ غير متوقع أثناء تنفيذ العملية. لم يتم حفظ أي تغييرات.",
    en: "An unexpected error occurred. No changes were saved.",
    status: 500,
    hintAr: "أعد المحاولة. لو استمر الخطأ، اضغط «تفاصيل الخطأ» وأرسل البلاغ.",
    hintEn: "Please retry. If it persists, open 'Error details' and send the report.",
  },
  UNAUTHORIZED: {
    ar: "انتهت جلستك أو لم تسجل الدخول. سجل الدخول ثم أعد المحاولة.",
    en: "Your session expired or you are not signed in. Please sign in and retry.",
    status: 401,
    hintAr: "افتح صفحة الدخول ثم أدخل بياناتك مرة أخرى.",
    hintEn: "Open the login page and enter your credentials again.",
  },
  FORBIDDEN: {
    ar: "لا تملك صلاحية تنفيذ هذه العملية. راجع الأدوار والصلاحيات أو تواصل مع المدير العام.",
    en: "You do not have permission to perform this action. Check your role or contact the general manager.",
    status: 403,
    hintAr: "الصلاحية مرفوضة من السيرفر — تعديل الواجهة لا يمنح صلاحية.",
    hintEn: "The server denied the action — hiding a button never grants access.",
  },
  NOT_FOUND: {
    ar: "السجل المطلوب غير موجود. ربما تم حذفه أو تغير رقمه.",
    en: "The requested record no longer exists. It may have been deleted or renamed.",
    status: 404,
  },
  VALIDATION_FAILED: {
    ar: "بعض البيانات المدخلة غير صحيحة أو ناقصة. راجع الحقول المشار إليها.",
    en: "Some entered values are invalid or missing. Check the highlighted fields.",
    status: 400,
  },
  CONFLICT: {
    ar: "العملية تتعارض مع بيانات حالية. راجع التغييرات ثم أعد المحاولة.",
    en: "This action conflicts with existing data. Review the changes and retry.",
    status: 409,
  },
  RATE_LIMITED: {
    ar: "محاولات كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة.",
    en: "Too many attempts in a short time. Wait a moment and retry.",
    status: 429,
  },
  NETWORK_ERROR: {
    ar: "تعذر الاتصال بالخادم. تأكد من الإنترنت ثم أعد المحاولة.",
    en: "Could not reach the server. Check your connection and retry.",
    status: 0,
    hintAr: "إذا كنت تستخدم شبكة عامة، جرب شبكة أخرى.",
    hintEn: "If you are on a public network, try another one.",
  },

  // ---- Prisma / database ----
  P2002: {
    ar: "القيمة التي أدخلتها مستخدمة بالفعل (تكرار في حقل فريد). استخدم قيمة مختلفة.",
    en: "The value you entered is already in use (duplicate unique field). Use a different value.",
    status: 409,
    hintAr: "غالباً الاسم أو البريد الإلكتروني أو الكود مكرر.",
    hintEn: "Usually the name, email or code is duplicated.",
  },
  P2025: {
    ar: "السجل المطلوب غير موجود في قاعدة البيانات. حدّث الصفحة ثم أعد المحاولة.",
    en: "The requested record does not exist in the database. Refresh and retry.",
    status: 404,
  },
  P2003: {
    ar: "لا يمكن حفظ العملية لأن السجل مرتبط ببيانات أخرى. احذف التبعيات أولاً.",
    en: "The record is referenced by other data and cannot be changed. Remove the dependencies first.",
    status: 409,
  },
  P2034: {
    ar: "تعذر حفظ العملية بسبب تعديل متزامن من مستخدم آخر. أعد المحاولة.",
    en: "The operation conflicted with another concurrent change. Please retry.",
    status: 409,
  },
  P2024: {
    ar: "استغرق الاتصال بقاعدة البيانات وقتاً أطول من المتوقع. أعد المحاولة بعد لحظات.",
    en: "The database took too long to respond. Retry in a moment.",
    status: 504,
  },

  // ---- Auth / RBAC ----
  INVALID_CREDENTIALS: {
    ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    en: "The email or password is incorrect.",
    status: 401,
  },
  ACCOUNT_INACTIVE: {
    ar: "هذا الحساب موقوف. تواصل مع المدير العام لتفعيله.",
    en: "This account is inactive. Contact the general manager to reactivate it.",
    status: 403,
  },
  CROSS_COMPANY: {
    ar: "هذه البيانات تخص شركة أخرى وليس لديك صلاحية الاطلاع عليها.",
    en: "This data belongs to another company and you are not allowed to view it.",
    status: 403,
  },

  // ---- Sales / purchases / stock ----
  SALE_FIELDS_REQUIRED: {
    ar: "بيانات الفاتورة غير مكتملة: الشركة والعميل وطريقة الدفع وبند واحد على الأقل مطلوبة.",
    en: "Invoice data is incomplete: company, customer, payment method and at least one line are required.",
    status: 400,
  },
  INVALID_SALE_ITEMS: {
    ar: "أحد بنود الفاتورة غير صالح: اختر صنفاً وكمية صحيحة وسعراً.",
    en: "An invoice line is invalid: choose a product, a positive quantity and a price.",
    status: 400,
  },
  INVALID_TRADE_IN_ITEMS: {
    ar: "أحد الأصناف المستبدلة غير صالح: الاسم والكمية والقيمة مطلوبة والكمية يجب أن تكون عدداً صحيحاً.",
    en: "A returned item is invalid: name, quantity and value are required; quantity must be a whole number.",
    status: 400,
  },
  INVALID_PAYMENT_METHOD: {
    ar: "طريقة الدفع غير صالحة. اختر كاش أو أجل.",
    en: "Invalid payment method. Choose cash or credit.",
    status: 400,
  },
  INVALID_ORDER_DATE: {
    ar: "تاريخ الفاتورة غير صالح. اختر تاريخاً صحيحاً.",
    en: "The invoice date is invalid. Choose a valid date.",
    status: 400,
  },
  COMPANY_NOT_FOUND: { ar: "الشركة المختارة غير موجودة. حدّث القائمة واختر شركة أخرى.", en: "The selected company no longer exists. Refresh and choose another.", status: 400 },
  CUSTOMER_NOT_FOUND: { ar: "العميل المختار غير موجود. حدّث القائمة واختر عميلاً آخر.", en: "The selected customer no longer exists. Refresh and choose another.", status: 400 },
  PRODUCT_NOT_FOUND: { ar: "أحد الأصناف المختارة غير موجود في سجل المنتجات.", en: "One of the selected products is missing from the catalogue.", status: 400 },
  ENGINEER_NOT_FOUND: { ar: "المهندس المختار غير موجود.", en: "The selected engineer does not exist.", status: 400 },
  NO_MAIN_WAREHOUSE: {
    ar: "لا يوجد مستودع رئيسي لهذه الشركة. أنشئ مستودعاً رئيسياً قبل حفظ الفاتورة.",
    en: "This company has no main warehouse. Create one before saving the invoice.",
    status: 400,
  },
  INSUFFICIENT_STOCK: {
    ar: "الكمية المطلوبة أكبر من المتاح في المخزون. عدّل الكمية أو أضف رصيداً جديداً.",
    en: "The requested quantity exceeds available stock. Adjust the quantity or receive new stock.",
    status: 409,
  },
  NEGATIVE_STOCK_CONFIRM_REQUIRED: {
    ar: "الرصيد سيصبح سالباً بعد الحفظ. أكّد العملية إذا كان ذلك مقصوداً.",
    en: "The balance will become negative after saving. Confirm if this is intentional.",
    status: 409,
  },
  HAS_ACTIVE_RETURNS: {
    ar: "لا يمكن تعديل أو حذف الفاتورة لوجود مرتجعات مقبولة. احذف المرتجعات أولاً.",
    en: "This invoice has approved returns. Delete them before editing or cancelling it.",
    status: 400,
  },
  SALE_NOT_FOUND: { ar: "الفاتورة غير موجودة أو تم حذفها.", en: "The invoice does not exist or was deleted.", status: 404 },
  STOCK_BLOCKED: { ar: "حركة المخزون مرفوضة لأن الرصيد لا يكفي.", en: "The stock movement was blocked because the balance is insufficient.", status: 409 },
  COMPANY_REQUIRED: { ar: "يجب اختيار الشركة قبل المتابعة.", en: "Please choose a company before continuing.", status: 400 },

  // ---- Generic CRUD messages used by many routes ----
  CREATE_FAILED: { ar: "تعذرت الإضافة. لم يتم حفظ أي بيانات.", en: "Could not create the record. Nothing was saved.", status: 500 },
  UPDATE_FAILED: { ar: "تعذر التعديل. لم يتم حفظ أي تغييرات.", en: "Could not update the record. No changes were saved.", status: 500 },
  DELETE_FAILED: { ar: "تعذر الحذف. السجل ما زال موجوداً.", en: "Could not delete the record. It still exists.", status: 500 },
  FETCH_FAILED: { ar: "تعذر تحميل البيانات. أعد المحاولة.", en: "Could not load the data. Please retry.", status: 500 },
};

export function getErrorDefinition(code: string | undefined | null): ErrorDefinition {
  if (code && ERROR_CATALOG[code]) return ERROR_CATALOG[code];
  return ERROR_CATALOG.INTERNAL_ERROR;
}

/** Codes that came from an existing route but are not in the catalog yet. */
export function isKnownError(code: string | undefined | null): boolean {
  return Boolean(code && ERROR_CATALOG[code]);
}
