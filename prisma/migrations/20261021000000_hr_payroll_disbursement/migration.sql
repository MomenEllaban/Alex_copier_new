-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "disbursedAt" TIMESTAMP(3),
ADD COLUMN     "disbursedBy" TEXT,
ADD COLUMN     "disbursementMethod" TEXT,
ADD COLUMN     "treasuryAccountId" TEXT,
ADD COLUMN     "disbursementJournalEntryId" TEXT;
