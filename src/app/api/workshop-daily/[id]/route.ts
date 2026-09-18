import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";

const FINANCE_ROLES = ["ACCOUNTANT", "GENERAL_MANAGER", "COMPANY_MANAGER"] as const;

const WORKSHOP_CATEGORY_NAME = "يومية الورشة";

const TX_INCLUDE = {
  category: { select: { id: true, name: true } },
} as const;

async function authorize(): Promise<NextResponse | { actorId: string; isFinance: boolean }> {
  const actor = await requirePageAccess("workshopDaily");
  if (!actor) {
    const authed = await requireAuth();
    return NextResponse.json(
      { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
      { status: authed ? 403 : 401 },
    );
  }
  const actorId = (actor as { id?: string }).id ?? "";
  const role = (actor as { role?: string }).role ?? "";
  return { actorId, isFinance: (FINANCE_ROLES as readonly string[]).includes(role) };
}

/**
 * Validates that a transaction can still be modified: it must be PENDING, belong
 * to an OPEN book, and the caller must own it or hold a finance role. Returns a
 * ready-to-send error response, or the transaction's company id when editable.
 */
async function loadEditable(
  id: string,
  actorId: string,
  isFinance: boolean,
): Promise<NextResponse | { companyId: string }> {
  const tx = await prisma.workshopTransaction.findUnique({
    where: { id },
    select: {
      companyId: true,
      createdBy: true,
      status: true,
      book: { select: { status: true } },
    },
  });
  if (!tx) {
    return NextResponse.json({ error: "الحركة غير موجودة", code: "WORKSHOP_TX_NOT_FOUND" }, { status: 404 });
  }
  if (tx.status !== "PENDING") {
    return NextResponse.json(
      { error: "لا يمكن تعديل أو حذف حركة تم التعامل معها", code: "ALREADY_HANDLED" },
      { status: 409 },
    );
  }
  if (tx.book.status !== "OPEN") {
    return NextResponse.json(
      { error: "اليوم مقفول — لا يمكن التعديل أو الحذف", code: "BOOK_CLOSED" },
      { status: 409 },
    );
  }
  if (!isFinance && tx.createdBy !== actorId) {
    return NextResponse.json(
      { error: "يمكنك تعديل أو حذف الحركات المعلقة التي أضفتها فقط", code: "MODIFY_FORBIDDEN" },
      { status: 403 },
    );
  }
  return { companyId: tx.companyId };
}

/** Resolves the auto-assigned workshop category for OUT entries; IN entries have none. */
async function resolveCategoryId(companyId: string, direction: "IN" | "OUT") {
  if (direction === "IN") return null;
  const existing = await prisma.expenseCategory.findFirst({
    where: { companyId, name: WORKSHOP_CATEGORY_NAME },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.expenseCategory.create({
    data: { name: WORKSHOP_CATEGORY_NAME, companyId },
    select: { id: true },
  });
  return created.id;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await authorize();
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const direction = body.direction === "IN" ? "IN" : body.direction === "OUT" ? "OUT" : null;
    const amount = Number(body.amount);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const revenueType =
      direction === "OUT"
        ? null
        : body.revenueType === "SERVICE_REVENUE"
          ? "SERVICE_REVENUE"
          : body.revenueType === "CASH_COLLECTION"
            ? "CASH_COLLECTION"
            : body.revenueType === "OTHER_INCOME"
              ? "OTHER_INCOME"
              : null    ;
    if (direction === "IN" && !revenueType) {
      return NextResponse.json(
        { error: "تصنيف الوارد مطلوب (خدمة ورشة / تحصيل نقدية / إيرادات أخرى)", code: "REVENUE_TYPE_REQUIRED" },
        { status: 400 },
      );
    }
    if (direction === "OUT" && revenueType) {
      return NextResponse.json(
        { error: "تصنيف الوارد يُحدد فقط لحركات الوارد", code: "REVENUE_TYPE_NOT_ALLOWED_ON_OUT" },
        { status: 400 },
      );
    }
    const customerId = typeof body.customerId === "string" && body.customerId.trim() !== "" ? body.customerId.trim() : null;
    if (revenueType === "CASH_COLLECTION" && !customerId) {
      return NextResponse.json(
        { error: "حركة تحصيل نقدية تتطلب اختيار العميل المرتبط بالمديونية", code: "CASH_COLLECTION_CUSTOMER_REQUIRED" },
        { status: 400 },
      );
    }

    if (!direction) {
      return NextResponse.json({ error: "نوع الحركة مطلوب (وارد أو صادر)", code: "DIRECTION_REQUIRED" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "المبلغ يجب أن يكون رقمًا أكبر من صفر", code: "AMOUNT_INVALID" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "البيان مطلوب", code: "REASON_REQUIRED" }, { status: 400 });
    }

    const target = await loadEditable(id, auth.actorId, auth.isFinance);
    if (target instanceof NextResponse) return target;

    const categoryId = await resolveCategoryId(target.companyId, direction);

    // Guard the write with the same conditions checked above so a concurrent
    // confirm/reject cannot be overwritten between the read and the update.
    const changed = await prisma.workshopTransaction.updateMany({
      where: { id, status: "PENDING", book: { status: "OPEN" } },
      data: { direction, amount, revenueType, customerId, categoryId, reason },
    });
    if (changed.count !== 1) {
      return NextResponse.json(
        { error: "لا يمكن تعديل أو حذف حركة تم التعامل معها", code: "ALREADY_HANDLED" },
        { status: 409 },
      );
    }

    const updated = await prisma.workshopTransaction.findUnique({ where: { id }, include: TX_INCLUDE });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await authorize();
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;

    const target = await loadEditable(id, auth.actorId, auth.isFinance);
    if (target instanceof NextResponse) return target;

    const removed = await prisma.workshopTransaction.deleteMany({
      where: { id, status: "PENDING", book: { status: "OPEN" } },
    });
    if (removed.count !== 1) {
      return NextResponse.json(
        { error: "لا يمكن تعديل أو حذف حركة تم التعامل معها", code: "ALREADY_HANDLED" },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: "Failed to delete transaction" }, { status: 500 });
  }
}
