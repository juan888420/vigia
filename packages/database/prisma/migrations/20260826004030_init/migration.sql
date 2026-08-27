-- CreateEnum
CREATE TYPE "ContractStage" AS ENUM ('PRECONTRACTUAL', 'CONTRACTUAL', 'POSTCONTRACTUAL');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('AMENDMENT', 'ADDITION', 'EXTENSION', 'SUSPENSION', 'RESUMPTION', 'TERMINATION', 'LIQUIDATION');

-- CreateEnum
CREATE TYPE "BudgetRecordType" AS ENUM ('CDP', 'RP');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REGISTERED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GuaranteeType" AS ENUM ('CUMPLIMIENTO', 'RESPONSABILIDAD_CIVIL', 'SALARIOS_PRESTACIONES', 'ESTABILIDAD_OBRA', 'ANTICIPO', 'CALIDAD', 'OTRA');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('MANUAL', 'AI_SUGGESTED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "offices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "ContractStage" NOT NULL,
    "fileLabel" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requirements" (
    "id" TEXT NOT NULL,
    "contractTypeId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "appliesToEachPayment" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_requirement_overrides" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_requirement_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "contractTypeId" TEXT NOT NULL,
    "parentContractId" TEXT,
    "number" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "contractor" TEXT,
    "contractorId" TEXT,
    "supervisor" TEXT,
    "initialValue" DECIMAL(15,2) NOT NULL,
    "initialTermDays" INTEGER,
    "signatureDate" DATE,
    "startDate" DATE,
    "initialEndDate" DATE,
    "advanceValue" DECIMAL(15,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_records" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "BudgetRecordType" NOT NULL,
    "number" TEXT NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "issuedAt" DATE,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_events" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "sequenceNumber" INTEGER,
    "eventDate" DATE NOT NULL,
    "valueDelta" DECIMAL(15,2),
    "daysDelta" INTEGER,
    "startDate" DATE,
    "endDate" DATE,
    "relatedEventId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "actDate" DATE,
    "paidAt" DATE,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REGISTERED',
    "isAdvance" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guarantees" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "coversEventId" TEXT,
    "type" "GuaranteeType" NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "insurer" TEXT,
    "insuredValue" DECIMAL(15,2),
    "validFrom" DATE,
    "validUntil" DATE,
    "approvedAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guarantees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_documents" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentTypeId" TEXT,
    "paymentId" TEXT,
    "eventId" TEXT,
    "guaranteeId" TEXT,
    "originalFileName" TEXT NOT NULL,
    "standardizedName" TEXT,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "contentHash" TEXT,
    "source" "DocumentSource" NOT NULL DEFAULT 'MANUAL',
    "aiConfidence" DECIMAL(3,2),
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "eventId" TEXT,
    "paymentId" TEXT,
    "guaranteeId" TEXT,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "dismissedReason" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_officeId_idx" ON "users"("officeId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_types_code_key" ON "contract_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- CreateIndex
CREATE INDEX "document_types_stage_idx" ON "document_types"("stage");

-- CreateIndex
CREATE INDEX "document_requirements_contractTypeId_idx" ON "document_requirements"("contractTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "document_requirements_contractTypeId_documentTypeId_key" ON "document_requirements"("contractTypeId", "documentTypeId");

-- CreateIndex
CREATE INDEX "contract_requirement_overrides_contractId_idx" ON "contract_requirement_overrides"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_requirement_overrides_contractId_requirementId_key" ON "contract_requirement_overrides"("contractId", "requirementId");

-- CreateIndex
CREATE INDEX "contracts_officeId_idx" ON "contracts"("officeId");

-- CreateIndex
CREATE INDEX "contracts_parentContractId_idx" ON "contracts"("parentContractId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_officeId_normalizedNumber_key" ON "contracts"("officeId", "normalizedNumber");

-- CreateIndex
CREATE INDEX "budget_records_contractId_idx" ON "budget_records"("contractId");

-- CreateIndex
CREATE INDEX "contract_events_contractId_type_idx" ON "contract_events"("contractId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "contract_events_contractId_type_sequenceNumber_key" ON "contract_events"("contractId", "type", "sequenceNumber");

-- CreateIndex
CREATE INDEX "payments_contractId_idx" ON "payments"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_contractId_sequenceNumber_key" ON "payments"("contractId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "guarantees_contractId_idx" ON "guarantees"("contractId");

-- CreateIndex
CREATE INDEX "guarantees_coversEventId_idx" ON "guarantees"("coversEventId");

-- CreateIndex
CREATE INDEX "contract_documents_contractId_idx" ON "contract_documents"("contractId");

-- CreateIndex
CREATE INDEX "contract_documents_contractId_documentTypeId_idx" ON "contract_documents"("contractId", "documentTypeId");

-- CreateIndex
CREATE INDEX "contract_documents_paymentId_idx" ON "contract_documents"("paymentId");

-- CreateIndex
CREATE INDEX "contract_documents_contentHash_idx" ON "contract_documents"("contentHash");

-- CreateIndex
CREATE INDEX "alerts_contractId_status_idx" ON "alerts"("contractId", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_contractTypeId_fkey" FOREIGN KEY ("contractTypeId") REFERENCES "contract_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_requirement_overrides" ADD CONSTRAINT "contract_requirement_overrides_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_requirement_overrides" ADD CONSTRAINT "contract_requirement_overrides_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "document_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_contractTypeId_fkey" FOREIGN KEY ("contractTypeId") REFERENCES "contract_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_parentContractId_fkey" FOREIGN KEY ("parentContractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_records" ADD CONSTRAINT "budget_records_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_records" ADD CONSTRAINT "budget_records_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "contract_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_relatedEventId_fkey" FOREIGN KEY ("relatedEventId") REFERENCES "contract_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantees" ADD CONSTRAINT "guarantees_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantees" ADD CONSTRAINT "guarantees_coversEventId_fkey" FOREIGN KEY ("coversEventId") REFERENCES "contract_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "contract_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_guaranteeId_fkey" FOREIGN KEY ("guaranteeId") REFERENCES "guarantees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "contract_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_guaranteeId_fkey" FOREIGN KEY ("guaranteeId") REFERENCES "guarantees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
