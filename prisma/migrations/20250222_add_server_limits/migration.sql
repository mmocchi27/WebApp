-- AlterTable
ALTER TABLE "servers"
    ADD COLUMN "domain_limit" INTEGER NOT NULL DEFAULT 34,
    ADD COLUMN "inbox_limit" INTEGER NOT NULL DEFAULT 102;

