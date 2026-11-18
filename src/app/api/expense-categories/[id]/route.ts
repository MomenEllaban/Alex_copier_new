import { withApiErrors } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAction } from "@/lib/auth-helpers";
import { traceError } from "@/lib/prisma-errors";

async function PUT__raw(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("finance", "edit");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;
    const existing = await prisma.expenseCategory.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "اسم الفئة مطلوب" }, { status: 400 });
    }

    const category = await prisma.expenseCategory.update({
      where: { id },
      data: { name },
      include: { company: { select: { id: true, name: true } } },
    });
    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update expense category" }, { status: traceError("[expense-categories:PUT] update failed", error) });
  }
}

async function DELETE__raw(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAction("finance", "delete");
    if (!actor) {
      const authed = await requireAuth();
      return NextResponse.json({ error: authed ? "Forbidden" : "Unauthorized" }, { status: authed ? 403 : 401 });
    }
    const { id } = await params;
    const existing = await prisma.expenseCategory.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.expenseCategory.delete({ where: { id } });
    return NextResponse.json({ message: "Deleted" });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export const PUT = withApiErrors(PUT__raw);
export const DELETE = withApiErrors(DELETE__raw);
