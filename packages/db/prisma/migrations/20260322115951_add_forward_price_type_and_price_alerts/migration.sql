-- AlterEnum
ALTER TYPE "LmePriceType" ADD VALUE 'FORWARD';

-- CreateTable
CREATE TABLE "price_alerts" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "referencePriceUsd" DECIMAL(20,6) NOT NULL,
    "newPriceUsd" DECIMAL(20,6) NOT NULL,
    "changePct" DECIMAL(10,6) NOT NULL,
    "direction" TEXT NOT NULL,
    "exposureUsd" DECIMAL(20,6) NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "alertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_alerts_transactionId_idx" ON "price_alerts"("transactionId");

-- CreateIndex
CREATE INDEX "price_alerts_alertedAt_idx" ON "price_alerts"("alertedAt");

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
