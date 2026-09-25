-- 1.6: statement links could be revoked and could expire.
-- The token is rotated on every issue, and the public routes refuse a token
-- with no expiry — which also invalidates every link already sent out, on
-- purpose. Re-issue the ones that are still in use.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "statementTokenCreatedAt" TIMESTAMP(3),
ADD COLUMN "statementTokenExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Engineer" ADD COLUMN "statementTokenCreatedAt" TIMESTAMP(3),
ADD COLUMN "statementTokenExpiresAt" TIMESTAMP(3);
