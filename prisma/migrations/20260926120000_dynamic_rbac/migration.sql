-- AlterTable
ALTER TABLE "User" ADD COLUMN     "roleId" TEXT;

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "group" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePage" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RolePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleActionPermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "isAllowed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RoleActionPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE INDEX "Role_sortOrder_idx" ON "Role"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Page_key_key" ON "Page"("key");

-- CreateIndex
CREATE INDEX "Page_group_sortOrder_idx" ON "Page"("group", "sortOrder");

-- CreateIndex
CREATE INDEX "Page_isActive_idx" ON "Page"("isActive");

-- CreateIndex
CREATE INDEX "Action_pageId_sortOrder_idx" ON "Action"("pageId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Action_pageId_key_key" ON "Action"("pageId", "key");

-- CreateIndex
CREATE INDEX "RolePage_pageId_idx" ON "RolePage"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePage_roleId_pageId_key" ON "RolePage"("roleId", "pageId");

-- CreateIndex
CREATE INDEX "RoleActionPermission_actionId_idx" ON "RoleActionPermission"("actionId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleActionPermission_roleId_actionId_key" ON "RoleActionPermission"("roleId", "actionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePage" ADD CONSTRAINT "RolePage_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePage" ADD CONSTRAINT "RolePage_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleActionPermission" ADD CONSTRAINT "RoleActionPermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleActionPermission" ADD CONSTRAINT "RoleActionPermission_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

