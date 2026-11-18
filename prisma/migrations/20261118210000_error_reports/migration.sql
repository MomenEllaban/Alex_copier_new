-- User-facing error reports, sent from the error details dialog.
CREATE TABLE "ErrorReport" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "messageAr" TEXT NOT NULL,
    "messageEn" TEXT NOT NULL,
    "hintAr" TEXT,
    "hintEn" TEXT,
    "requestId" TEXT,
    "path" TEXT,
    "action" TEXT,
    "details" TEXT,
    "userId" TEXT,
    "userEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErrorReport_status_createdAt_idx" ON "ErrorReport"("status", "createdAt");
CREATE INDEX "ErrorReport_code_createdAt_idx" ON "ErrorReport"("code", "createdAt");
