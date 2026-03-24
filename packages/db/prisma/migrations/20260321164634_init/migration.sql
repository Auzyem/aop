-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'TRADE_MANAGER', 'OPERATIONS', 'VIEWER');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('INDIVIDUAL', 'COMPANY', 'COOP');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SanctionsStatus" AS ENUM ('CLEAR', 'HIT', 'POSSIBLE_MATCH', 'PENDING');

-- CreateEnum
CREATE TYPE "RiskRating" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('NATIONAL_ID', 'PASSPORT', 'DRIVING_LICENCE', 'UTILITY_BILL', 'BANK_STATEMENT', 'MINING_LICENCE', 'BUSINESS_REGISTRATION', 'TAX_CERTIFICATE', 'COMPANY_CONSTITUTION', 'DIRECTOR_ID', 'BENEFICIAL_OWNER_DECLARATION', 'SOURCE_OF_FUNDS', 'PROOF_OF_ADDRESS', 'SANCTIONS_CHECK_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "KycRecordStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SanctionsOutcome" AS ENUM ('CLEAR', 'HIT', 'POSSIBLE_MATCH');

-- CreateEnum
CREATE TYPE "TransactionPhase" AS ENUM ('PHASE_1', 'PHASE_2', 'PHASE_3', 'PHASE_4', 'PHASE_5', 'PHASE_6', 'PHASE_7');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'KYC_REVIEW', 'KYC_APPROVED', 'KYC_REJECTED', 'PRICE_LOCKED', 'LOGISTICS_PENDING', 'IN_TRANSIT', 'RECEIVED_AT_REFINERY', 'ASSAY_IN_PROGRESS', 'ASSAY_COMPLETE', 'DISBURSEMENT_PENDING', 'PARTIALLY_DISBURSED', 'DISBURSED', 'SETTLEMENT_PENDING', 'SETTLED', 'CANCELLED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('MINING_LICENCE', 'EXPORT_PERMIT', 'ASSAY_CERTIFICATE', 'PACKING_LIST', 'COMMERCIAL_INVOICE', 'BILL_OF_LADING', 'CERTIFICATE_OF_ORIGIN', 'CUSTOMS_DECLARATION', 'INSURANCE_CERTIFICATE', 'BANK_INSTRUCTION_LETTER', 'SETTLEMENT_STATEMENT', 'KYC_IDENTITY_DOCUMENT', 'AML_SCREENING_REPORT', 'DISBURSEMENT_RECEIPT', 'REGULATORY_FILING');

-- CreateEnum
CREATE TYPE "DocumentApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('REFINING_CHARGE', 'ASSAY_FEE', 'EXPORT_LEVY', 'CUSTOMS_DUTY', 'FREIGHT', 'INSURANCE', 'BANK_CHARGES', 'AGENT_COMMISSION', 'LABORATORY_FEE', 'REGULATORY_FEE', 'MISCELLANEOUS');

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('PENDING', 'APPROVED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('PENDING', 'INITIATED', 'SENT', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "LmePriceType" AS ENUM ('AM_FIX', 'PM_FIX', 'SPOT');

-- CreateEnum
CREATE TYPE "RegulatoryReportType" AS ENUM ('MONTHLY_TRANSACTION', 'QUARTERLY_AML', 'ANNUAL_COMPLIANCE', 'SUSPICIOUS_ACTIVITY', 'LARGE_TRANSACTION', 'AD_HOC');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "countryCode" CHAR(2) NOT NULL,
    "agentId" TEXT,
    "twoFactorSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "contactName" TEXT NOT NULL,
    "licenceNo" TEXT NOT NULL,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "bankName" TEXT,
    "bankAccount" TEXT,
    "performanceScore" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "nationalId" TEXT,
    "miningLicenceNo" TEXT,
    "businessRegNo" TEXT,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "sanctionsStatus" "SanctionsStatus" NOT NULL DEFAULT 'PENDING',
    "riskRating" "RiskRating" NOT NULL DEFAULT 'MEDIUM',
    "isPEP" BOOLEAN NOT NULL DEFAULT false,
    "isEDD" BOOLEAN NOT NULL DEFAULT false,
    "assignedAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_records" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "documentType" "KycDocumentType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "status" "KycRecordStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "retainUntil" TIMESTAMP(3),

    CONSTRAINT "kyc_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanctions_screenings" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "rawResult" JSONB NOT NULL,
    "outcome" "SanctionsOutcome" NOT NULL,
    "screenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "screenedBy" TEXT NOT NULL,

    CONSTRAINT "sanctions_screenings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refineries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "lbmaAccredited" BOOLEAN NOT NULL DEFAULT false,
    "contactEmail" TEXT,
    "refiningChargePercent" DECIMAL(10,6) NOT NULL,
    "assayFeeUsd" DECIMAL(20,6) NOT NULL,

    CONSTRAINT "refineries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "phase" "TransactionPhase" NOT NULL DEFAULT 'PHASE_1',
    "status" "TransactionStatus" NOT NULL DEFAULT 'DRAFT',
    "goldWeightGross" DECIMAL(20,6) NOT NULL,
    "goldWeightFine" DECIMAL(20,6),
    "assayPurity" DECIMAL(10,6),
    "lmePriceLocked" DECIMAL(20,6),
    "priceLockedAt" TIMESTAMP(3),
    "priceLockedBy" TEXT,
    "assignedRefineryId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase_history" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "phase" "TransactionPhase" NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "enteredBy" TEXT NOT NULL,
    "notes" TEXT,
    "slaBreach" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "phase_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT,
    "clientId" TEXT,
    "documentType" "DocumentType" NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvalStatus" "DocumentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "isSystemGenerated" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "retainUntil" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_items" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "estimatedUsd" DECIMAL(20,6),
    "actualUsd" DECIMAL(20,6),
    "currencyOriginal" CHAR(3),
    "amountOriginal" DECIMAL(20,6),
    "fxRate" DECIMAL(20,6),
    "receiptUrl" TEXT,
    "notes" TEXT,

    CONSTRAINT "cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursements" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "trancheNo" INTEGER NOT NULL,
    "amountUsd" DECIMAL(20,6) NOT NULL,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'PENDING',
    "instructionPdfUrl" TEXT,
    "bankRef" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "grossProceedsUsd" DECIMAL(20,6) NOT NULL,
    "totalDeductionsUsd" DECIMAL(20,6) NOT NULL,
    "companyFeeUsd" DECIMAL(20,6) NOT NULL,
    "companyFeePercent" DECIMAL(10,6) NOT NULL,
    "netRemittanceUsd" DECIMAL(20,6) NOT NULL,
    "lmePriceUsed" DECIMAL(20,6) NOT NULL,
    "statementPdfUrl" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "remittanceStatus" "RemittanceStatus" NOT NULL DEFAULT 'PENDING',
    "remittanceSentAt" TIMESTAMP(3),

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lme_price_records" (
    "id" TEXT NOT NULL,
    "priceUsdPerTroyOz" DECIMAL(20,6) NOT NULL,
    "priceType" "LmePriceType" NOT NULL,
    "source" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lme_price_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_reports" (
    "id" TEXT NOT NULL,
    "reportType" "RegulatoryReportType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filePath" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "notes" TEXT,

    CONSTRAINT "regulatory_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_agentId_idx" ON "users"("agentId");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "agents_licenceNo_key" ON "agents"("licenceNo");

-- CreateIndex
CREATE INDEX "agents_countryCode_idx" ON "agents"("countryCode");

-- CreateIndex
CREATE INDEX "agents_kycStatus_idx" ON "agents"("kycStatus");

-- CreateIndex
CREATE INDEX "agents_isActive_idx" ON "agents"("isActive");

-- CreateIndex
CREATE INDEX "clients_assignedAgentId_idx" ON "clients"("assignedAgentId");

-- CreateIndex
CREATE INDEX "clients_kycStatus_idx" ON "clients"("kycStatus");

-- CreateIndex
CREATE INDEX "clients_sanctionsStatus_idx" ON "clients"("sanctionsStatus");

-- CreateIndex
CREATE INDEX "clients_riskRating_idx" ON "clients"("riskRating");

-- CreateIndex
CREATE INDEX "clients_countryCode_idx" ON "clients"("countryCode");

-- CreateIndex
CREATE INDEX "clients_isPEP_idx" ON "clients"("isPEP");

-- CreateIndex
CREATE INDEX "kyc_records_clientId_idx" ON "kyc_records"("clientId");

-- CreateIndex
CREATE INDEX "kyc_records_uploadedBy_idx" ON "kyc_records"("uploadedBy");

-- CreateIndex
CREATE INDEX "kyc_records_approvedBy_idx" ON "kyc_records"("approvedBy");

-- CreateIndex
CREATE INDEX "kyc_records_status_idx" ON "kyc_records"("status");

-- CreateIndex
CREATE INDEX "kyc_records_documentType_idx" ON "kyc_records"("documentType");

-- CreateIndex
CREATE INDEX "sanctions_screenings_clientId_idx" ON "sanctions_screenings"("clientId");

-- CreateIndex
CREATE INDEX "sanctions_screenings_screenedBy_idx" ON "sanctions_screenings"("screenedBy");

-- CreateIndex
CREATE INDEX "sanctions_screenings_outcome_idx" ON "sanctions_screenings"("outcome");

-- CreateIndex
CREATE INDEX "sanctions_screenings_screenedAt_idx" ON "sanctions_screenings"("screenedAt");

-- CreateIndex
CREATE INDEX "refineries_countryCode_idx" ON "refineries"("countryCode");

-- CreateIndex
CREATE INDEX "refineries_lbmaAccredited_idx" ON "refineries"("lbmaAccredited");

-- CreateIndex
CREATE INDEX "transactions_clientId_idx" ON "transactions"("clientId");

-- CreateIndex
CREATE INDEX "transactions_agentId_idx" ON "transactions"("agentId");

-- CreateIndex
CREATE INDEX "transactions_status_idx" ON "transactions"("status");

-- CreateIndex
CREATE INDEX "transactions_phase_idx" ON "transactions"("phase");

-- CreateIndex
CREATE INDEX "transactions_countryCode_idx" ON "transactions"("countryCode");

-- CreateIndex
CREATE INDEX "transactions_createdBy_idx" ON "transactions"("createdBy");

-- CreateIndex
CREATE INDEX "transactions_priceLockedBy_idx" ON "transactions"("priceLockedBy");

-- CreateIndex
CREATE INDEX "transactions_assignedRefineryId_idx" ON "transactions"("assignedRefineryId");

-- CreateIndex
CREATE INDEX "transactions_createdAt_idx" ON "transactions"("createdAt");

-- CreateIndex
CREATE INDEX "phase_history_transactionId_idx" ON "phase_history"("transactionId");

-- CreateIndex
CREATE INDEX "phase_history_enteredBy_idx" ON "phase_history"("enteredBy");

-- CreateIndex
CREATE INDEX "phase_history_phase_idx" ON "phase_history"("phase");

-- CreateIndex
CREATE INDEX "phase_history_slaBreach_idx" ON "phase_history"("slaBreach");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storageKey_key" ON "documents"("storageKey");

-- CreateIndex
CREATE INDEX "documents_transactionId_idx" ON "documents"("transactionId");

-- CreateIndex
CREATE INDEX "documents_clientId_idx" ON "documents"("clientId");

-- CreateIndex
CREATE INDEX "documents_uploadedBy_idx" ON "documents"("uploadedBy");

-- CreateIndex
CREATE INDEX "documents_approvedBy_idx" ON "documents"("approvedBy");

-- CreateIndex
CREATE INDEX "documents_documentType_idx" ON "documents"("documentType");

-- CreateIndex
CREATE INDEX "documents_approvalStatus_idx" ON "documents"("approvalStatus");

-- CreateIndex
CREATE INDEX "documents_isDeleted_idx" ON "documents"("isDeleted");

-- CreateIndex
CREATE INDEX "cost_items_transactionId_idx" ON "cost_items"("transactionId");

-- CreateIndex
CREATE INDEX "cost_items_category_idx" ON "cost_items"("category");

-- CreateIndex
CREATE INDEX "disbursements_transactionId_idx" ON "disbursements"("transactionId");

-- CreateIndex
CREATE INDEX "disbursements_agentId_idx" ON "disbursements"("agentId");

-- CreateIndex
CREATE INDEX "disbursements_approvedBy_idx" ON "disbursements"("approvedBy");

-- CreateIndex
CREATE INDEX "disbursements_status_idx" ON "disbursements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "disbursements_transactionId_trancheNo_key" ON "disbursements"("transactionId", "trancheNo");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_transactionId_key" ON "settlements"("transactionId");

-- CreateIndex
CREATE INDEX "settlements_approvedBy_idx" ON "settlements"("approvedBy");

-- CreateIndex
CREATE INDEX "settlements_remittanceStatus_idx" ON "settlements"("remittanceStatus");

-- CreateIndex
CREATE INDEX "lme_price_records_recordedAt_idx" ON "lme_price_records"("recordedAt");

-- CreateIndex
CREATE INDEX "lme_price_records_priceType_idx" ON "lme_price_records"("priceType");

-- CreateIndex
CREATE UNIQUE INDEX "lme_price_records_recordedAt_priceType_key" ON "lme_price_records"("recordedAt", "priceType");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_events_userId_idx" ON "audit_events"("userId");

-- CreateIndex
CREATE INDEX "audit_events_action_idx" ON "audit_events"("action");

-- CreateIndex
CREATE INDEX "audit_events_createdAt_idx" ON "audit_events"("createdAt");

-- CreateIndex
CREATE INDEX "regulatory_reports_reportType_idx" ON "regulatory_reports"("reportType");

-- CreateIndex
CREATE INDEX "regulatory_reports_periodStart_periodEnd_idx" ON "regulatory_reports"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "regulatory_reports_generatedBy_idx" ON "regulatory_reports"("generatedBy");

-- CreateIndex
CREATE INDEX "regulatory_reports_submittedBy_idx" ON "regulatory_reports"("submittedBy");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions_screenings" ADD CONSTRAINT "sanctions_screenings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions_screenings" ADD CONSTRAINT "sanctions_screenings_screenedBy_fkey" FOREIGN KEY ("screenedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_priceLockedBy_fkey" FOREIGN KEY ("priceLockedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_assignedRefineryId_fkey" FOREIGN KEY ("assignedRefineryId") REFERENCES "refineries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_history" ADD CONSTRAINT "phase_history_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_history" ADD CONSTRAINT "phase_history_enteredBy_fkey" FOREIGN KEY ("enteredBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_reports" ADD CONSTRAINT "regulatory_reports_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_reports" ADD CONSTRAINT "regulatory_reports_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
