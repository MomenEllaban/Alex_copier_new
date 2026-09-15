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
    copierTest: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  requireAuth: vi.fn(),
  requirePageAccess: vi.fn(),
  requireRole: vi.fn(),
  uploadCopierTestImage: vi.fn(),
  deleteCopierTestImage: vi.fn(),
  validateCopierTestImage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: mocks.requireAuth,
  requirePageAccess: mocks.requirePageAccess,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/copier-test-upload", () => ({
  uploadCopierTestImage: mocks.uploadCopierTestImage,
  deleteCopierTestImage: mocks.deleteCopierTestImage,
  validateCopierTestImage: mocks.validateCopierTestImage,
}));

import { GET as listTests, POST as createTest } from "@/app/api/customers/[id]/tests/route";
import { GET as latestTest } from "@/app/api/customers/[id]/tests/latest/route";
import { GET as getTest, PUT as updateTest, DELETE as deleteTest } from "@/app/api/tests/[id]/route";

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

  it("POST rejects a missing image with an Arabic error", async () => {
    const res = await createTest(formRequest({ engineerId: "eng_1", pageCount: "1000" }, false), params("c1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("IMAGE_REQUIRED");
  });

  it("POST rejects a non-positive page count", async () => {
    const res = await createTest(formRequest({ engineerId: "eng_1", pageCount: "0" }, true), params("c1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("PAGE_COUNT_INVALID");
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
    const res = await listTests(new Request("http://localhost/x"), params("c1"));
    expect(res.status).toBe(401);
  });

  it("GET single test returns 404 for an unknown id", async () => {
    mocks.prisma.copierTest.findUnique.mockResolvedValue(null);
    const res = await getTest(new Request("http://localhost/x"), params("nope"));
    expect(res.status).toBe(404);
  });

  it("PUT rejects an invalid page count", async () => {
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

  it("DELETE is forbidden for non-admin roles", async () => {
    mocks.requireRole.mockResolvedValue(null);
    mocks.requireAuth.mockResolvedValue({ id: "u1", role: "ENGINEER" });
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
});
