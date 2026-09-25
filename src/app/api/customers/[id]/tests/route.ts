import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { notifySettlementPendingVerification } from "@/lib/notifications";
import {
  deleteCopierTestImage,
  uploadCopierTestImage,
  validateCopierTestImage,
} from "@/lib/copier-test-upload";

const TEST_INCLUDE = {
  engineer: { select: { id: true, name: true } },
  machine: { select: { id: true, serialNumber: true, model: true } },
} as const;

async function guardWrite() {
  const customersAccess = await requirePageAccess("customers");
  if (customersAccess) return { actor: customersAccess };
  // Engineers (serviceRequests page) may record tests for visited customers.
  const serviceAccess = await requirePageAccess("serviceRequests");
  if (serviceAccess) return { actor: serviceAccess };
  // The tests page itself (workshop staff recording the visit readings).
  const testsAccess = await requirePageAccess("copierTests");
  if (testsAccess) return { actor: testsAccess };
  const authed = await requireAuth();
  return {
    actor: null,
    response: NextResponse.json(
      { error: authed ? "Forbidden" : "Unauthorized" },
      { status: authed ? 403 : 401 },
    ),
  };
}

function actorRole(actor: unknown): string {
  return (actor as { role?: string } | null)?.role ?? "";
}

function actorId(actor: unknown): string {
  return (actor as { id?: string } | null)?.id ?? "";
}

/**
 * Engineers are scoped to their own customers: the customer must be linked
 * to the engineer's record (Customer.engineerId). Managers pass through.
 */
async function engineerScopeCheck(actor: unknown, customerId: string) {
  if (actorRole(actor) !== "ENGINEER") return null;
  const mine = await prisma.engineer.findUnique({
    where: { userId: actorId(actor) },
    select: { id: true },
  });
  if (!mine) {
    return NextResponse.json({ error: "حساب المهندس غير مرتبط", code: "ENGINEER_NOT_LINKED" }, { status: 403 });
  }
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { engineerId: true },
  });
  if (!customer || customer.engineerId !== mine.id) {
    return NextResponse.json({ error: "هذا العميل غير مسند إليك", code: "CUSTOMER_NOT_ASSIGNED" }, { status: 403 });
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePageAccess("copierTests");
    if (!user) {
      const authed = await requireAuth();
      return NextResponse.json(
        { error: authed ? "Forbidden" : "Unauthorized", code: authed ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: authed ? 403 : 401 }
      );
    }
    const { id: customerId } = await params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });
    }
    const scoped = await engineerScopeCheck(user, customerId);
    if (scoped) return scoped;

    const tests = await prisma.copierTest.findMany({
      where: { customerId },
      include: TEST_INCLUDE,
      orderBy: [{ testDate: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(tests);
  } catch {
    return NextResponse.json({ error: "Failed to fetch tests" }, { status: 500 });
  }
}

function parseOptionalInt(raw: FormDataEntryValue | null): number | null | undefined {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { actor, response } = await guardWrite();
    if (!actor && response) return response;
    const { id: customerId } = await params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });
    }
    const scoped = await engineerScopeCheck(actor, customerId);
    if (scoped) return scoped;

    const formData = await request.formData();
    const engineerId = String(formData.get("engineerId") ?? "").trim();
    const pageCountRaw = formData.get("pageCount");
    const notesRaw = formData.get("notes");
    const testDateRaw = formData.get("testDate");
    const machineIdRaw = formData.get("machineId");
    const image = formData.get("image");
    const repairStatementRaw = formData.get("repairStatement");
    const sparePartsRaw = formData.get("spareParts");
    const collectedAmountRaw = formData.get("collectedAmount");
    const collectionNoteRaw = formData.get("collectionNote");

    if (!engineerId) {
      return NextResponse.json({ error: "اختيار المهندس مطلوب", code: "ENGINEER_REQUIRED" }, { status: 400 });
    }
    const engineer = await prisma.engineer.findUnique({ where: { id: engineerId } });
    if (!engineer || !engineer.isActive) {
      return NextResponse.json({ error: "المهندس غير موجود", code: "ENGINEER_NOT_FOUND" }, { status: 400 });
    }

    const pageCount = Number(pageCountRaw);
    if (!Number.isInteger(pageCount) || pageCount < 0) {
      return NextResponse.json({ error: "عدد الأوراق يجب أن يكون رقمًا صحيحًا", code: "PAGE_COUNT_INVALID" }, { status: 400 });
    }

    const blackCounter = parseOptionalInt(formData.get("blackCounter"));
    const colorCounter = parseOptionalInt(formData.get("colorCounter"));
    if (blackCounter === undefined || colorCounter === undefined) {
      return NextResponse.json({ error: "عداد الأسود والألوان يجب أن يكونا رقمين صحيحين", code: "COUNTER_INVALID" }, { status: 400 });
    }

    let collectedAmount: number | null = null;
    if (collectedAmountRaw != null && String(collectedAmountRaw).trim() !== "") {
      collectedAmount = Number(String(collectedAmountRaw).trim());
      if (!Number.isFinite(collectedAmount) || collectedAmount <= 0) {
        return NextResponse.json({ error: "المبلغ المحصل يجب أن يكون رقمًا أكبر من صفر", code: "AMOUNT_INVALID" }, { status: 400 });
      }
    }

    const textOrNull = (v: FormDataEntryValue | null) => {
      const s = v != null ? String(v).trim() : "";
      return s === "" ? null : s;
    };
    const repairStatement = textOrNull(repairStatementRaw);
    const spareParts = textOrNull(sparePartsRaw);
    const collectionNote = textOrNull(collectionNoteRaw);

    let testDate: Date | null = new Date();
    if (testDateRaw != null && String(testDateRaw).trim() !== "") {
      testDate = new Date(String(testDateRaw));
      if (Number.isNaN(testDate.getTime())) {
        return NextResponse.json({ error: "تاريخ الاختبار غير صالح", code: "TEST_DATE_INVALID" }, { status: 400 });
      }
    }

    let machineId: string | undefined;
    if (machineIdRaw != null && String(machineIdRaw).trim() !== "") {
      const machine = await prisma.machine.findUnique({ where: { id: String(machineIdRaw) } });
      if (!machine) {
        return NextResponse.json({ error: "الماكينة غير موجودة", code: "MACHINE_NOT_FOUND" }, { status: 400 });
      }
      machineId = machine.id;
    }

    const notes =
      notesRaw != null && String(notesRaw).trim() !== "" ? String(notesRaw).trim() : null;

    // Image is optional: historical/imported tests may have no photo.
    let secureUrl: string | null = null;
    let publicId: string | null = null;
    if (image instanceof File && image.size > 0) {
      const imageError = validateCopierTestImage(image);
      if (imageError) {
        return NextResponse.json({ error: imageError, code: "IMAGE_INVALID" }, { status: 400 });
      }
      const uploaded = await uploadCopierTestImage(image, customerId);
      secureUrl = uploaded.secureUrl;
      publicId = uploaded.publicId;
    }

    try {
      const test = await prisma.copierTest.create({
        data: {
          customerId,
          engineerId,
          machineId,
          pageCount,
          blackCounter,
          colorCounter,
          repairStatement,
          spareParts,
          collectedAmount,
          collectionNote,
          imageUrl: secureUrl,
          imagePublicId: publicId,
          notes,
          testDate,
        },
        include: TEST_INCLUDE,
      });

      // Collected cash → pending settlement + accountant notification.
      let settlementId: string | null = null;
      if (collectedAmount != null) {
        const company =
          (await prisma.company.findFirst({ where: { name: "اليكس كوبير" }, select: { id: true } })) ??
          (await prisma.company.findFirst({ select: { id: true } }));
        if (company) {
          const settlementNumber = `STL-${Date.now()}`;
          const settlement = await prisma.settlement.create({
            data: {
              companyId: company.id,
              customerId,
              engineerId,
              amount: collectedAmount,
              paymentMethod: "CASH",
              reason: (collectionNote || repairStatement || `تحصيل من العميل ${customer.name}`).slice(0, 500),
              direction: "ADDITION",
              status: "INITIAL",
              collectedBy: actorId(actor),
              settlementNumber,
              createdAt: testDate ?? undefined,
            },
            include: { collector: { select: { name: true } } },
          });
          settlementId = settlement.id;
          void notifySettlementPendingVerification({
            settlementId: settlement.id,
            settlementNumber: settlement.settlementNumber,
            amount: settlement.amount,
            collectorName: settlement.collector?.name,
            actorId: actorId(actor),
          }).catch(() => undefined);
        }
      }

      return NextResponse.json({ ...test, settlementId }, { status: 201 });
    } catch {
      // Avoid orphan images on Cloudinary if the DB write fails.
      if (publicId) await deleteCopierTestImage(publicId);
      return NextResponse.json({ error: "Failed to create test" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Failed to create test" }, { status: 500 });
  }
}
