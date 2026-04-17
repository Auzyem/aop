-- Ensure lme_price_records table exists (may be missing if init migration partially applied)

DO $$ BEGIN
  CREATE TYPE "LmePriceType" AS ENUM ('AM_FIX', 'PM_FIX', 'SPOT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "lme_price_records" (
    "id" TEXT NOT NULL,
    "priceUsdPerTroyOz" DECIMAL(20,6) NOT NULL,
    "priceType" "LmePriceType" NOT NULL,
    "source" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lme_price_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "lme_price_records_recordedAt_idx" ON "lme_price_records"("recordedAt");
CREATE INDEX IF NOT EXISTS "lme_price_records_priceType_idx" ON "lme_price_records"("priceType");
CREATE UNIQUE INDEX IF NOT EXISTS "lme_price_records_recordedAt_priceType_key" ON "lme_price_records"("recordedAt", "priceType");
