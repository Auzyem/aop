-- AlterTable: add GDPR/POPIA deletion request timestamp to clients
-- Safe: nullable column addition requires no backfill and no lock on existing rows

ALTER TABLE "clients" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
