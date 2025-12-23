-- AlterTable
ALTER TABLE "servers"
    ADD COLUMN IF NOT EXISTS "blacklist_status" TEXT,
    ADD COLUMN IF NOT EXISTS "blacklist_severity" TEXT,
    ADD COLUMN IF NOT EXISTS "blacklist_last_checked" TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS "blacklists" JSONB;

