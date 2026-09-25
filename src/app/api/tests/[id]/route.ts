import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePageAccess } from "@/lib/auth-helpers";
import { deleteCopierTestImage } from "@/lib/copier-test-upload";

const TEST_INCLUDE = {
  engineer: { select: { id: true, name: true } },
  machine: { select: { id: true, serialNumber: true, model: true } },
  customer: { select: { id: true, name: true } },
} as const;

async function guardWrite() {
  const customersAccess = await requirePageAccess("customers");
  if (customersAccess) return { actor: customersAccess };
  const serviceAccess = await requirePageAccess("serviceRequests");
  if (serviceAccess) return { actor: serviceAccess };
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
 * Engineers may only touch tests of the customers assigned to them
 * (Customer.engineerId). Every other role passes through.
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
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const test = await prisma.copierTest.findUnique({
      where: { id },
      include: TEST_INCLUDE,
    });
    if (!test) {
      return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });
    }
    return NextResponse.json(test);
  } catch {
    return NextResponse.json({ error: "Failed to fetch test" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { actor, response } = await guardWrite();
    if (!actor && response) return response;
    const { id } = await params;

    const existing = await prisma.copierTest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });
    }
    const scoped = await engineerScopeCheck(actor, existing.customerId);
    if (scoped) return scoped;

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.engineerId !== undefined) {
      const engineerId = String(body.engineerId).trim();
      if (!engineerId) {
        return NextResponse.json({ error: "اختيار المهندس مطلوب", code: "ENGINEER_REQUIRED" }, { status: 400 });
      }
      const engineer = await prisma.engineer.findUnique({ where: { id: engineerId } });
      if (!engineer || !engineer.isActive) {
        return NextResponse.json({ error: "المهندس غير موجود", code: "ENGINEER_NOT_FOUND" }, { status: 400 });
      }
      updateData.engineerId = engineerId;
    }

    if (body.pageCount !== undefined) {
      const pageCount = Number(body.pageCount);
      if (!Number.isInteger(pageCount) || pageCount < 0) {
        return NextResponse.json({ error: "عدد الأوراق يجب أن يكون رقمًا صحيحًا", code: "PAGE_COUNT_INVALID" }, { status: 400 });
      }
      updateData.pageCount = pageCount;
    }

    for (const field of ["blackCounter", "colorCounter"] as const) {
      if (body[field] !== undefined) {
        if (body[field] == null || String(body[field]).trim() === "") {
          updateData[field] = null;
        } else {
          const n = Number(body[field]);
          if (!Number.isInteger(n) || n < 0) {
            return NextResponse.json({ error: "عداد الأسود والألوان يجب أن يكونا رقمين صحيحين", code: "COUNTER_INVALID" }, { status: 400 });
          }
          updateData[field] = n;
        }
      }
    }

    for (const field of ["repairStatement", "spareParts", "collectionNote"] as const) {
      if (body[field] !== undefined) {
        updateData[field] =
          body[field] != null && String(body[field]).trim() !== "" ? String(body[field]).trim() : null;
      }
    }

    if (body.collectedAmount !== undefined) {
      if (body.collectedAmount == null || String(body.collectedAmount).trim() === "") {
        updateData.collectedAmount = null;
      } else {
        const amount = Number(body.collectedAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return NextResponse.json({ error: "المبلغ المحصل يجب أن يكون رقمًا أكبر من صفر", code: "AMOUNT_INVALID" }, { status: 400 });
        }
        updateData.collectedAmount = amount;
      }
    }

    if (body.testDate !== undefined) {
      const testDate = new Date(String(body.testDate));
      if (Number.isNaN(testDate.getTime())) {
        return NextResponse.json({ error: "تاريخ الاختبار غير صالح", code: "TEST_DATE_INVALID" }, { status: 400 });
      }
      updateData.testDate = testDate;
    }

    if (body.notes !== undefined) {
      updateData.notes =
        body.notes != null && String(body.notes).trim() !== "" ? String(body.notes).trim() : null;
    }

    if (body.machineId !== undefined) {
      if (body.machineId == null || String(body.machineId).trim() === "") {
        updateData.machineId = null;
      } else {
        const machine = await prisma.machine.findUnique({ where: { id: String(body.machineId) } });
        if (!machine) {
          return NextResponse.json({ error: "الماكينة غير موجودة", code: "MACHINE_NOT_FOUND" }, { status: 400 });
        }
        updateData.machineId = machine.id;
      }
    }

    const test = await prisma.copierTest.update({
      where: { id },
      data: updateData,
      include: TEST_INCLUDE,
    });
    return NextResponse.json(test);
  } catch {
    return NextResponse.json({ error: "Failed to update test" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Whoever is allowed to record a test may remove a wrong entry.
    const { actor, response } = await guardWrite();
    if (!actor && response) return response;
    const { id } = await params;

    const existing = await prisma.copierTest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });
    }
    const scoped = await engineerScopeCheck(actor, existing.customerId);
    if (scoped) return scoped;

    await prisma.copierTest.delete({ where: { id } });
    if (existing.imagePublicId) await deleteCopierTestImage(existing.imagePublicId);
    return NextResponse.json({ message: "Test deleted" });
  } catch {
    return NextResponse.json({ error: "Failed to delete test" }, { status: 500 });
  }
}
