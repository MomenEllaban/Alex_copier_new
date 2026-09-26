import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    customer: {
      findUnique: vi.fn(),
    },
    engineer: {
      findUnique: vi.fn(),
    },
    machine: {
      findUnique: vi.fn(),
    },
    company: {
      findFirst: vi.fn(),
    },
    settlement: {
      create: vi.fn(),
    },
    copierTest: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
  },
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
  requireRole: vi.fn(),
  uploadCopierTestImage: vi.fn(),
  deleteCopierTestImage: vi.fn(),
  validateCopierTestImage: vi.fn(),
  notifySettlementPendingVerification: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  // Action guards delegate to the page guard: these tests decide who is
  // allowed, not which action, and the page answer is what they mean.
  requireAction: (page: string) => mocks.requirePageAccess(page),
  requireAnyAction: (page: string) => mocks.requirePageAccess(page),
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/copier-test-upload", () => ({
  uploadCopierTestImage: mocks.uploadCopierTestImage,
  deleteCopierTestImage: mocks.deleteCopierTestImage,
  validateCopierTestImage: mocks.validateCopierTestImage,
}));
vi.mock("@/lib/notifications", () => ({
  notifySettlementPendingVerification: mocks.notifySettlementPendingVerification,
}));

import { GET as listTests, POST as createTest } from "@/app/api/customers/[id]/tests/route";
import { GET as latestTest } from "@/app/api/customers/[id]/tests/latest/route";
import { GET as getTest, PUT as updateTest, DELETE as deleteTest } from "@/app/api/tests/[id]/route";
import { GET as listAllTests } from "@/app/api/tests/route";

const gm = { id: "gm_1", role: "GENERAL_MANAGER" };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const pngFile = () => new File([new Uint8Array([137, 80, 78, 71])], "test.png", { type: "image/png" });

const formRequest = (fields: Record<string, string>, withImage: boolean) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (withImage) form.append("image", pngFile());
  return new Request("http://localhost/api/customers/c1/tests", { method: "POST", body: form });
};

describe("copier tests API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(gm);
    mocks.requirePageAccess.mockResolvedValue(gm);
    mocks.requireRole.mockResolvedValue(gm);
    mocks.validateCopierTestImage.mockReturnValue(null);
    mocks.prisma.customer.findUnique.mockResolvedValue({ id: "c1" });
    mocks.prisma.engineer.findUnique.mockResolvedValue({ id: "eng_1", isActive: true });
  });

  it("POST rejects a missing engineer with an Arabic error", async () => {
    const res = await createTest(formRequest({ pageCount: "1000" }, true), params("c1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("ENGINEER_REQUIRED");
  });

  it("POST creates a test without an image (image is optional)", async () => {
    const created = { id: "t1", pageCount: 1000, imageUrl: null };
    mocks.prisma.copierTest.create.mockResolvedValue(created);
    const res = await createTest(formRequest({ engineerId: "eng_1", pageCount: "1000", blackCounter: "1000" }, false), params("c1"));
    expect(res.status).toBe(201);
    expect(mocks.uploadCopierTestImage).not.toHaveBeenCalled();
    const arg = mocks.prisma.copierTest.create.mock.calls[0][0];
    expect(arg.data.imageUrl).toBeNull();
  });

  it("POST rejects a negative page count", async () => {
    const res = await createTest(formRequest({ engineerId: "eng_1", pageCount: "-1", blackCounter: "10" }, true), params("c1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("PAGE_COUNT_INVALID");
  });

  it("POST rejects invalid counters", async () => {
    const res = await createTest(formRequest({ engineerId: "eng_1", pageCount: "0", blackCounter: "-5" }, false), params("c1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("COUNTER_INVALID");
  });

  it("POST stores counters, repair statement and spare parts", async () => {
    mocks.uploadCopierTestImage.mockResolvedValue({ secureUrl: "https://img", publicId: "pub_1" });
    mocks.prisma.copierTest.create.mockResolvedValue({ id: "t2" });
    const res = await createTest(
      formRequest(
        { engineerId: "eng_1", pageCount: "1200", blackCounter: "1200", colorCounter: "300", repairStatement: "صيانة دورية", spareParts: "درام" },
        true,
      ),
      params("c1"),
    );
    expect(res.status).toBe(201);
    const arg = mocks.prisma.copierTest.create.mock.calls[0][0];
    expect(arg.data.blackCounter).toBe(1200);
    expect(arg.data.colorCounter).toBe(300);
    expect(arg.data.repairStatement).toBe("صيانة دورية");
    expect(arg.data.spareParts).toBe("درام");
    expect(arg.data.collectedAmount).toBeNull();
    expect(mocks.prisma.settlement.create).not.toHaveBeenCalled();
  });

  it("POST with a collected amount creates a settlement and notifies finance", async () => {
    mocks.prisma.copierTest.create.mockResolvedValue({ id: "t3" });
    mocks.prisma.company.findFirst.mockResolvedValue({ id: "company-alex" });
    mocks.prisma.settlement.create.mockResolvedValue({ id: "stl_1", settlementNumber: "STL-1", amount: 500, collector: { name: "شعبان" } });
    const res = await createTest(
      formRequest({ engineerId: "eng_1", pageCount: "500", blackCounter: "500", collectedAmount: "500", collectionNote: "زيارة" }, false),
      params("c1"),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.settlementId).toBe("stl_1");
    const stlArg = mocks.prisma.settlement.create.mock.calls[0][0];
    expect(stlArg.data.amount).toBe(500);
    expect(stlArg.data.status).toBe("INITIAL");
    expect(stlArg.data.direction).toBe("ADDITION");
    expect(mocks.notifySettlementPendingVerification).toHaveBeenCalledOnce();
  });

  it("POST rejects an invalid collected amount", async () => {
    const res = await createTest(
      formRequest({ engineerId: "eng_1", pageCount: "100", blackCounter: "100", collectedAmount: "0" }, false),
      params("c1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("AMOUNT_INVALID");
  });

  it("POST blocks engineers from recording tests for unassigned customers", async () => {
    const engUser = { id: "u_eng", role: "ENGINEER" };
    mocks.requireAuth.mockResolvedValue(engUser);
    mocks.requirePageAccess.mockResolvedValue(null);
    // guardWrite falls back to serviceRequests access for engineers
    mocks.requirePageAccess.mockImplementation(async (page: string) =>
      page === "serviceRequests" ? engUser : null,
    );
    mocks.prisma.customer.findUnique.mockResolvedValue({ id: "c1", name: "عميل", engineerId: "other_eng" });
    mocks.prisma.engineer.findUnique.mockImplementation(async (args: { where: { id?: string; userId?: string } }) => {
      if (args.where.userId) return { id: "my_eng" };
      return { id: "eng_1", isActive: true };
    });
    const res = await createTest(formRequest({ engineerId: "eng_1", pageCount: "10", blackCounter: "10" }, false), params("c1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("CUSTOMER_NOT_ASSIGNED");
    expect(mocks.prisma.copierTest.create).not.toHaveBeenCalled();
  });

  it("POST uploads to Cloudinary and creates the test", async () => {
    mocks.uploadCopierTestImage.mockResolvedValue({ secureUrl: "https://img", publicId: "pub_1" });
    const created = { id: "t1", pageCount: 1000 };
    mocks.prisma.copierTest.create.mockResolvedValue(created);

    const res = await createTest(
      formRequest({ engineerId: "eng_1", pageCount: "1000", notes: "تمام" }, true),
      params("c1"),
    );
    expect(res.status).toBe(201);
    expect(mocks.uploadCopierTestImage).toHaveBeenCalledOnce();
    const arg = mocks.prisma.copierTest.create.mock.calls[0][0];
    expect(arg.data.imageUrl).toBe("https://img");
    expect(arg.data.imagePublicId).toBe("pub_1");
  });

  it("GET latest returns NO_TESTS when the customer has no tests", async () => {
    mocks.prisma.copierTest.findFirst.mockResolvedValue(null);
    const res = await latestTest(new Request("http://localhost/x"), params("c1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NO_TESTS");
  });

  it("GET list returns 401 when unauthenticated", async () => {
    mocks.requireAuth.mockResolvedValue(null);
    mocks.requirePageAccess.mockResolvedValue(null);
    const res = await listTests(new Request("http://localhost/x"), params("c1"));
    expect(res.status).toBe(401);
  });

  it("GET single test returns 404 for an unknown id", async () => {
    mocks.prisma.copierTest.findUnique.mockResolvedValue(null);
    const res = await getTest(new Request("http://localhost/x"), params("nope"));
    expect(res.status).toBe(404);
  });

  it("PUT rejects a negative page count", async () => {
    mocks.prisma.copierTest.findUnique.mockResolvedValue({ id: "t1" });
    const req = new Request("http://localhost/api/tests/t1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageCount: -5 }),
    });
    const res = await updateTest(req, params("t1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("PAGE_COUNT_INVALID");
  });

  it("PUT updates counters, repair statement, spare parts and amount", async () => {
    mocks.prisma.copierTest.findUnique.mockResolvedValue({ id: "t1" });
    mocks.prisma.copierTest.update.mockResolvedValue({ id: "t1" });
    const req = new Request("http://localhost/api/tests/t1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blackCounter: 1500, colorCounter: 200, repairStatement: "تعبئة حبر", spareParts: "حبر", collectedAmount: 250, collectionNote: "زيارة" }),
    });
    const res = await updateTest(req, params("t1"));
    expect(res.status).toBe(200);
    const arg = mocks.prisma.copierTest.update.mock.calls[0][0];
    expect(arg.data.blackCounter).toBe(1500);
    expect(arg.data.colorCounter).toBe(200);
    expect(arg.data.repairStatement).toBe("تعبئة حبر");
    expect(arg.data.collectedAmount).toBe(250);
  });

  it("PUT rejects an invalid counter", async () => {
    mocks.prisma.copierTest.findUnique.mockResolvedValue({ id: "t1" });
    const req = new Request("http://localhost/api/tests/t1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blackCounter: -3 }),
    });
    const res = await updateTest(req, params("t1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("COUNTER_INVALID");
  });

  it("DELETE is forbidden for roles without tests access", async () => {
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue({ id: "u1", role: "ACCOUNTANT" });
    const res = await deleteTest(new Request("http://localhost/x", { method: "DELETE" }), params("t1"));
    expect(res.status).toBe(403);
    expect(mocks.prisma.copierTest.delete).not.toHaveBeenCalled();
  });

  it("DELETE removes the record and its Cloudinary image for admins", async () => {
    mocks.prisma.copierTest.findUnique.mockResolvedValue({ id: "t1", imagePublicId: "pub_1" });
    mocks.prisma.copierTest.delete.mockResolvedValue({ id: "t1" });
    const res = await deleteTest(new Request("http://localhost/x", { method: "DELETE" }), params("t1"));
    expect(res.status).toBe(200);
    expect(mocks.deleteCopierTestImage).toHaveBeenCalledWith("pub_1");
  });

  it("DELETE lets a workshop manager remove a test", async () => {
    const workshop = { id: "u9", role: "WORKSHOP_MANAGER" };
    mocks.requirePageAccess.mockImplementation(async (page: string) =>
      page === "copierTests" ? workshop : null,
    );
    mocks.prisma.copierTest.findUnique.mockResolvedValue({ id: "t1", imagePublicId: null });
    mocks.prisma.copierTest.delete.mockResolvedValue({ id: "t1" });
    const res = await deleteTest(new Request("http://localhost/x", { method: "DELETE" }), params("t1"));
    expect(res.status).toBe(200);
  });

  it("DELETE refuses a test of a customer that is not assigned to the engineer", async () => {
    const engineerUser = { id: "u1", role: "ENGINEER" };
    mocks.requirePageAccess.mockResolvedValue(engineerUser);
    mocks.requireAuth.mockResolvedValue(engineerUser);
    mocks.prisma.copierTest.findUnique.mockResolvedValue({ id: "t1", customerId: "c9" });
    mocks.prisma.engineer.findUnique.mockResolvedValue({ id: "eng_1" });
    mocks.prisma.customer.findUnique.mockResolvedValue({ id: "c9", engineerId: "eng_other" });
    const res = await deleteTest(new Request("http://localhost/x", { method: "DELETE" }), params("t1"));
    expect(res.status).toBe(403);
    expect(mocks.prisma.copierTest.delete).not.toHaveBeenCalled();
  });

  it("GET /api/tests is forbidden without tests access", async () => {
    mocks.requirePageAccess.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue({ id: "u1", role: "ACCOUNTANT" });
    const res = await listAllTests(new Request("http://localhost/api/tests"));
    expect(res.status).toBe(403);
    expect(mocks.prisma.copierTest.count).not.toHaveBeenCalled();
  });

  it("GET /api/tests returns one page plus filtered totals", async () => {
    mocks.prisma.copierTest.count.mockResolvedValue(42);
    mocks.prisma.copierTest.findMany.mockResolvedValue([{ id: "t1", customer: { id: "c1", name: "عميل" } }]);
    mocks.prisma.copierTest.aggregate.mockResolvedValue({
      _count: { _all: 42 },
      _sum: { collectedAmount: 300, blackCounter: 1500, colorCounter: 20 },
    });
    const res = await listAllTests(
      new Request("http://localhost/api/tests?customerId=c1&page=2&pageSize=15"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(42);
    expect(body.totalPages).toBe(3);
    expect(body.summary.collectedTotal).toBe(300);
    const where = mocks.prisma.copierTest.findMany.mock.calls[0][0].where;
    expect(where.customerId).toBe("c1");
    const findArgs = mocks.prisma.copierTest.findMany.mock.calls[0][0];
    expect(findArgs.skip).toBe(15);
    expect(findArgs.take).toBe(15);
    expect(findArgs.include.customer.select.name).toBe(true);
  });

  it("GET /api/tests scopes engineers to their own customers", async () => {
    const engineerUser = { id: "u1", role: "ENGINEER" };
    mocks.requirePageAccess.mockResolvedValue(engineerUser);
    mocks.requireAuth.mockResolvedValue(engineerUser);
    mocks.prisma.engineer.findUnique.mockResolvedValue({ id: "eng_1" });
    mocks.prisma.copierTest.count.mockResolvedValue(0);
    mocks.prisma.copierTest.findMany.mockResolvedValue([]);
    mocks.prisma.copierTest.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { collectedAmount: null, blackCounter: null, colorCounter: null },
    });
    const res = await listAllTests(new Request("http://localhost/api/tests"));
    expect(res.status).toBe(200);
    const where = mocks.prisma.copierTest.findMany.mock.calls[0][0].where;
    expect(where.customer).toEqual({ engineerId: "eng_1" });
  });
});
