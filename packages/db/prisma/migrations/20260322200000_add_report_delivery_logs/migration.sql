-- CreateTable
CREATE TABLE "report_delivery_logs" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveryStatus" TEXT NOT NULL,
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_delivery_logs_reportId_idx" ON "report_delivery_logs"("reportId");

-- CreateIndex
CREATE INDEX "report_delivery_logs_deliveryStatus_idx" ON "report_delivery_logs"("deliveryStatus");

-- AddForeignKey
ALTER TABLE "report_delivery_logs" ADD CONSTRAINT "report_delivery_logs_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "regulatory_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
