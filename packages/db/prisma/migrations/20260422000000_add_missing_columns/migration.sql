-- Add contactEmail to agents (added to schema but missing migration)
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;

-- Add mobilePhone and smsOptIn to clients
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "mobilePhone" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "smsOptIn" BOOLEAN NOT NULL DEFAULT false;

-- Add goldWeightFineDestination and related assay fields to transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "goldWeightFineDestination" DECIMAL(20,6);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "assayDiscrepancyFlag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "assayDiscrepancyPct" DECIMAL(10,6);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "assayDiscrepancyNote" TEXT;
