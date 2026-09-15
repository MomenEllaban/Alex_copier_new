import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
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
  const authed = await requireAuth();
  return {
    actor: null,
    response: NextResponse.json(
      { error: authed ? "Forbidden" : "Unauthorized" },
      { status: authed ? 403 : 401 },
    ),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: customerId } = await params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });
    }

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
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });
    }

    const formData = await request.formData();
    const engineerId = String(formData.get("engineerId") ?? "").trim();
    const pageCountRaw = formData.get("pageCount");
    const notesRaw = formData.get("notes");
    const testDateRaw = formData.get("testDate");
    const machineIdRaw = formData.get("machineId");
    const image = formData.get("image");

    if (!engineerId) {
      return NextResponse.json({ error: "اختيار المهندس مطلوب", code: "ENGINEER_REQUIRED" }, { status: 400 });
    }
    const engineer = await prisma.engineer.findUnique({ where: { id: engineerId } });
    if (!engineer || !engineer.isActive) {
      return NextResponse.json({ error: "المهندس غير موجود", code: "ENGINEER_NOT_FOUND" }, { status: 400 });
    }

    const pageCount = Number(pageCountRaw);
    if (!Number.isInteger(pageCount) || pageCount <= 0) {
      return NextResponse.json({ error: "عدد الأوراق يجب أن يكون رقمًا أكبر من صفر", code: "PAGE_COUNT_INVALID" }, { status: 400 });
    }

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "صورة الاختبار مطلوبة", code: "IMAGE_REQUIRED" }, { status: 400 });
    }
    const imageError = validateCopierTestImage(image);
    if (imageError) {
      return NextResponse.json({ error: imageError, code: "IMAGE_INVALID" }, { status: 400 });
    }

    let testDate = new Date();
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

    const { secureUrl, publicId } = await uploadCopierTestImage(image, customerId);

    try {
      const test = await prisma.copierTest.create({
        data: {
          customerId,
          engineerId,
          machineId,
          pageCount,
          imageUrl: secureUrl,
          imagePublicId: publicId,
          notes,
          testDate,
        },
        include: TEST_INCLUDE,
      });
      return NextResponse.json(test, { status: 201 });
    } catch {
      // Avoid orphan images on Cloudinary if the DB write fails.
      await deleteCopierTestImage(publicId);
      return NextResponse.json({ error: "Failed to create test" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Failed to create test" }, { status: 500 });
  }
}
